import {
	BufferTarget,
	CanvasSource,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	Output,
	VideoSampleSink,
	type AudioCodec as MbAudioCodec,
} from "mediabunny";
import type { VideoDocument } from "../document/types.ts";
import { release } from "../resources/index.ts";
import {
	computeOutputSize,
	RenderGraph,
	renderTextLayers,
	type RenderSpec,
} from "../render/index.ts";
import { audioExtensionFor, ensureExtension, type ContainerFormat } from "./codecs.ts";
import type { OpenedInput } from "./input.ts";
import {
	createTarget,
	outputFormatFor,
	qualityFrom,
	type ExportDestination,
	type ExportResult,
} from "./output.ts";
import { toMediabunnyVideoCodec } from "./probe.ts";
import { MediaError } from "./types.ts";

/**
 * The manual video export path: decode → render graph → encode.
 *
 * This is the export half of I1. The preview draws each decoded frame through
 * `core/render`; so does this, with the same spec, and the only difference is
 * that the destination is an encoder rather than a screen. Handing the source
 * file to `Conversion` instead would re-encode the *original* pixels and
 * silently discard every filter, crop, rotation and text layer.
 */

export type VideoRenderRequest = {
	readonly document: VideoDocument;
	readonly source: OpenedInput;
	readonly container: ContainerFormat;
	readonly destination: ExportDestination;
	/** Subtitles rendered per frame, when they are being burnt into the picture. */
	readonly subtitleOverlayAt?: ((timeSec: number) => OffscreenCanvas | null) | undefined;
	readonly onProgress?: ((ratio: number) => void) | undefined;
	readonly signal?: AbortSignal | undefined;
};

export async function renderAndEncodeVideo(request: VideoRenderRequest): Promise<ExportResult> {
	const { document: doc, source } = request;

	const videoTrack =
		(await source.input.getPrimaryVideoTrack()) ?? (await source.input.getVideoTracks())[0];
	if (videoTrack === undefined) {
		throw new MediaError("this file carries no video track", "encode");
	}

	const specTemplate = baseSpec(doc);
	const size = computeOutputSize(
		doc.sourceWidth,
		doc.sourceHeight,
		doc.crop,
		doc.rotation,
		doc.export.width === null || doc.export.height === null
			? null
			: { width: doc.export.width, height: doc.export.height },
	);

	const canvas = new OffscreenCanvas(size.width, size.height);
	const graph = new RenderGraph(canvas);

	const target = await createTarget(request.destination);
	const output = new Output({ format: outputFormatFor(request.container), target });

	const videoSource = new CanvasSource(canvas, {
		codec: toMediabunnyVideoCodec(doc.export.codec),
		quality: qualityFrom(doc.export.quality),
		...(doc.export.keyframeIntervalSec > 0
			? { keyFrameInterval: doc.export.keyframeIntervalSec }
			: {}),
	});
	output.addVideoTrack(videoSource);

	// Audio rides along as already-encoded packets: re-encoding sound that
	// nothing asked to change would cost a generation of quality for nothing.
	const audioPassthrough = await prepareAudioPassthrough(source, doc, output);

	const sink = new VideoSampleSink(videoTrack);
	const textCache: { current: OffscreenCanvas | null } = { current: null };
	const startSec = doc.trimStartSec;
	const endSec = doc.trimEndSec;
	const span = Math.max(0.001, endSec - startSec);

	try {
		await output.start();
		await audioPassthrough?.run();

		for await (const sample of sink.samples(startSec, endSec)) {
			if (request.signal?.aborted === true) {
				sample.close();
				await output.cancel();
				throw new MediaError("cancelled", "encode");
			}

			const frame = sample.toVideoFrame();
			try {
				const overlay = buildOverlay(
					doc,
					size,
					textCache,
					request.subtitleOverlayAt?.(sample.timestamp) ?? null,
				);
				graph.render(
					overlay === null
						? { ...specTemplate, source: { kind: "frame", frame } }
						: {
								...specTemplate,
								source: { kind: "frame", frame },
								overlay: { kind: "canvas", canvas: overlay },
							},
				);

				// Timestamps are rebased on the trim, so the output starts at zero.
				await videoSource.add(
					Math.max(0, sample.timestamp - startSec),
					sample.duration > 0 ? sample.duration : 1 / 30,
				);
			} finally {
				release(frame, "VideoFrame");
				sample.close();
			}

			request.onProgress?.(Math.min(1, (sample.timestamp - startSec) / span));
		}

		videoSource.close();
		audioPassthrough?.close();
		await output.finalize();
	} catch (cause) {
		if (output.state !== "finalized") await output.cancel().catch(() => undefined);
		throw cause instanceof MediaError
			? cause
			: new MediaError(
					cause instanceof Error ? cause.message : String(cause),
					"encode",
					`${request.container}/${doc.export.codec}`,
				);
	} finally {
		graph.dispose();
	}

	const buffer = target instanceof BufferTarget ? target.buffer : null;
	if (buffer === null) return { blob: null, bytes: 0 };

	const blob = new Blob([buffer], { type: await output.getMimeType() });
	return { blob, bytes: blob.size };
}

