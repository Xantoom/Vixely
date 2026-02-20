import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { PipelineRendererBase } from '@/modules/shared-core/render/pipelineRendererBase.ts';

/**
 * Video playback renderer.
 * Receives VideoFrames from the decoder, uploads to WebGL (zero-copy in Chromium),
 * applies filter shaders, and outputs to the canvas.
 */
export class PlaybackRenderer extends PipelineRendererBase {
	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		super(canvas);
	}

	/**
	 * Render a VideoFrame with filters applied.
	 * IMPORTANT: The caller must call frame.close() after this returns.
	 */
	renderFrame(frame: VideoFrame, filters: FilterParams): void {
		this.renderVideoFrame(frame, filters);
	}

	/**
	 * Render from an ImageBitmap (e.g., for fallback or thumbnail).
	 */
	renderBitmap(bitmap: ImageBitmap, filters: FilterParams): void {
		this.renderImageBitmap(bitmap, filters);
	}
}
