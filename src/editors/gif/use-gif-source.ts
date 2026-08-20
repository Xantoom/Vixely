import { useEffect, useRef, useState } from "react";
import { createGifDocument, type GifDocument } from "~/core/document";
import { decodeGifFrames, encodeGif, estimateGifBytes, imageDecoderAvailable } from "~/core/gif";
import { RenderGraph, renderTextLayers, type RenderSpec } from "~/core/render";

export type GifSourceState = {
	readonly document: GifDocument | null;
	readonly bitmaps: ReadonlyMap<string, ImageBitmap>;
	readonly loading: boolean;
	readonly decodedCount: number;
	readonly error: string | null;
};

/**
 * Decodes a GIF into frames and their delays.
 *
 * Frames arrive one at a time and are kept as `ImageBitmap`s, which live on the
 * GPU rather than in the JS heap — the difference between a 500-frame file
 * being editable and being a 460 MB allocation.
 */
export function useGifSource(file: File | null): GifSourceState {
	const [state, setState] = useState<GifSourceState>({
		document: null,
		bitmaps: new Map(),
		loading: false,
		decodedCount: 0,
		error: null,
	});

	useEffect(() => {
		if (file === null) return;
		let cancelledEarly = false;
		if (!imageDecoderAvailable()) {
			// Queued so the effect does not set state synchronously.
			const handle = setTimeout(() => {
				if (!cancelledEarly) setState((current) => ({ ...current, error: "no-decoder" }));
			}, 0);
			return () => {
				cancelledEarly = true;
				clearTimeout(handle);
			};
		}

		let cancelled = false;
		const controller = new AbortController();
		const bitmaps = new Map<string, ImageBitmap>();

		const load = async () => {
			setState({
				document: null,
				bitmaps: new Map(),
				loading: true,
				decodedCount: 0,
				error: null,
			});

			try {
				const frames: GifDocument["frames"][number][] = [];
				let width = 0;
				let height = 0;

				for await (const frame of decodeGifFrames(file, { signal: controller.signal })) {
					if (cancelled) {
						frame.bitmap.close();
						return;
					}
					const id = `frame-${frame.index}`;
					bitmaps.set(id, frame.bitmap);
					frames.push({ id, sourceIndex: frame.index, delayMs: frame.delayMs });
					width = frame.bitmap.width;
					height = frame.bitmap.height;
					setState((current) => ({ ...current, decodedCount: frames.length }));
				}

				if (cancelled) return;
				if (frames.length === 0) throw new Error("this GIF has no frames");

				setState({
					document: {
						...createGifDocument(
							{
								id: crypto.randomUUID(),
								name: file.name,
								byteLength: file.size,
								mimeType: file.type,
							},
							width,
							height,
						),
						frames,
					},
					bitmaps,
					loading: false,
					decodedCount: frames.length,
					error: null,
				});
			} catch (cause) {
				if (cancelled) return;
				setState((current) => ({
					...current,
					loading: false,
					error: cause instanceof Error ? cause.message : String(cause),
				}));
			}
		};

		void load();

		return () => {
			cancelled = true;
			controller.abort();
			// Bitmaps are explicit resources: leaving 500 of them open is the
			// GPU-side version of the VideoFrame leak (I4).
			for (const bitmap of bitmaps.values()) bitmap.close();
		};
	}, [file]);

	return state;
}

/**
 * Renders every frame through the shared graph and encodes the result.
 *
 * The same `core/render` pass the image editor uses, which is what keeps a
 * filter identical between the two editors instead of drifting into two
 * implementations.
 */
