import { useEffect, useRef } from "react";
import type { GifDocument } from "~/core/document";
import { RenderGraph, computeOutputSize, type RenderSpec } from "~/core/render";

export type GifPreviewProps = {
	document: GifDocument;
	bitmap: ImageBitmap | undefined;
};

/**
 * The GIF preview.
 *
 * Runs through the very same render graph as the export, so a filter looks in
 * the preview exactly as it will land in the file (I1). The graph is kept alive
 * across frames rather than rebuilt: a new GL context per frame at 25 fps would
 * be pathological.
 */
export function GifPreview({ document: document_, bitmap }: GifPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const graphRef = useRef<RenderGraph | null>(null);
	const frameRef = useRef<number | null>(null);

	const size = computeOutputSize(
		document_.sourceWidth,
		document_.sourceHeight,
		document_.crop,
		document_.rotation,
		document_.resize,
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || bitmap === undefined) return;

		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			try {
				graphRef.current ??= new RenderGraph(canvas);
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
				graphRef.current.render(spec);
			} catch {
				// A failed render must not take the editor down with it; the
				// canvas simply keeps the last good frame.
			}
		});

		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		};
	}, [bitmap, document_]);

	useEffect(
		() => () => {
			graphRef.current?.dispose();
			graphRef.current = null;
		},
		[],
	);

	return (
		<canvas
			ref={canvasRef}
			width={size.width}
			height={size.height}
			className="block h-full w-full"
		/>
	);
}
