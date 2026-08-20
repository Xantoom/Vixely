import { AudioBufferSource, BufferTarget, Output } from "mediabunny";
import type { AudioCodec } from "../document/types.ts";
import { audioExtensionFor, ensureExtension, type ContainerFormat } from "./codecs.ts";
import {
	createTarget,
	outputFormatFor,
	qualityFrom,
	type ExportDestination,
	type ExportResult,
} from "./output.ts";
import { toMediabunnyAudioCodec } from "./probe.ts";
import { MediaError } from "./types.ts";

/**
 * Encodes already-processed samples.
 *
 * This is the manual path for audio: when the document changes the samples,
 * `Conversion` cannot be used because it reads from the source file. The render
 * chain produces an `AudioBuffer`, and this writes it into the chosen
 * container.
 */
export type EncodeAudioRequest = {
	readonly buffer: AudioBuffer;
	readonly container: ContainerFormat;
	readonly codec: AudioCodec;
	readonly quality: number;
	readonly destination: ExportDestination;
	readonly onProgress?: (ratio: number) => void;
	readonly signal?: AbortSignal;
};

export async function encodeAudioBuffer(request: EncodeAudioRequest): Promise<ExportResult> {
	await ensureExtension(audioExtensionFor(request.codec));

	const target = await createTarget(request.destination);
	const output = new Output({ format: outputFormatFor(request.container), target });

	const source = new AudioBufferSource({
		codec: toMediabunnyAudioCodec(request.codec),
		quality: qualityFrom(request.quality),
	});
	output.addAudioTrack(source);

	try {
		await output.start();
		if (request.signal?.aborted === true) {
			await output.cancel();
			throw new MediaError("cancelled", "encode");
		}

		await source.add(request.buffer);
		request.onProgress?.(1);
		source.close();
		await output.finalize();
	} catch (cause) {
		if (output.state !== "finalized") await output.cancel().catch(() => undefined);
		throw cause instanceof MediaError
			? cause
			: new MediaError(
					cause instanceof Error ? cause.message : String(cause),
					"encode",
					`${request.container}/${request.codec}`,
				);
	}

	// A stream target wrote straight to disk and has nothing to hand back.
	const buffer = target instanceof BufferTarget ? target.buffer : null;
	if (buffer === null) return { blob: null, bytes: 0 };

	const blob = new Blob([buffer], { type: await output.getMimeType() });
	return { blob, bytes: blob.size };
}