export async function renderAndEncodeGif(
	document_: GifDocument,
	bitmaps: ReadonlyMap<string, ImageBitmap>,
	onProgress: (ratio: number) => void,
	signal?: AbortSignal,
): Promise<Blob> {
	const canvas = new OffscreenCanvas(1, 1);
	const graph = new RenderGraph(canvas);

	try {
		const rendered: { pixels: Uint8ClampedArray; delayMs: number }[] = [];
		let width = 0;
		let height = 0;

		for (const [index, frame] of document_.frames.entries()) {
			if (signal?.aborted === true) throw new Error("cancelled");
			const bitmap = bitmaps.get(frame.id);
			if (bitmap === undefined) continue;

			const spec: RenderSpec = {
				source: { kind: "bitmap", bitmap },
				sourceWidth: document_.sourceWidth,
				sourceHeight: document_.sourceHeight,
				crop: document_.crop,
				rotation: document_.rotation,
				flipHorizontal: false,
				flipVertical: false,
				resize: document_.resize,
				filters: document_.filters,
				textLayers: document_.textLayers,
				overlay: null,
				bypassFilters: false,
			};

			const size = graph.outputSize(spec);
			const overlay = renderTextLayers(document_.textLayers, size.width, size.height);
			const output = graph.render(
				overlay === null ? spec : { ...spec, overlay: { kind: "canvas", canvas: overlay } },
			);

			rendered.push({
				pixels: flipRows(graph.readPixels(output), output.width, output.height),
				delayMs: frame.delayMs,
			});
			width = output.width;
			height = output.height;
			onProgress(((index + 1) / document_.frames.length) * 0.6);
		}

		if (rendered.length === 0) throw new Error("nothing to encode");

		const bytes = encodeGif(
			rendered.map((frame) => ({ pixels: frame.pixels, delayMs: frame.delayMs })),
			{
				width,
				height,
				colors: document_.export.colors,
				dither: document_.export.dither,
				loop: document_.export.loop,
				paletteScope: document_.export.paletteScope,
				alphaThreshold: 128,
				onProgress: (ratio) => onProgress(0.6 + ratio * 0.4),
			},
		);

		return new Blob([bytes], { type: "image/gif" });
	} finally {
		graph.dispose();
	}
}

/** `readPixels` returns rows bottom-up; GIF and ImageData both want top-down. */
function flipRows(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8ClampedArray<ArrayBuffer> {
	const flipped = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
	const rowBytes = width * 4;
	for (let row = 0; row < height; row++) {
		const from = (height - 1 - row) * rowBytes;
		flipped.set(pixels.subarray(from, from + rowBytes), row * rowBytes);
	}
	return flipped;
}

/** Extracts a single frame as a PNG, for the "save this frame" action. */
export async function extractFrame(bitmap: ImageBitmap, document_: GifDocument): Promise<Blob> {
	const graph = new RenderGraph(new OffscreenCanvas(1, 1));
	try {
		const spec: RenderSpec = {
			source: { kind: "bitmap", bitmap },
			sourceWidth: document_.sourceWidth,
			sourceHeight: document_.sourceHeight,
			crop: document_.crop,
			rotation: document_.rotation,
			flipHorizontal: false,
			flipVertical: false,
			resize: document_.resize,
			filters: document_.filters,
			textLayers: document_.textLayers,
			overlay: null,
			bypassFilters: false,
		};
		const size = graph.render(spec);
		const pixels = flipRows(graph.readPixels(size), size.width, size.height);

		const canvas = new OffscreenCanvas(size.width, size.height);
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("no 2D context");
		context.putImageData(new ImageData(pixels, size.width, size.height), 0, 0);
		return canvas.convertToBlob({ type: "image/png" });
	} finally {
		graph.dispose();
	}
}

/** Playback clock for the preview, driven by the per-frame delays. */
export function useGifPlayback(
	frames: readonly { readonly delayMs: number }[],
	playing: boolean,
): number {
	const [index, setIndex] = useState(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!playing || frames.length === 0) return;

		let current = 0;
		const advance = () => {
			current = (current + 1) % frames.length;
			setIndex(current);
			timerRef.current = setTimeout(advance, Math.max(10, frames[current]?.delayMs ?? 100));
		};

		timerRef.current = setTimeout(advance, Math.max(10, frames[0]?.delayMs ?? 100));
		return () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
		};
	}, [playing, frames]);

	return Math.min(index, Math.max(0, frames.length - 1));
}

export { estimateGifBytes };
