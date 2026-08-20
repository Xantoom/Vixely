import { NEUTRAL_FILTERS } from "../document/defaults.ts";
import type { FilterParams, Rotation } from "../document/types.ts";
import { computeOutputSize } from "./geometry.ts";
import {
	COLOR_FRAGMENT_SHADER,
	COMPOSITE_FRAGMENT_SHADER,
	QUAD_VERTEX_SHADER,
} from "./shaders/color.ts";
import { RenderError, type FrameSource, type OutputSize, type RenderSpec } from "./types.ts";

type Program = {
	readonly program: WebGLProgram;
	readonly uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
};

const FILTER_UNIFORMS: ReadonlyArray<keyof FilterParams> = [
	"brightness",
	"contrast",
	"saturation",
	"exposure",
	"temperature",
	"tint",
	"gamma",
	"highlights",
	"shadows",
	"vibrance",
	"hueRotate",
	"sharpen",
	"blur",
	"vignette",
	"grayscale",
	"sepia",
	"invert",
	"opacity",
];

/**
 * The single render path of the application (I1).
 *
 * The same instance serves the screen and the encoder; `render` differs only
 * in where its framebuffer points. Nothing about the pipeline is conditional
 * on being a preview.
 */
export class RenderGraph {
	readonly #gl: WebGL2RenderingContext;
	readonly #canvas: HTMLCanvasElement | OffscreenCanvas;
	readonly #colorProgram: Program;
	readonly #compositeProgram: Program;
	readonly #quad: WebGLBuffer;
	readonly #vao: WebGLVertexArrayObject;
	#sourceTexture: WebGLTexture | null = null;
	#overlayTexture: WebGLTexture | null = null;
	#disposed = false;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
		const gl = canvas.getContext("webgl2", {
			alpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
			powerPreference: "high-performance",
		});
		if (gl === null) throw new RenderError("WebGL2 is unavailable");

