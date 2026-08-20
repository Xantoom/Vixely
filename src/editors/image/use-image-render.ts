import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageDocument } from "~/core/document";
import {
	computeOutputSize,
	RenderGraph,
	renderTextLayers,
	type OutputSize,
	type RenderSpec,
} from "~/core/render";

export type ImageRenderResult = {
	readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
	readonly size: OutputSize;
	readonly error: string | null;
	/** Renders the current document into an offscreen graph, for export. */
	readonly renderToPixels: () => Promise<ImageData>;
};

/**
 * Drives the render graph from a document.
 *
 * Renders are coalesced on `requestAnimationFrame`: ten parameter changes in
 * one frame produce one render, not ten.
 */
export function useImageRender(
	document_: ImageDocument | null,
	bitmap: ImageBitmap | null,
	bypassFilters = false,
): ImageRenderResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const graphRef = useRef<RenderGraph | null>(null);
	// The element the current graph is bound to. A conditionally mounted canvas
	// (compare mode) is a *different* element each time it comes back, and a
	// graph left bound to the detached one renders into nothing.
	const boundCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const textCanvasRef = useRef<OffscreenCanvas | null>(null);
	const frameRef = useRef<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const spec = useMemo<RenderSpec | null>(() => {
		if (document_ === null || bitmap === null) return null;
		return {
			source: { kind: "bitmap", bitmap },
			sourceWidth: document_.sourceWidth,
			sourceHeight: document_.sourceHeight,
			crop: document_.crop,
			rotation: document_.rotation,
			flipHorizontal: document_.flipHorizontal,
			flipVertical: document_.flipVertical,
			resize: document_.resize,
			filters: document_.filters,
			textLayers: document_.textLayers,
			overlay: null,
			bypassFilters,
		};
	}, [document_, bitmap, bypassFilters]);

	// Derived from the pure geometry helper, never from the graph: reading a
	// ref during render would make the size lag one commit behind.
	const size = useMemo<OutputSize>(() => {
		if (spec === null) return { width: 1, height: 1 };
		return computeOutputSize(
			spec.sourceWidth,
			spec.sourceHeight,
			spec.crop,
			spec.rotation,
			spec.resize,
		);
	}, [spec]);

	// One effect owns the GL context and the draw. The context is created
	// lazily inside the animation frame, so a failure surfaces as state
	// without a synchronous set during the effect.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || spec === null) return;

		// Ten parameter changes in one frame produce one render, not ten.
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			try {
				if (graphRef.current !== null && boundCanvasRef.current !== canvas) {
					graphRef.current.dispose();
					graphRef.current = null;
				}
				if (graphRef.current === null) {
					graphRef.current = new RenderGraph(canvas);
					boundCanvasRef.current = canvas;
				}
				const graph = graphRef.current;
				const output = graph.outputSize(spec);
				const overlay = buildOverlay(spec, output, textCanvasRef);
				graph.render(overlay === null ? spec : { ...spec, overlay });
				setError(null);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		});

		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		};
	}, [spec]);

	// The context outlives every render; it is only released on unmount.
	useEffect(
		() => () => {
			graphRef.current?.dispose();
			graphRef.current = null;
			boundCanvasRef.current = null;
		},
		[],
	);

	const renderToPixels = useMemo(
		() => async (): Promise<ImageData> => {
			if (spec === null) throw new Error("nothing to export");
			// Export uses a dedicated context but the very same graph code (I1).
			const offscreen = new OffscreenCanvas(1, 1);
			const graph = new RenderGraph(offscreen);
			try {
				const output = graph.outputSize(spec);
				const overlay = buildOverlay(spec, output, { current: null });
				const rendered = graph.render(overlay === null ? spec : { ...spec, overlay });
				const pixels = graph.readPixels(rendered);
				return new ImageData(pixels, rendered.width, rendered.height);
			} finally {
				graph.dispose();
			}
		},
		[spec],
	);

	return { canvasRef, size, error, renderToPixels };
}

function buildOverlay(
	spec: RenderSpec,
	output: OutputSize,
	cache: { current: OffscreenCanvas | null },
): RenderSpec["overlay"] {
	if (spec.textLayers.length === 0) return null;
	const canvas = renderTextLayers(
		spec.textLayers,
		output.width,
		output.height,
		cache.current ?? undefined,
	);
	if (canvas === null) return null;
	cache.current = canvas;
	return { kind: "canvas", canvas };
}
