import { useEffect, useRef } from "react";
import type { VideoDocument } from "~/core/document";
import { computeOutputSize, RenderGraph, renderTextLayers, type RenderSpec } from "~/core/render";

export type VideoPreviewProps = {
	document: VideoDocument;
	frame: VideoFrame | null;
	/** Rendered subtitles entering the graph as a texture, never as CSS. */
	overlay?: OffscreenCanvas | null;
};

/**
 * The video preview.
 *
 * Fed by decoded `VideoFrame`s and rendered through the same graph as the
 * export (I1). Subtitles come in as a texture through the `[subs]` pass rather
 * than as a CSS layer on top — an overlay would be a second render path for the
 * same visual result, which is structurally the bug the previous iteration
 * shipped with filters.
 */
export function VideoPreview({ document: document_, frame, overlay = null }: VideoPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const graphRef = useRef<RenderGraph | null>(null);
	const textCanvasRef = useRef<OffscreenCanvas | null>(null);

	const size = computeOutputSize(
		document_.sourceWidth,
		document_.sourceHeight,
		document_.crop,
		document_.rotation,
		null,
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || frame === null) return;

		try {
			graphRef.current ??= new RenderGraph(canvas);
			const graph = graphRef.current;

			const base: RenderSpec = {
				source: { kind: "frame", frame },
				sourceWidth: document_.sourceWidth,
				sourceHeight: document_.sourceHeight,
				crop: document_.crop,
				rotation: document_.rotation,
				flipHorizontal: false,
				flipVertical: false,
				resize: null,
				filters: document_.filters,
				textLayers: document_.textLayers,
				overlay: null,
				bypassFilters: false,
			};

			const output = graph.outputSize(base);
			// Text layers and subtitles share one overlay texture: two composite
			// passes for two kinds of text would be a needless round trip.
			const textCanvas =
				document_.textLayers.length === 0
					? null
					: renderTextLayers(
							document_.textLayers,
							output.width,
							output.height,
							textCanvasRef.current ?? undefined,
						);
			if (textCanvas !== null) textCanvasRef.current = textCanvas;

			const composited = overlay ?? textCanvas;
			graph.render(
				composited === null ? base : { ...base, overlay: { kind: "canvas", canvas: composited } },
			);
		} catch {
			// A failed render keeps the last good frame on screen rather than
			// taking the editor down.
		}
	}, [frame, document_, overlay]);

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
