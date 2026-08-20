import {
	BufferTarget,
	Conversion,
	ConversionCanceledError,
	FlacOutputFormat,
	Mp4OutputFormat,
	MkvOutputFormat,
	MovOutputFormat,
	Mp3OutputFormat,
	OggOutputFormat,
	Output,
	Quality,
	StreamTarget,
	WavOutputFormat,
	WebMOutputFormat,
	type OutputFormat,
	type Target,
} from "mediabunny";
import type { AudioCodec, VideoCodec } from "../document/types.ts";
import {
	audioExtensionFor,
	ensureExtension,
	videoExtensionFor,
	type ContainerFormat,
} from "./codecs.ts";
import { toMediabunnyAudioCodec, toMediabunnyVideoCodec } from "./probe.ts";
import { MediaError } from "./types.ts";
import type { OpenedInput } from "./input.ts";

/**
 * The writing side of the facade (I3).
 *
 * Two destinations, one code path: a stream straight to disk where the browser
 * supports it, an in-memory buffer everywhere else. The caller never picks —
 * `createTarget` decides from what the environment can do.
 */

export type ExportDestination =
	| { readonly kind: "stream"; readonly handle: FileSystemFileHandle }
	| { readonly kind: "buffer" };

export type ExportProgress = {
	readonly ratio: number;
	readonly processedSec: number;
};

export type ExportResult = {
	/** Null when the output streamed straight to disk. */
	readonly blob: Blob | null;
	readonly bytes: number;
};

export function outputFormatFor(container: ContainerFormat): OutputFormat {
	switch (container) {
		case "mp4":
			// Fast start puts the metadata first, which is what makes a file
			// playable while it is still downloading.
			return new Mp4OutputFormat({ fastStart: "in-memory" });
		case "mov":
			return new MovOutputFormat({ fastStart: "in-memory" });
		case "mkv":
			return new MkvOutputFormat();
		case "webm":
			return new WebMOutputFormat();
		case "ogg":
			return new OggOutputFormat();
		case "mp3":
			return new Mp3OutputFormat();
		case "wav":
			return new WavOutputFormat();
		case "flac":
			return new FlacOutputFormat();
		case "aac":
			return new MkvOutputFormat();
	}
}

export async function createTarget(destination: ExportDestination): Promise<Target> {
	if (destination.kind === "buffer") return new BufferTarget();

	const writable = await destination.handle.createWritable();
	return new StreamTarget(
		new WritableStream({
			write: (chunk) =>
				writable.write({ type: "write", position: chunk.position, data: chunk.data }),
			close: () => writable.close(),
			abort: () => writable.abort(),
		}),
	);
}

/** Opens the save dialog where the browser has one. Null means cancelled. */
export async function pickSaveDestination(
	suggestedName: string,
	mimeType: string,
	extension: string,
): Promise<ExportDestination | null> {
	const picker = (
		globalThis as unknown as {
			showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
		}
	).showSaveFilePicker;

	if (picker === undefined) return { kind: "buffer" };

	try {
		const handle = await picker({
			suggestedName,
			types: [{ description: extension.toUpperCase(), accept: { [mimeType]: [`.${extension}`] } }],
		});
		return { kind: "stream", handle };
	} catch {
		// The user dismissed the dialog; that is a cancellation, not an error.
		return null;
	}
}

export type ConversionRequest = {
	readonly source: OpenedInput;
	readonly container: ContainerFormat;
	readonly destination: ExportDestination;
	readonly audio?: {
		readonly codec: AudioCodec;
		readonly quality: number;
		readonly sampleRate?: number;
		readonly channels?: number;
	};
	readonly video?: {
		readonly codec: VideoCodec;
		readonly quality: number;
		readonly width?: number;
		readonly height?: number;
		readonly frameRate?: number;
	};
	readonly trim?: { readonly startSec: number; readonly endSec: number };
	readonly onProgress?: (progress: ExportProgress) => void;
	readonly signal?: AbortSignal;
};

/** Maps a 0–1 slider onto Mediabunny's quality scale. */
export function qualityFrom(value: number): Quality {
	return new Quality(Math.min(1, Math.max(0, value)));
}

/**
 * The lossless path: remux and re-encode only what has to be.
 *
 * Anything that does not touch pixels or samples comes here, so converting a
 * container never costs a generation of quality.
 */
export async function runConversion(request: ConversionRequest): Promise<ExportResult> {
	if (request.audio !== undefined) {
		await ensureExtension(audioExtensionFor(request.audio.codec));
	}
	if (request.video !== undefined) {
		await ensureExtension(videoExtensionFor(request.video.codec));
	}

	const target = await createTarget(request.destination);
	const output = new Output({ format: outputFormatFor(request.container), target });

	const conversion = await Conversion.init({
		input: request.source.input,
		output,
		...(request.video === undefined
			? {}
			: {
					video: {
						codec: toMediabunnyVideoCodec(request.video.codec),
						// `quality` rather than a bitrate field: v1.52 deprecated those.
						bitrate: qualityFrom(request.video.quality),
						...(request.video.width === undefined ? {} : { width: request.video.width }),
						...(request.video.height === undefined ? {} : { height: request.video.height }),
						...(request.video.frameRate === undefined
							? {}
							: { frameRate: request.video.frameRate }),
					},
				}),
		...(request.audio === undefined
			? {}
			: {
					audio: {
						codec: toMediabunnyAudioCodec(request.audio.codec),
						bitrate: qualityFrom(request.audio.quality),
						...(request.audio.sampleRate === undefined
							? {}
							: { sampleRate: request.audio.sampleRate }),
						...(request.audio.channels === undefined
							? {}
							: { numberOfChannels: request.audio.channels }),
					},
				}),
		...(request.trim === undefined
			? {}
			: { trim: { start: request.trim.startSec, end: request.trim.endSec } }),
	});

	if (request.onProgress !== undefined) {
		conversion.onProgress = (ratio, processedSec) => {
			request.onProgress?.({ ratio, processedSec });
		};
	}

	// Cancellation is part of the contract of every long task, not an addition.
	const onAbort = () => {
		void conversion.cancel();
	};
	request.signal?.addEventListener("abort", onAbort, { once: true });

	try {
		await conversion.execute();
	} catch (cause) {
		if (cause instanceof ConversionCanceledError) throw cause;
		throw new MediaError(
			cause instanceof Error ? cause.message : String(cause),
			"encode",
			`${request.container}/${request.audio?.codec ?? request.video?.codec ?? "copy"}`,
		);
	} finally {
		request.signal?.removeEventListener("abort", onAbort);
	}

	const buffer = target instanceof BufferTarget ? target.buffer : null;
	if (buffer === null) return { blob: null, bytes: 0 };

	const blob = new Blob([buffer], { type: await output.getMimeType() });
	return { blob, bytes: blob.size };
}

export { ConversionCanceledError };