/** The render spec, minus the frame, which changes on every iteration. */
function baseSpec(doc: VideoDocument): Omit<RenderSpec, "source"> {
	return {
		sourceWidth: doc.sourceWidth,
		sourceHeight: doc.sourceHeight,
		crop: doc.crop,
		rotation: doc.rotation,
		flipHorizontal: false,
		flipVertical: false,
		resize:
			doc.export.width === null || doc.export.height === null
				? null
				: { width: doc.export.width, height: doc.export.height },
		filters: doc.filters,
		textLayers: doc.textLayers,
		overlay: null,
		bypassFilters: false,
	};
}

/** Text layers and burnt-in subtitles share one overlay texture. */
function buildOverlay(
	doc: VideoDocument,
	size: { width: number; height: number },
	cache: { current: OffscreenCanvas | null },
	subtitleCanvas: OffscreenCanvas | null,
): OffscreenCanvas | null {
	if (doc.textLayers.length === 0) return subtitleCanvas;

	const textCanvas = renderTextLayers(
		doc.textLayers,
		size.width,
		size.height,
		cache.current ?? undefined,
	);
	if (textCanvas === null) return subtitleCanvas;
	cache.current = textCanvas;

	if (subtitleCanvas === null) return textCanvas;

	// Both go into the same texture rather than costing two composite passes.
	const context = textCanvas.getContext("2d");
	context?.drawImage(subtitleCanvas, 0, 0);
	return textCanvas;
}

/**
 * Copies the enabled audio tracks across as encoded packets.
 *
 * Tracks the document disabled are simply not added, which is what makes the
 * track switches in the interface mean something at export time.
 */
async function prepareAudioPassthrough(
	source: OpenedInput,
	doc: VideoDocument,
	output: Output,
): Promise<{ run: () => Promise<void>; close: () => void } | null> {
	const tracks = await source.input.getAudioTracks();
	// One audio track for now: a multi-track output needs the muxer path, which
	// is what the embed branch of the editor already uses.
	const first = tracks.find((track) => {
		const selection = doc.audioTracks.find((candidate) => candidate.trackId === track.id);
		return selection === undefined ? true : selection.enabled && selection.action !== "drop";
	});
	if (first === undefined || first.codec === null) return null;

	await ensureExtension(audioExtensionFor(first.codec as never));
	const packetSource = new EncodedAudioPacketSource(first.codec as MbAudioCodec);
	output.addAudioTrack(packetSource);

	const sink = new EncodedPacketSink(first);
	const config = await first.getDecoderConfig();

	return {
		run: async () => {
			let firstPacket = true;
			for await (const packet of sink.packets()) {
				if (packet.timestamp < doc.trimStartSec) continue;
				if (packet.timestamp > doc.trimEndSec) break;

				// Rebased like the video, so the two stay in sync after a trim.
				const shifted = packet.clone({
					timestamp: Math.max(0, packet.timestamp - doc.trimStartSec),
				});
				await packetSource.add(
					shifted,
					firstPacket && config !== null ? { decoderConfig: config } : undefined,
				);
				firstPacket = false;
			}
		},
		close: () => packetSource.close(),
	};
}
