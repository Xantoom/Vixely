import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';

export class PipelineRendererBase {
	protected readonly pipeline: FilterPipeline;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		this.pipeline = new FilterPipeline(canvas);
	}

	get canvas(): HTMLCanvasElement | OffscreenCanvas {
		return this.pipeline.canvas;
	}

	protected renderVideoFrame(frame: VideoFrame, filters: FilterParams): void {
		const handle = this.pipeline.uploadVideoFrame(frame);
		this.pipeline.render(filters, handle);
	}

	protected renderImageBitmap(bitmap: ImageBitmap, filters: FilterParams): void {
		const handle = this.pipeline.uploadImageBitmap(bitmap);
		this.pipeline.render(filters, handle);
	}

	protected uploadImageBitmap(bitmap: ImageBitmap): void {
		this.pipeline.uploadImageBitmap(bitmap);
	}

	protected uploadImageData(data: ImageData): void {
		this.pipeline.uploadImageData(data);
	}

	protected renderFilters(filters: FilterParams): void {
		this.pipeline.render(filters);
	}

	readPixels(): Uint8Array {
		return this.pipeline.readPixels();
	}

	destroy(): void {
		this.pipeline.destroy();
	}
}
