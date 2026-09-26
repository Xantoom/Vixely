import '@fontsource/anton';
import '@fontsource/bebas-neue';
import '@fontsource-variable/oswald';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource/pacifico';
import '@fontsource/permanent-marker';
import '@fontsource-variable/caveat';
import { useEffect, useState } from 'react';
import { fontInfo, type Overlay, shownAt, type ShapeId, type ShapeOverlay, type TextOverlay } from './model';

/**
 * Draws text and stickers with the 2D canvas, the same code for the preview and the export, so
 * what is placed on screen is what ends up in the file.
 */

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const stickers = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

function stickerUrl(emoji: string): string {
	return `/stickers/${emoji}.svg`;
}

async function loadSticker(emoji: string): Promise<void> {
	const known = pending.get(emoji);
	if (known) return known;
	const image = new Image();
	image.src = stickerUrl(emoji);
	const loading = image
		.decode()
		.then(() => {
			stickers.set(emoji, image);
		})
		.catch(() => {
			// A missing sticker draws nothing rather than failing the whole picture.
		});
	pending.set(emoji, loading);
	return loading;
}

function fontString(overlay: TextOverlay, pixels: number): string {
	const font = fontInfo(overlay.font);
	const weight = overlay.bold && font.bold ? 700 : 400;
	const style = overlay.italic && font.italic ? 'italic ' : '';
	return `${style}${weight} ${pixels}px "${font.family}"`;
}

/** Waits for every font and sticker the overlays use, so a drawing is complete. */
export async function loadOverlayAssets(overlays: readonly Overlay[]): Promise<void> {
	await Promise.all(
		overlays.map(async (overlay) => {
			if (overlay.kind === 'sticker') return loadSticker(overlay.emoji);
			if (overlay.kind === 'text') await document.fonts.load(fontString(overlay, 40), overlay.text);
			return undefined;
		}),
	);
}

