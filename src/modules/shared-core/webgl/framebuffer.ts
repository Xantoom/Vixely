import type { TextureHandle } from '../types/pipeline.ts';
import { createEmptyTexture } from './textures.ts';

export interface Framebuffer {
	fbo: WebGLFramebuffer;
	texture: TextureHandle;
}

export function createFramebuffer(gl: WebGL2RenderingContext, width: number, height: number): Framebuffer {
	const fbo = gl.createFramebuffer();
	if (!fbo) throw new Error('Failed to create framebuffer');

	const texture = createEmptyTexture(gl, width, height);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.texture, 0);

	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if (status !== gl.FRAMEBUFFER_COMPLETE) {
		throw new Error(`Framebuffer incomplete: ${status}`);
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { fbo, texture };
}

export function resizeFramebuffer(gl: WebGL2RenderingContext, fb: Framebuffer, width: number, height: number): void {
	if (fb.texture.width === width && fb.texture.height === height) return;

	gl.bindTexture(gl.TEXTURE_2D, fb.texture.texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	fb.texture.width = width;
	fb.texture.height = height;
}

export function bindFramebuffer(gl: WebGL2RenderingContext, fb: Framebuffer): void {
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
	gl.viewport(0, 0, fb.texture.width, fb.texture.height);
}

export function unbindFramebuffer(gl: WebGL2RenderingContext, canvasWidth: number, canvasHeight: number): void {
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport(0, 0, canvasWidth, canvasHeight);
}

export function readPixelsFromFramebuffer(gl: WebGL2RenderingContext, fb: Framebuffer): Uint8Array {
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
	const { width, height } = fb.texture;
	const pixels = new Uint8Array(width * height * 4);
	gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return pixels;
}

export function deleteFramebuffer(gl: WebGL2RenderingContext, fb: Framebuffer): void {
	gl.deleteFramebuffer(fb.fbo);
	gl.deleteTexture(fb.texture.texture);
}

/**
 * Pair of framebuffers for ping-pong rendering (e.g., separable blur).
 */
export interface PingPongBuffers {
	a: Framebuffer;
	b: Framebuffer;
}

export function createPingPongBuffers(gl: WebGL2RenderingContext, width: number, height: number): PingPongBuffers {
	return { a: createFramebuffer(gl, width, height), b: createFramebuffer(gl, width, height) };
}

export function resizePingPongBuffers(
	gl: WebGL2RenderingContext,
	pp: PingPongBuffers,
	width: number,
	height: number,
): void {
	resizeFramebuffer(gl, pp.a, width, height);
	resizeFramebuffer(gl, pp.b, width, height);
}

export function deletePingPongBuffers(gl: WebGL2RenderingContext, pp: PingPongBuffers): void {
	deleteFramebuffer(gl, pp.a);
	deleteFramebuffer(gl, pp.b);
}
