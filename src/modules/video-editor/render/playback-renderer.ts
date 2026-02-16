import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';

/**
 * Video playback renderer.
 * Receives VideoFrames from the decoder, uploads to WebGL (zero-copy in Chromium),
 * applies filter shaders, and outputs to the canvas.
 */
export class PlaybackRenderer {
	private pipeline: FilterPipeline;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		this.pipeline = new FilterPipeline(canvas);
	}

	get canvas(): HTMLCanvasElement | OffscreenCanvas {
		return this.pipeline.canvas;
	}

	/**
	 * Render a VideoFrame with filters applied.
	 * IMPORTANT: The caller must call frame.close() after this returns.
	 */
	renderFrame(frame: VideoFrame, filters: FilterParams): void {
		const handle = this.pipeline.uploadVideoFrame(frame);
		this.pipeline.render(filters, handle);
	}

	/**
	 * Render from an ImageBitmap (e.g., for fallback or thumbnail).
	 */
	renderBitmap(bitmap: ImageBitmap, filters: FilterParams): void {
		const handle = this.pipeline.uploadImageBitmap(bitmap);
		this.pipeline.render(filters, handle);
	}

	readPixels(): Uint8Array {
		return this.pipeline.readPixels();
	}

	destroy(): void {
		this.pipeline.destroy();
	}
}
