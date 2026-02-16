import type { FilterParams } from './types/filters.ts';
import type { TextureHandle } from './types/pipeline.ts';
import type { UniformLocations } from './webgl/programs.ts';
import { type GLContext, createWebGL2Context, destroyGLContext, drawQuad } from './webgl/context.ts';
import {
	type Framebuffer,
	type PingPongBuffers,
	createFramebuffer,
	createPingPongBuffers,
	bindFramebuffer,
	unbindFramebuffer,
	resizeFramebuffer,
	resizePingPongBuffers,
	readPixelsFromFramebuffer,
	deleteFramebuffer,
	deletePingPongBuffers,
} from './webgl/framebuffer.ts';
import { linkProgram, getUniformLocations, setUniform1f, setUniform2f, setUniform1i } from './webgl/programs.ts';
import { FULLSCREEN_VERTEX, COLOR_CORRECTION_FRAGMENT, BLUR_FRAGMENT, GRAIN_FRAGMENT } from './webgl/shaders.ts';
import { uploadImageBitmap, uploadVideoFrame, uploadImageData, bindTexture, deleteTexture } from './webgl/textures.ts';

interface Programs {
	color: WebGLProgram;
	colorUniforms: UniformLocations;
	blur: WebGLProgram;
	blurUniforms: UniformLocations;
	grain: WebGLProgram;
	grainUniforms: UniformLocations;
}

const COLOR_UNIFORMS = [
	'u_texture',
	'u_exposure',
	'u_brightness',
	'u_contrast',
	'u_highlights',
	'u_shadows',
	'u_saturation',
	'u_temperature',
	'u_tint',
	'u_hue',
	'u_sepia',
	'u_vignette',
	'u_resolution',
];

const BLUR_UNIFORMS = ['u_texture', 'u_direction', 'u_radius'];
const GRAIN_UNIFORMS = ['u_texture', 'u_grain', 'u_time'];

/**
 * Shared filter rendering pipeline.
 *
 * Rendering chain:
 *   Source texture → Color correction → FBO A
 *   FBO A → Blur H → FBO B (if blur > 0)
 *   FBO B → Blur V → FBO A (if blur > 0)
 *   Last FBO → Grain → Canvas (if grain > 0), else blit to canvas
 */
