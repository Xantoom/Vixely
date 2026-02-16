import type { FilterParams } from './filters.ts';

export interface TextureHandle {
	texture: WebGLTexture;
	width: number;
	height: number;
}

export interface FilterProgram {
	program: WebGLProgram;
	setUniforms(gl: WebGL2RenderingContext, params: FilterParams, time: number): void;
}

export interface RenderPipeline {
	readonly gl: WebGL2RenderingContext;
	readonly canvas: HTMLCanvasElement | OffscreenCanvas;

	uploadImage(source: ImageBitmap | VideoFrame | ImageData): TextureHandle;
	render(texture: TextureHandle, params: FilterParams): void;
	readPixels(width: number, height: number): Uint8Array;
	destroy(): void;
}