/** Redraws once the fonts and stickers in use have arrived: a number that changes when they do. */
export function useOverlayAssets(overlays: readonly Overlay[]): number {
	const [version, setVersion] = useState(0);
	const key = overlays
		.map((overlay) =>
			overlay.kind === 'sticker'
				? overlay.emoji
				: overlay.kind === 'text'
					? `${overlay.font}${overlay.bold}${overlay.italic}${overlay.text}`
					: '',
		)
		.join('|');
	useEffect(() => {
		let live = true;
		void loadOverlayAssets(overlays).then(() => {
			if (live) setVersion((value) => value + 1);
		});
		return () => {
			live = false;
		};
		// The key covers what loading depends on.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);
	return version;
}

const LINE_HEIGHT = 1.2;

interface TextLayout {
	lines: string[];
	pixels: number;
	/** Box around the text, background padding included, centred on the overlay's position. */
	width: number;
	height: number;
	textWidth: number;
	padX: number;
}

let scratch: OffscreenCanvasRenderingContext2D | null = null;

function layoutText(context: Context, overlay: TextOverlay, unit: number): TextLayout {
	const pixels = Math.max(1, overlay.size * unit);
	context.font = fontString(overlay, pixels);
	const lines = overlay.text.split('\n');
	const textWidth = Math.max(pixels * 0.3, ...lines.map((line) => context.measureText(line).width));
	const padX = overlay.background ? pixels * 0.35 : overlay.outline * pixels;
	const padY = overlay.background ? pixels * 0.18 : overlay.outline * pixels;
	return {
		lines,
		pixels,
		textWidth,
		padX,
		width: textWidth + padX * 2,
		height: lines.length * pixels * LINE_HEIGHT + padY * 2,
	};
}

/** Width over height of each shape's box. */
const SHAPE_ASPECT: Record<ShapeId, number> = { arrow: 2, circle: 1, square: 1, star: 1, heart: 1.1, bubble: 1.25 };

/** Size of an overlay's box, unrotated, in output pixels. */
export function overlaySize(
	overlay: Overlay,
	output: { width: number; height: number },
): { width: number; height: number } {
	const unit = Math.min(output.width, output.height);
	if (overlay.kind === 'text') {
		scratch ??= new OffscreenCanvas(1, 1).getContext('2d');
		if (!scratch) return { width: unit * overlay.size, height: unit * overlay.size };
		const { width, height } = layoutText(scratch, overlay, unit);
		return { width, height };
	}
	const side = overlay.size * unit;
	if (overlay.kind === 'shape') return { width: side * SHAPE_ASPECT[overlay.shape], height: side };
	return { width: side, height: side };
}

function drawText(context: Context, overlay: TextOverlay, unit: number) {
	const layout = layoutText(context, overlay, unit);
	const { pixels, lines, width, height, textWidth } = layout;
	if (overlay.background) {
		context.fillStyle = overlay.background;
		context.beginPath();
		context.roundRect(-width / 2, -height / 2, width, height, pixels * 0.28);
		context.fill();
	}
	context.textAlign = overlay.align;
	context.textBaseline = 'middle';
	context.lineJoin = 'round';
	context.miterLimit = 2;
	const x = overlay.align === 'left' ? -textWidth / 2 : overlay.align === 'right' ? textWidth / 2 : 0;
	const lineHeight = pixels * LINE_HEIGHT;
	const top = (-lines.length * lineHeight) / 2;
	const shadow = () => {
		if (!overlay.shadow) return;
		context.shadowColor = 'rgb(0 0 0 / 0.5)';
		context.shadowBlur = pixels * 0.15;
		context.shadowOffsetY = pixels * 0.04;
	};
	const noShadow = () => {
		context.shadowColor = 'transparent';
		context.shadowBlur = 0;
		context.shadowOffsetY = 0;
	};
	lines.forEach((line, index) => {
		const y = top + lineHeight * (index + 0.5);
		if (overlay.outline > 0) {
			// The stroke straddles the edge of the letters: twice as wide shows the chosen width.
			shadow();
			context.strokeStyle = overlay.outlineColor;
			context.lineWidth = overlay.outline * pixels * 2;
			context.strokeText(line, x, y);
			noShadow();
		} else shadow();
		context.fillStyle = overlay.color;
		context.fillText(line, x, y);
		noShadow();
	});
}

function shapePath(shape: ShapeId, width: number, height: number): Path2D {
	const path = new Path2D();
	const w = width / 2;
	const h = height / 2;
	switch (shape) {
		case 'arrow': {
			const shaft = h * 0.36;
			const head = w * 0.9;
			path.moveTo(-w, -shaft);
			path.lineTo(w - head * 0.55, -shaft);
			path.lineTo(w - head * 0.55, -h);
			path.lineTo(w, 0);
			path.lineTo(w - head * 0.55, h);
			path.lineTo(w - head * 0.55, shaft);
			path.lineTo(-w, shaft);
			path.closePath();
			break;
		}
		case 'circle':
			path.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
			break;
		case 'square':
			path.roundRect(-w, -h, width, height, Math.min(w, h) * 0.12);
			break;
		case 'star':
			for (let i = 0; i < 10; i++) {
				const radius = i % 2 === 0 ? 1 : 0.45;
				const angle = -Math.PI / 2 + (i * Math.PI) / 5;
				const px = Math.cos(angle) * w * radius;
				const py = Math.sin(angle) * h * radius * 1.05 + h * 0.06;
				if (i === 0) path.moveTo(px, py);
				else path.lineTo(px, py);
			}
			path.closePath();
			break;
		case 'heart':
			path.moveTo(0, h);
			path.bezierCurveTo(-w * 1.25, h * 0.05, -w * 0.75, -h * 1.05, 0, -h * 0.45);
			path.bezierCurveTo(w * 0.75, -h * 1.05, w * 1.25, h * 0.05, 0, h);
			path.closePath();
			break;
		case 'bubble':
			path.roundRect(-w, -h, width, height * 0.78, Math.min(w, h) * 0.35);
			path.moveTo(-w * 0.45, -h + height * 0.78 - 1);
			path.lineTo(-w * 0.62, h);
			path.lineTo(-w * 0.12, -h + height * 0.78 - 1);
			path.closePath();
			break;
	}
	return path;
}

function drawShape(context: Context, overlay: ShapeOverlay, width: number, height: number) {
	const path = shapePath(overlay.shape, width, height);
	if (overlay.outlined) {
		const line = Math.min(width, height) * 0.08;
		// Drawn inside its box, so the outline stays within the handles.
		const inner = shapePath(overlay.shape, width - line, height - line);
		context.strokeStyle = overlay.color;
		context.lineWidth = line;
		context.lineJoin = 'round';
		context.stroke(inner);
	} else {
		context.fillStyle = overlay.color;
		context.fill(path);
	}
}

/** Draws the overlays over a picture of `output` size, already on the context. */
export function drawOverlays(
	context: Context,
	overlays: readonly Overlay[],
	output: { width: number; height: number },
	/** Time in the source video: only the overlays shown then are drawn. */
	time?: number,
): void {
	const unit = Math.min(output.width, output.height);
	for (const overlay of overlays) {
		if (!shownAt(overlay, time)) continue;
		context.save();
		context.translate(overlay.x * output.width, overlay.y * output.height);
		context.rotate((overlay.rotation * Math.PI) / 180);
		context.globalAlpha = overlay.opacity;
		if (overlay.kind === 'text') drawText(context, overlay, unit);
		else {
			const { width, height } = overlaySize(overlay, output);
			if (overlay.kind === 'shape') drawShape(context, overlay, width, height);
			else {
				const image = stickers.get(overlay.emoji);
				if (image) context.drawImage(image, -width / 2, -height / 2, width, height);
				else void loadSticker(overlay.emoji);
			}
		}
		context.restore();
	}
}