export class FilterPipeline {
	private ctx: GLContext;
	private programs: Programs;
	private fboA: Framebuffer | null = null;
	private pingPong: PingPongBuffers | null = null;
	private sourceTexture: TextureHandle | null = null;
	private currentWidth = 0;
	private currentHeight = 0;
	private frameCount = 0;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		this.ctx = createWebGL2Context(canvas);
		this.programs = this.createPrograms();
	}

	get gl(): WebGL2RenderingContext {
		return this.ctx.gl;
	}

	get canvas(): HTMLCanvasElement | OffscreenCanvas {
		return this.ctx.canvas;
	}

	private createPrograms(): Programs {
		const { gl } = this.ctx;

		const color = linkProgram(gl, FULLSCREEN_VERTEX, COLOR_CORRECTION_FRAGMENT);
		const colorUniforms = getUniformLocations(gl, color, COLOR_UNIFORMS);

		const blur = linkProgram(gl, FULLSCREEN_VERTEX, BLUR_FRAGMENT);
		const blurUniforms = getUniformLocations(gl, blur, BLUR_UNIFORMS);

		const grain = linkProgram(gl, FULLSCREEN_VERTEX, GRAIN_FRAGMENT);
		const grainUniforms = getUniformLocations(gl, grain, GRAIN_UNIFORMS);

		return { color, colorUniforms, blur, blurUniforms, grain, grainUniforms };
	}

	private ensureFBOs(width: number, height: number): void {
		if (this.currentWidth === width && this.currentHeight === height) return;

		const { gl } = this.ctx;

		if (this.fboA) {
			resizeFramebuffer(gl, this.fboA, width, height);
		} else {
			this.fboA = createFramebuffer(gl, width, height);
		}

		if (this.pingPong) {
			resizePingPongBuffers(gl, this.pingPong, width, height);
		} else {
			this.pingPong = createPingPongBuffers(gl, width, height);
		}

		this.currentWidth = width;
		this.currentHeight = height;
	}

	uploadImageBitmap(bitmap: ImageBitmap): TextureHandle {
		const { gl } = this.ctx;
		this.sourceTexture = uploadImageBitmap(gl, bitmap, this.sourceTexture?.texture);
		return this.sourceTexture;
	}

	uploadVideoFrame(frame: VideoFrame): TextureHandle {
		const { gl } = this.ctx;
		this.sourceTexture = uploadVideoFrame(gl, frame, this.sourceTexture?.texture);
		return this.sourceTexture;
	}

	uploadImageData(data: ImageData): TextureHandle {
		const { gl } = this.ctx;
		this.sourceTexture = uploadImageData(gl, data, this.sourceTexture?.texture);
		return this.sourceTexture;
	}

	render(params: FilterParams, source?: TextureHandle): void {
		const tex = source ?? this.sourceTexture;
		if (!tex) return;

		const { gl } = this.ctx;
		const { width, height } = tex;
		this.ensureFBOs(width, height);

		const canvas = this.ctx.canvas;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		const needsBlur = params.blur > 0;
		const needsGrain = params.grain > 0;

		// Pass 1: Color correction → FBO A
		bindFramebuffer(gl, this.fboA!);
		gl.useProgram(this.programs.color);
		this.setColorUniforms(params, width, height);
		bindTexture(gl, tex, 0);
		setUniform1i(gl, this.programs.colorUniforms['u_texture']!, 0);
		drawQuad(this.ctx);

		let lastFBO = this.fboA!;

		// Pass 2-3: Blur ping-pong (if needed)
		if (needsBlur) {
			const pp = this.pingPong!;
			gl.useProgram(this.programs.blur);

			// Horizontal blur: FBO A → ping-pong A
			bindFramebuffer(gl, pp.a);
			bindTexture(gl, lastFBO.texture, 0);
			setUniform1i(gl, this.programs.blurUniforms['u_texture']!, 0);
			setUniform2f(gl, this.programs.blurUniforms['u_direction']!, 1 / width, 0);
			setUniform1f(gl, this.programs.blurUniforms['u_radius']!, params.blur);
			drawQuad(this.ctx);

			// Vertical blur: ping-pong A → ping-pong B
			bindFramebuffer(gl, pp.b);
			bindTexture(gl, pp.a.texture, 0);
			setUniform2f(gl, this.programs.blurUniforms['u_direction']!, 0, 1 / height);
			drawQuad(this.ctx);

			lastFBO = pp.b;
		}

		// Pass 4: Grain → canvas (or just blit)
		unbindFramebuffer(gl, width, height);

		if (needsGrain) {
			gl.useProgram(this.programs.grain);
			bindTexture(gl, lastFBO.texture, 0);
			setUniform1i(gl, this.programs.grainUniforms['u_texture']!, 0);
			setUniform1f(gl, this.programs.grainUniforms['u_grain']!, params.grain);
			setUniform1f(gl, this.programs.grainUniforms['u_time']!, this.frameCount++ * 0.01);
			drawQuad(this.ctx);
		} else {
			// Blit last FBO to canvas
			gl.useProgram(this.programs.grain);
			bindTexture(gl, lastFBO.texture, 0);
			setUniform1i(gl, this.programs.grainUniforms['u_texture']!, 0);
			setUniform1f(gl, this.programs.grainUniforms['u_grain']!, 0);
			setUniform1f(gl, this.programs.grainUniforms['u_time']!, 0);
			drawQuad(this.ctx);
		}
	}

	readPixels(): Uint8Array {
		const { gl } = this.ctx;
		const canvas = this.ctx.canvas;
		const pixels = new Uint8Array(canvas.width * canvas.height * 4);
		gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		return pixels;
	}

	readPixelsFromFBO(): Uint8Array | null {
		if (!this.fboA) return null;
		return readPixelsFromFramebuffer(this.ctx.gl, this.fboA);
	}

	destroy(): void {
		const { gl } = this.ctx;

		gl.deleteProgram(this.programs.color);
		gl.deleteProgram(this.programs.blur);
		gl.deleteProgram(this.programs.grain);

		if (this.fboA) deleteFramebuffer(gl, this.fboA);
		if (this.pingPong) deletePingPongBuffers(gl, this.pingPong);
		if (this.sourceTexture) deleteTexture(gl, this.sourceTexture);

		destroyGLContext(this.ctx);
	}

	private setColorUniforms(params: FilterParams, width: number, height: number): void {
		const { gl } = this.ctx;
		const u = this.programs.colorUniforms;
		setUniform1f(gl, u['u_exposure']!, params.exposure);
		setUniform1f(gl, u['u_brightness']!, params.brightness);
		setUniform1f(gl, u['u_contrast']!, params.contrast);
		setUniform1f(gl, u['u_highlights']!, params.highlights);
		setUniform1f(gl, u['u_shadows']!, params.shadows);
		setUniform1f(gl, u['u_saturation']!, params.saturation);
		setUniform1f(gl, u['u_temperature']!, params.temperature);
		setUniform1f(gl, u['u_tint']!, params.tint);
		setUniform1f(gl, u['u_hue']!, params.hue);
		setUniform1f(gl, u['u_sepia']!, params.sepia);
		setUniform1f(gl, u['u_vignette']!, params.vignette);
		setUniform2f(gl, u['u_resolution']!, width, height);
	}
}
