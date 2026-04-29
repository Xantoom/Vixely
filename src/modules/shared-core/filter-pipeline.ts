import { DEFAULT_FILTER_PARAMS, filtersAreDefault } from './types/filters.ts';
import type { FilterParams } from './types/filters.ts';
import type { TextureHandle } from './types/pipeline.ts';
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
import type { UniformLocations } from './webgl/programs.ts';
import { linkProgram, getUniformLocations, setUniform1f, setUniform2f, setUniform1i } from './webgl/programs.ts';
import { FULLSCREEN_VERTEX, COLOR_FRAGMENT, BLUR_FRAGMENT, PASSTHROUGH_FRAGMENT } from './webgl/shaders.ts';
import { uploadImageBitmap, uploadVideoFrame, uploadImageData, bindTexture, deleteTexture } from './webgl/textures.ts';

interface Programs {
	color: WebGLProgram;
	colorUniforms: UniformLocations;
	blur: WebGLProgram;
	blurUniforms: UniformLocations;
	passthrough: WebGLProgram;
	passthroughUniforms: UniformLocations;
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
	'u_grain',
	'u_resolution',
];

const BLUR_UNIFORMS = ['u_texture', 'u_direction', 'u_radius'];
const PASSTHROUGH_UNIFORMS = ['u_texture'];

/**
 * Shared filter rendering pipeline.
 *
 * Render strategy is decided per-call from the FilterParams:
 *   • Identity (everything default)        → 1 draw  (passthrough → canvas)
 *   • Color-only (no blur)                 → 1 draw  (mega-color → canvas)
 *   • Color + blur                         → 4 draws (color → FBO, H, V, blit)
 *
 * The mega-color shader handles exposure / tonal / sat / temp / tint / hue /
 * sepia / vignette / grain in one fragment pass — avoids the previous chain
 * of color → grain blit programs that cost 2 draws even for the no-op case.
 *
 * scheduleRender(params) coalesces multiple synchronous calls in the same
 * frame into a single rAF — slider drag events no longer DOS the GPU.
 */
export class FilterPipeline {
	private ctx: GLContext;
	private programs: Programs;
	private fboA: Framebuffer | null = null;
	private pingPong: PingPongBuffers | null = null;
	private sourceTexture: TextureHandle | null = null;
	private currentWidth = 0;
	private currentHeight = 0;
	private rafId = 0;
	private pendingParams: FilterParams | null = null;

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

		const color = linkProgram(gl, FULLSCREEN_VERTEX, COLOR_FRAGMENT);
		const colorUniforms = getUniformLocations(gl, color, COLOR_UNIFORMS);

		const blur = linkProgram(gl, FULLSCREEN_VERTEX, BLUR_FRAGMENT);
		const blurUniforms = getUniformLocations(gl, blur, BLUR_UNIFORMS);

		const passthrough = linkProgram(gl, FULLSCREEN_VERTEX, PASSTHROUGH_FRAGMENT);
		const passthroughUniforms = getUniformLocations(gl, passthrough, PASSTHROUGH_UNIFORMS);