		this.#gl = gl;
		this.#canvas = canvas;
		this.#colorProgram = createProgram(gl, QUAD_VERTEX_SHADER, COLOR_FRAGMENT_SHADER, [
			"u_texture",
			"u_texelSize",
			"u_uvTransform",
			"u_flipOutput",
			...FILTER_UNIFORMS.map((name) => `u_${name}`),
		]);
		this.#compositeProgram = createProgram(gl, QUAD_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER, [
			"u_texture",
			"u_alpha",
			"u_uvTransform",
			"u_flipOutput",
		]);

		const quad = gl.createBuffer();
		const vao = gl.createVertexArray();
		if (quad === null || vao === null) throw new RenderError("could not allocate GPU buffers");
		this.#quad = quad;
		this.#vao = vao;

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW,
		);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
	}

	get canvas(): HTMLCanvasElement | OffscreenCanvas {
		return this.#canvas;
	}

	/** True when the colour pass would be a straight copy. */
	static isIdentity(filters: FilterParams): boolean {
		return FILTER_UNIFORMS.every((key) => filters[key] === NEUTRAL_FILTERS[key]);
	}

	outputSize(spec: RenderSpec): OutputSize {
		return computeOutputSize(
			spec.sourceWidth,
			spec.sourceHeight,
			spec.crop,
			spec.rotation,
			spec.resize,
		);
	}

	render(spec: RenderSpec): OutputSize {
		if (this.#disposed) throw new RenderError("render graph has been disposed");
		const gl = this.#gl;
		const size = this.outputSize(spec);

		if (this.#canvas.width !== size.width || this.#canvas.height !== size.height) {
			this.#canvas.width = size.width;
			this.#canvas.height = size.height;
		}

		this.#sourceTexture = uploadTexture(gl, this.#sourceTexture, spec.source);

		gl.viewport(0, 0, size.width, size.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.disable(gl.BLEND);

		gl.useProgram(this.#colorProgram.program);
		gl.bindVertexArray(this.#vao);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#sourceTexture);
		gl.uniform1i(this.#colorProgram.uniforms["u_texture"] ?? null, 0);
		gl.uniform2f(
			this.#colorProgram.uniforms["u_texelSize"] ?? null,
			1 / spec.sourceWidth,
			1 / spec.sourceHeight,
		);
		gl.uniformMatrix3fv(
			this.#colorProgram.uniforms["u_uvTransform"] ?? null,
			false,
			uvTransform(spec),
		);
		// WebGL samples bottom-up; flipping here avoids a dedicated copy pass.
		gl.uniform2f(this.#colorProgram.uniforms["u_flipOutput"] ?? null, 1, -1);

		// The identity path still runs the shader: the branch lives in the
		// uniform values, never in whether the pass executes.
		const filters = spec.bypassFilters ? NEUTRAL_FILTERS : spec.filters;
		for (const name of FILTER_UNIFORMS) {
			gl.uniform1f(this.#colorProgram.uniforms[`u_${name}`] ?? null, filters[name]);
		}

		gl.drawArrays(gl.TRIANGLES, 0, 6);

		if (spec.overlay !== null) {
			this.#overlayTexture = uploadTexture(gl, this.#overlayTexture, spec.overlay);
			gl.useProgram(this.#compositeProgram.program);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.#overlayTexture);
			gl.uniform1i(this.#compositeProgram.uniforms["u_texture"] ?? null, 0);
			gl.uniform1f(this.#compositeProgram.uniforms["u_alpha"] ?? null, 1);
			gl.uniformMatrix3fv(
				this.#compositeProgram.uniforms["u_uvTransform"] ?? null,
				false,
				IDENTITY_MATRIX,
			);
			gl.uniform2f(this.#compositeProgram.uniforms["u_flipOutput"] ?? null, 1, -1);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.disable(gl.BLEND);
		}

		gl.bindVertexArray(null);
		return size;
	}

	/** Reads the rendered pixels back, for encoding and for the pixel test. */
	readPixels(size: OutputSize): Uint8ClampedArray<ArrayBuffer> {
		const gl = this.#gl;
		const buffer = new ArrayBuffer(size.width * size.height * 4);
		gl.readPixels(0, 0, size.width, size.height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(buffer));
		return new Uint8ClampedArray(buffer);
	}

	dispose(): void {
		if (this.#disposed) return;
		const gl = this.#gl;
		gl.deleteProgram(this.#colorProgram.program);
		gl.deleteProgram(this.#compositeProgram.program);
		gl.deleteBuffer(this.#quad);
		gl.deleteVertexArray(this.#vao);
		if (this.#sourceTexture !== null) gl.deleteTexture(this.#sourceTexture);
		if (this.#overlayTexture !== null) gl.deleteTexture(this.#overlayTexture);
		this.#disposed = true;
	}
}

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * Maps output UVs back into the source rectangle: crop, rotation and mirroring
 * in a single 3×3, so geometry costs no extra pass.
 */
export function uvTransform(spec: RenderSpec): Float32Array {
	const crop = spec.crop ?? {
		x: 0,
		y: 0,
		width: spec.sourceWidth,
		height: spec.sourceHeight,
	};

	const sx = crop.width / spec.sourceWidth;
	const sy = crop.height / spec.sourceHeight;
	const tx = crop.x / spec.sourceWidth;
	const ty = crop.y / spec.sourceHeight;

	const angle = (spec.rotation as Rotation) * (Math.PI / 180);
	const cos = Math.round(Math.cos(angle));
	const sin = Math.round(Math.sin(angle));

	const flipX = spec.flipHorizontal ? -1 : 1;
	const flipY = spec.flipVertical ? -1 : 1;

	// Column-major, as WebGL expects: rotate and mirror around the centre of
	// the unit square, then scale and offset into the cropped region.
	const a = cos * flipX;
	const b = sin * flipY;
	const c = -sin * flipX;
	const d = cos * flipY;

	const originX = 0.5 - (a * 0.5 + c * 0.5);
	const originY = 0.5 - (b * 0.5 + d * 0.5);

	return new Float32Array([
		a * sx,
		b * sy,
		0,
		c * sx,
		d * sy,
		0,
		originX * sx + tx,
		originY * sy + ty,
		1,
	]);
}

function uploadTexture(
	gl: WebGL2RenderingContext,
	existing: WebGLTexture | null,
	source: FrameSource,
): WebGLTexture {
	const texture = existing ?? gl.createTexture();
	if (texture === null) throw new RenderError("could not allocate a texture");

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	const data =
		source.kind === "bitmap"
			? source.bitmap
			: source.kind === "canvas"
				? source.canvas
				: source.frame;
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data as TexImageSource);
	return texture;
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string,
	uniformNames: readonly string[],
): Program {
	const program = gl.createProgram();
	if (program === null) throw new RenderError("could not create a GL program");

	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.bindAttribLocation(program, 0, "a_position");
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);

	if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
		const log = gl.getProgramInfoLog(program) ?? "unknown link error";
		gl.deleteProgram(program);
		throw new RenderError(`shader link failed: ${log}`);
	}

	const uniforms: Record<string, WebGLUniformLocation | null> = {};
	for (const name of uniformNames) {
		uniforms[name] = gl.getUniformLocation(program, name);
	}
	return { program, uniforms };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (shader === null) throw new RenderError("could not create a shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
		const log = gl.getShaderInfoLog(shader) ?? "unknown compile error";
		gl.deleteShader(shader);
		throw new RenderError(`shader compile failed: ${log}`);
	}
	return shader;
}
