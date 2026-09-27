import { drawOverlays } from '@/editor/overlays/draw';
import { effectiveCrop, type ImageDoc, type Rect, type Size } from '@/editors/image/document';
import { ImageRenderer } from '@/editors/image/renderer';
import { fadeAmount, type FrameLayout, type GifDoc } from './document';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FADE_COLORS = { black: '#000000', white: '#ffffff' } as const;

/**
 * The picture's blurred zones, placed on the whole frame, moved to the picture's own box, where
 * the renderer blurs them: they differ when bands surround the picture.
 */
function zonesInPicture(picture: ImageDoc, box: Rect, frame: Size): ImageDoc {
	if (box.width === frame.width && box.height === frame.height) return picture;
	if (!picture.overlays.some((overlay) => overlay.kind === 'zone')) return picture;
	const scale = Math.min(frame.width, frame.height) / Math.min(box.width, box.height);
	return {
		...picture,
		overlays: picture.overlays.map((overlay) =>
			overlay.kind === 'zone'
				? {
						...overlay,
						x: (overlay.x * frame.width - box.x) / box.width,
						y: (overlay.y * frame.height - box.y) / box.height,
						size: overlay.size * scale,
					}
				: overlay,
		),
	};
}

export interface ComposeOptions {
	/** Output time of the frame, for the fades and the grain. */
	time: number;
	/** Length of the output, for the fade out. */
	length: number;
	/** Shows the picture unedited, to compare. */
	original?: boolean;
	/** Draws the text and stickers; the preview leaves them to its own layer while they are edited. */
	overlays?: boolean;
	/** Square pixels kept sharp when scaled, for pixel art; smooth by default. */
	sampling?: 'smooth' | 'pixel';
}

/**
 * Draws a frame of the output: the picture with the image editor's renderer (crop, turns, colours),
 * the bands around it, the text and stickers, then the fade. The preview and the export both draw
 * through here, at any size, so what is seen is what is saved.
 */
export class FrameComposer {
	private readonly canvas = new OffscreenCanvas(1, 1);
	private readonly renderer: ImageRenderer;

	constructor() {
		this.renderer = new ImageRenderer(this.canvas);
	}

	/**
	 * `picture` is a frame of the source at any resolution; `source` its full size. The frame is
	 * drawn over the whole of `context`'s canvas, laid out as `layout` scaled to it.
	 */
	draw(
		context: Context2D,
		picture: TexImageSource,
		source: Size,
		doc: GifDoc,
		layout: FrameLayout,
		{ time, length, original = false, overlays = true, sampling = 'smooth' }: ComposeOptions,
	): void {
		const { width, height } = context.canvas;
		// Across and down apart: an exact size may stretch the picture.
		const kx = width / layout.width;
		const ky = height / layout.height;
		const box = {
			x: layout.content.x * kx,
			y: layout.content.y * ky,
			width: Math.max(1, Math.round(layout.content.width * kx)),
			height: Math.max(1, Math.round(layout.content.height * ky)),
		};
		if (this.canvas.width !== box.width) this.canvas.width = box.width;
		if (this.canvas.height !== box.height) this.canvas.height = box.height;
		this.renderer.setFrame(picture, source, 0);
		this.renderer.render(zonesInPicture(doc.picture, box, { width, height }), {
			region: effectiveCrop(doc.picture, source),
			original,
			seed: time * 97,
			sampling,
		});

		context.save();
		context.clearRect(0, 0, width, height);
		if (doc.bands?.color && !original) {
			context.fillStyle = doc.bands.color;
			context.fillRect(0, 0, width, height);
		}
		context.drawImage(this.canvas, box.x, box.y, box.width, box.height);
		if (original) {
			context.restore();
			return;
		}
		if (overlays) drawOverlays(context, doc.picture.overlays, { width, height });
		const fade = fadeAmount(doc.fade, time, length);
		if (fade > 0) {
			context.globalAlpha = fade;
			if (doc.fade.color === 'transparent') {
				context.globalCompositeOperation = 'destination-out';
				context.fillStyle = '#000';
			} else context.fillStyle = FADE_COLORS[doc.fade.color];
			context.fillRect(0, 0, width, height);
		}
		context.restore();
	}

	dispose(): void {
		this.renderer.dispose();
	}
}
