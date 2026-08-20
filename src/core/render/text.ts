import type { TextLayer } from "../document/types.ts";

/**
 * Text layers are rasterised into a 2D canvas that enters the graph as a
 * texture. Same canvas for preview and export, so the composite is identical.
 */
export function renderTextLayers(
	layers: readonly TextLayer[],
	width: number,
	height: number,
	target?: OffscreenCanvas,
): OffscreenCanvas | null {
	if (layers.length === 0) return null;

	const canvas = target ?? new OffscreenCanvas(width, height);
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	const context = canvas.getContext("2d");
	if (context === null) return null;
	context.clearRect(0, 0, width, height);

	for (const layer of layers) {
		context.save();
		context.globalAlpha = layer.opacity;
		context.translate(layer.x, layer.y);
		if (layer.rotation !== 0) context.rotate((layer.rotation * Math.PI) / 180);

		const style = layer.italic ? "italic " : "";
		context.font = `${style}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
		context.textAlign = layer.align;
		context.textBaseline = "top";
		context.letterSpacing = `${layer.letterSpacing}px`;

		const lines = layer.text.split("\n");
		const lineHeight = layer.fontSize * layer.lineHeight;

		if (layer.backgroundColor !== null) {
			const widest = Math.max(...lines.map((line) => context.measureText(line).width));
			const offsetX =
				layer.align === "center" ? -widest / 2 : layer.align === "right" ? -widest : 0;
			context.fillStyle = layer.backgroundColor;
			context.fillRect(
				offsetX - layer.fontSize * 0.2,
				-layer.fontSize * 0.1,
				widest + layer.fontSize * 0.4,
				lineHeight * lines.length + layer.fontSize * 0.2,
			);
		}

		if (layer.shadowColor !== null) {
			context.shadowColor = layer.shadowColor;
			context.shadowBlur = layer.shadowBlur;
			context.shadowOffsetX = layer.shadowOffsetX;
			context.shadowOffsetY = layer.shadowOffsetY;
		}

		lines.forEach((line, index) => {
			const y = index * lineHeight;
			if (layer.strokeColor !== null && layer.strokeWidth > 0) {
				context.lineWidth = layer.strokeWidth;
				context.strokeStyle = layer.strokeColor;
				context.lineJoin = "round";
				context.strokeText(line, 0, y);
			}
			context.fillStyle = layer.color;
			context.fillText(line, 0, y);
		});

		context.restore();
	}

	return canvas;
}

export function createTextLayer(text: string, x: number, y: number, id: string): TextLayer {
	return {
		id,
		text,
		x,
		y,
		fontFamily: "Inter, system-ui, sans-serif",
		fontSize: 48,
		fontWeight: 600,
		italic: false,
		color: "#ffffff",
		align: "left",
		rotation: 0,
		opacity: 1,
		strokeColor: "#000000",
		strokeWidth: 0,
		shadowColor: null,
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		backgroundColor: null,
		letterSpacing: 0,
		lineHeight: 1.2,
	};
}
