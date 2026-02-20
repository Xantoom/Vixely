import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { PipelineRendererBase } from '@/modules/shared-core/render/pipelineRendererBase.ts';

/**
 * Photo-specific WebGL renderer.
 * On image load: createImageBitmap → upload to GPU.
 * On filter change: update uniforms + redraw (<1ms vs 50-200ms worker).
 * No CPU readback during editing — the canvas IS the output.
 */
export class PhotoWebGLRenderer extends PipelineRendererBase {
	private sourceBitmap: ImageBitmap | null = null;
	private _width = 0;
	private _height = 0;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		super(canvas);
	}

	get width(): number {
		return this._width;
	}

	get height(): number {
		return this._height;
	}

	get gl(): WebGL2RenderingContext {
		return this.pipeline.gl;
	}

	async loadFile(file: File): Promise<{ width: number; height: number }> {
		const bitmap = await createImageBitmap(file);
		this.loadBitmap(bitmap);
		return { width: bitmap.width, height: bitmap.height };
	}

	loadBitmap(bitmap: ImageBitmap): void {
		this.sourceBitmap?.close();
		this.sourceBitmap = bitmap;
		this._width = bitmap.width;
		this._height = bitmap.height;
		this.uploadImageBitmap(bitmap);
	}

	loadImageData(data: ImageData): void {
		this.sourceBitmap?.close();
		this.sourceBitmap = null;
		this._width = data.width;
		this._height = data.height;
		this.uploadImageData(data);
	}

	render(params: FilterParams): void {
		this.renderFilters(params);
	}

	override destroy(): void {
		this.sourceBitmap?.close();
		this.sourceBitmap = null;
		super.destroy();
	}
}
