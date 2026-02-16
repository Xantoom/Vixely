import type { TextureHandle } from '../types/pipeline.ts';

export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
	const texture = gl.createTexture();
	if (!texture) throw new Error('Failed to create texture');

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	return texture;
}

export function uploadImageBitmap(
	gl: WebGL2RenderingContext,
	bitmap: ImageBitmap,
	existing?: WebGLTexture,
): TextureHandle {
	const texture = existing ?? createTexture(gl);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
	return { texture, width: bitmap.width, height: bitmap.height };
}

export function uploadVideoFrame(
	gl: WebGL2RenderingContext,
	frame: VideoFrame,
	existing?: WebGLTexture,
): TextureHandle {
	const texture = existing ?? createTexture(gl);
	const width = frame.displayWidth;
	const height = frame.displayHeight;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	// VideoFrame is accepted by texImage2D in Chromium (zero-copy path)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame as unknown as TexImageSource);
	return { texture, width, height };
}

export function uploadImageData(gl: WebGL2RenderingContext, data: ImageData, existing?: WebGLTexture): TextureHandle {
	const texture = existing ?? createTexture(gl);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.width, data.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
	return { texture, width: data.width, height: data.height };
}

export function createEmptyTexture(gl: WebGL2RenderingContext, width: number, height: number): TextureHandle {
	const texture = createTexture(gl);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	return { texture, width, height };
}

export function bindTexture(gl: WebGL2RenderingContext, handle: TextureHandle, unit: number = 0): void {
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, handle.texture);
}

export function deleteTexture(gl: WebGL2RenderingContext, handle: TextureHandle): void {
	gl.deleteTexture(handle.texture);
}