		return { color, colorUniforms, blur, blurUniforms, passthrough, passthroughUniforms };
	}

	private ensureColorFBO(width: number, height: number): void {
		const { gl } = this.ctx;
		if (this.fboA) {
			resizeFramebuffer(gl, this.fboA, width, height);
		} else {
			this.fboA = createFramebuffer(gl, width, height);
		}
	}

	private ensurePingPong(width: number, height: number): void {
		const { gl } = this.ctx;
		if (this.pingPong) {
			resizePingPongBuffers(gl, this.pingPong, width, height);
		} else {
			this.pingPong = createPingPongBuffers(gl, width, height);
		}
	}

	private ensureCanvasSize(width: number, height: number): void {
		const canvas = this.ctx.canvas;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
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

	/**
	 * Coalesce multiple render calls in the same frame into one.
	 * Use this from React effects driven by slider events — render() is fine
	 * for one-shot calls (export, frame stepping).
	 */
	scheduleRender(params: FilterParams, source?: TextureHandle): void {
		this.pendingParams = params;
		if (this.rafId !== 0) return;
		const tex = source;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = 0;
			const next = this.pendingParams;
			if (!next) return;
			this.pendingParams = null;
			this.render(next, tex);
		});
	}

	render(params: FilterParams, source?: TextureHandle): void {
		const tex = source ?? this.sourceTexture;
		if (!tex) return;

		const { gl } = this.ctx;
		const { width, height } = tex;
		this.ensureCanvasSize(width, height);

		const needsBlur = params.blur > 0;
		const isIdentity = filtersAreDefault(params);

		// Fast-path: nothing to do — passthrough source to canvas in one draw.
		if (isIdentity) {
			unbindFramebuffer(gl, width, height);
			gl.useProgram(this.programs.passthrough);
			bindTexture(gl, tex, 0);
			setUniform1i(gl, this.programs.passthroughUniforms['u_texture']!, 0);
			drawQuad(this.ctx);
			return;
		}

		// Color-only path: mega-shader straight to canvas.
		if (!needsBlur) {
			unbindFramebuffer(gl, width, height);
			gl.useProgram(this.programs.color);
			this.setColorUniforms(params, width, height);
			bindTexture(gl, tex, 0);
			setUniform1i(gl, this.programs.colorUniforms['u_texture']!, 0);
			drawQuad(this.ctx);
			return;
		}

		// Blur path: color → FBO A → blur H → ping-pong A → blur V → ping-pong B → canvas blit.
		this.ensureColorFBO(width, height);
		this.ensurePingPong(width, height);

		bindFramebuffer(gl, this.fboA!);
		gl.useProgram(this.programs.color);
		this.setColorUniforms(params, width, height);
		bindTexture(gl, tex, 0);
		setUniform1i(gl, this.programs.colorUniforms['u_texture']!, 0);
		drawQuad(this.ctx);

		const pp = this.pingPong!;
		gl.useProgram(this.programs.blur);

		bindFramebuffer(gl, pp.a);
		bindTexture(gl, this.fboA!.texture, 0);
		setUniform1i(gl, this.programs.blurUniforms['u_texture']!, 0);
		setUniform2f(gl, this.programs.blurUniforms['u_direction']!, 1 / width, 0);
		setUniform1f(gl, this.programs.blurUniforms['u_radius']!, params.blur);
		drawQuad(this.ctx);

		bindFramebuffer(gl, pp.b);
		bindTexture(gl, pp.a.texture, 0);
		setUniform2f(gl, this.programs.blurUniforms['u_direction']!, 0, 1 / height);
		drawQuad(this.ctx);

		unbindFramebuffer(gl, width, height);
		gl.useProgram(this.programs.passthrough);
		bindTexture(gl, pp.b.texture, 0);
		setUniform1i(gl, this.programs.passthroughUniforms['u_texture']!, 0);
		drawQuad(this.ctx);
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

		if (this.rafId !== 0) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
		this.pendingParams = null;

		gl.deleteProgram(this.programs.color);
		gl.deleteProgram(this.programs.blur);
		gl.deleteProgram(this.programs.passthrough);

		if (this.fboA) deleteFramebuffer(gl, this.fboA);
		if (this.pingPong) deletePingPongBuffers(gl, this.pingPong);
		if (this.sourceTexture) deleteTexture(gl, this.sourceTexture);

		this.fboA = null;
		this.pingPong = null;
		this.sourceTexture = null;
		this.currentWidth = 0;
		this.currentHeight = 0;

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
		setUniform1f(gl, u['u_grain']!, params.grain);
		setUniform2f(gl, u['u_resolution']!, width, height);
	}
}

// Re-export DEFAULT_FILTER_PARAMS for convenience to consumers that already
// import from this module.
export { DEFAULT_FILTER_PARAMS };
