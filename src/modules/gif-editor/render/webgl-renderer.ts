import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';

/**
 * GIF frame renderer.
 * Applies shared filters + resize per frame, then readPixels RGBA for encoding.
 */
export class GifFrameRenderer {
	private pipeline: FilterPipeline;

	constructor(width: number, height: number) {
		const canvas = new OffscreenCanvas(width, height);
		this.pipeline = new FilterPipeline(canvas);
	}

	/**
	 * Render a VideoFrame with filters and read back RGBA pixels.
	 * Returns a Uint8Array of width*height*4 bytes.
	 * The caller must close() the frame after this call.
	 */
	renderFrame(frame: VideoFrame, filters: FilterParams): Uint8Array {
		this.pipeline.uploadVideoFrame(frame);
		this.pipeline.render(filters);
		return this.pipeline.readPixels();
	}

	/**
	 * Render an ImageBitmap with filters and read back RGBA pixels.
	 */
	renderBitmap(bitmap: ImageBitmap, filters: FilterParams): Uint8Array {
		this.pipeline.uploadImageBitmap(bitmap);
		this.pipeline.render(filters);
		return this.pipeline.readPixels();
	}

	destroy(): void {
		this.pipeline.destroy();
	}
}
