import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { PipelineRendererBase } from '@/modules/shared-core/render/pipelineRendererBase.ts';

/**
 * GIF frame renderer.
 * Applies shared filters + resize per frame, then readPixels RGBA for encoding.
 */
export class GifFrameRenderer extends PipelineRendererBase {
	constructor(width: number, height: number) {
		const canvas = new OffscreenCanvas(width, height);
		super(canvas);
	}

	/**
	 * Render a VideoFrame with filters and read back RGBA pixels.
	 * Returns a Uint8Array of width*height*4 bytes.
	 * The caller must close() the frame after this call.
	 */
	renderFrame(frame: VideoFrame, filters: FilterParams): Uint8Array {
		this.renderVideoFrame(frame, filters);
		return this.readPixels();
	}

	/**
	 * Render an ImageBitmap with filters and read back RGBA pixels.
	 */
	renderBitmap(bitmap: ImageBitmap, filters: FilterParams): Uint8Array {
		this.renderImageBitmap(bitmap, filters);
		return this.readPixels();
	}
}
