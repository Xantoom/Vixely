import {
	type Adjustments,
	createImageDoc,
	type ImageDoc,
	NEUTRAL_ADJUSTMENTS,
	orientedSize,
	type Rect,
	type Rotation,
	type Size,
	sourceTransform,
} from './document';

/** `a` after `b`, for column-major 3×3 matrices: a point goes through `b`, then `a`. */
function multiply(a: Float32Array, b: Float32Array): Float32Array {
	const out = new Float32Array(9);
	for (let column = 0; column < 3; column++) {
		for (let row = 0; row < 3; row++) {
			let sum = 0;
			for (let k = 0; k < 3; k++) sum += (a[k * 3 + row] ?? 0) * (b[column * 3 + k] ?? 0);
			out[column * 3 + row] = sum;
		}
	}
	return out;
}

const VERTEX = `#version 300 es
in vec2 aPosition;
uniform mat3 uTransform;
uniform bool uFlipY;
out vec2 vUv;
out vec2 vOut;
void main() {
	// Output coordinates with a top left origin, mapped to the source texture. Flipped when the
	// pixels are read back, since readPixels returns rows from the bottom.
	float v = (aPosition.y + 1.0) * 0.5;
	vOut = vec2((aPosition.x + 1.0) * 0.5, uFlipY ? v : 1.0 - v);
	vUv = (uTransform * vec3(vOut, 1.0)).xy;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/** Vignette, grain, dithering and flattening: the last steps, on the picture at its output size. */
const FINISH = `
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform bool uDither;
uniform bool uOpaque;

float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 finish(vec3 c, float alpha, vec2 uv) {
	if (uVignette != 0.0) {
		// 0 in the middle, 1 in the corners, whatever the shape of the picture.
		float edge = smoothstep(0.2, 1.0, length((uv - 0.5) * 2.0) / 1.41421);
		c = uVignette > 0.0 ? c * (1.0 - edge * uVignette) : mix(c, vec3(1.0), edge * -uVignette);
	}
	if (uGrain > 0.0) {
		// Two samples averaged: softer, film-like grain rather than hard digital noise.
		vec2 p = gl_FragCoord.xy + uSeed;
		float n = (noise(p) + noise(p + 17.31)) * 0.5 - 0.5;
		c += n * uGrain;
	}
	// Half a step of noise breaks the banding that edits create in smooth gradients.
	if (uDither) c += (noise(gl_FragCoord.xy + 3.7) - 0.5) / 255.0;
	c = clamp(c, 0.0, 1.0);
	if (uOpaque) return vec4(mix(vec3(1.0), c, alpha), 1.0);
	return vec4(c, alpha);
}`;

const COLOR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vOut;
uniform sampler2D uSource;
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uSaturation;
uniform float uTemperature;
uniform float uTint;
uniform float uHue;
uniform float uSepia;
/** Straight to the output; otherwise the blur passes follow and finish the picture. */
uniform bool uFinish;
out vec4 outColor;
${FINISH}

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
	vec4 source = texture(uSource, vUv);

	// Exposure and white balance act on light, so they work in linear space.
	vec3 c = toLinear(source.rgb) * exp2(uExposure);
	c *= vec3(1.0 + uTemperature * 0.3 + uTint * 0.1, 1.0 - uTint * 0.2, 1.0 - uTemperature * 0.3 + uTint * 0.1);
	c = toSrgb(clamp(c, 0.0, 1.0));

	// Shadows and highlights bend the curve at one end only, weighted by how dark or light it is.
	float l = luma(c);
	c = mix(c, pow(c, vec3(exp2(-uShadows))), 1.0 - smoothstep(0.0, 0.6, l));
	c = mix(c, 1.0 - pow(1.0 - c, vec3(exp2(uHighlights))), smoothstep(0.4, 1.0, l));

	// Brightness, contrast and saturation act on perception, so they work in sRGB.
	c = pow(c, vec3(exp2(-uBrightness)));
	c = (c - 0.5) * (1.0 + uContrast) + 0.5;
	c = mix(vec3(luma(c)), c, 1.0 + uSaturation);

	if (uHue != 0.0) {
		// Turns the chroma around the grey axis, in YIQ, keeping the luma.
		float y = dot(c, vec3(0.299, 0.587, 0.114));
		vec2 iq = vec2(dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
		float s = sin(uHue);
		float k = cos(uHue);
		iq = vec2(iq.x * k - iq.y * s, iq.x * s + iq.y * k);
		c = vec3(y + 0.956 * iq.x + 0.621 * iq.y, y - 0.272 * iq.x - 0.647 * iq.y, y - 1.106 * iq.x + 1.703 * iq.y);
	}
	if (uSepia > 0.0) {
		vec3 tone = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
		c = mix(c, tone, uSepia);
	}
	c = clamp(c, 0.0, 1.0);
	outColor = uFinish ? finish(c, source.a, vOut) : vec4(c, source.a);
}`;

const PASS_VERTEX = `#version 300 es
in vec2 aPosition;
uniform bool uFlipY;
out vec2 vUv;
void main() {
	// Intermediate pictures are stored bottom row first, as the passes drew them.
	vUv = (aPosition + 1.0) * 0.5;
	if (uFlipY) vUv.y = 1.0 - vUv.y;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/** One direction of a Gaussian blur, at most 2 × 40 + 1 samples however wide. */
const BLUR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uInput;
/** One texel along the direction of this pass. */
uniform vec2 uStep;
uniform float uRadius;
uniform bool uFinish;
out vec4 outColor;
${FINISH}

void main() {
	int taps = int(min(ceil(uRadius), 40.0));
	float spacing = uRadius / float(taps);
	float sigma = uRadius / 2.5;
	vec4 sum = vec4(0.0);
	float total = 0.0;
	for (int i = -40; i <= 40; i++) {
		if (i < -taps || i > taps) continue;
		float offset = float(i) * spacing;
		float weight = exp(-offset * offset / (2.0 * sigma * sigma));
		vec4 texel = texture(uInput, vUv + uStep * offset);
		// Premultiplied, so transparent pixels don't bleed their colour into the edges.
		sum += vec4(texel.rgb * texel.a, texel.a) * weight;
		total += weight;
	}
	sum /= total;
	vec3 c = sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0);
	// The picture is stored bottom row first: flip back to a top left origin for the vignette.
	vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
	outColor = uFinish ? finish(c, sum.a, uv) : vec4(c, sum.a);
}`;

type ColorUniform =
	| 'uTransform'
	| 'uSource'
	| 'uExposure'
	| 'uBrightness'
	| 'uContrast'
	| 'uHighlights'
	| 'uShadows'
	| 'uSaturation'
	| 'uTemperature'
	| 'uTint'
	| 'uHue'
	| 'uSepia'
	| 'uFinish'
	| 'uFlipY'
	| FinishUniform;

type BlurUniform = 'uInput' | 'uStep' | 'uRadius' | 'uFinish' | 'uFlipY' | FinishUniform;

type FinishUniform = 'uVignette' | 'uGrain' | 'uSeed' | 'uDither' | 'uOpaque';

const FINISH_UNIFORMS: FinishUniform[] = ['uVignette', 'uGrain', 'uSeed', 'uDither', 'uOpaque'];

export interface RenderOptions {
	/** Area of the oriented image to draw, in pixels. */
	region: Rect;
	/** Ignore the adjustments, to compare with the original. */
	original?: boolean;
	/** Flatten transparency on white, for formats without an alpha channel. */
	opaque?: boolean;
	/** Draw upside down, so `readPixels` returns rows from the top. */
	flipY?: boolean;
	/** Moves the grain: a video passes its time, so the grain lives instead of sitting on the screen. */
	seed?: number;
}

/** Blur radius at 100, as a share of the picture's shorter side: the same look at any size. */
const BLUR_SHARE = 0.03;

function compile(gl: WebGL2RenderingContext, type: number, code: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('Could not create a shader');
	gl.shaderSource(shader, code);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
		throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error');
	return shader;
}

class Program<U extends string> {
	readonly program: WebGLProgram;
	private readonly locations = new Map<U, WebGLUniformLocation | null>();

	constructor(
		private readonly gl: WebGL2RenderingContext,
		vertex: string,
		fragment: string,
		names: U[],
	) {
		const program = gl.createProgram();
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
		// Both programs read the same quad at the same place.
		gl.bindAttribLocation(program, 0, 'aPosition');
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? 'Link error');
		this.program = program;
		for (const name of names) this.locations.set(name, gl.getUniformLocation(program, name));
	}

	use(): void {
		this.gl.useProgram(this.program);
	}

	at(name: U): WebGLUniformLocation | null {
		return this.locations.get(name) ?? null;
	}

	dispose(): void {
		this.gl.deleteProgram(this.program);
	}
}

/** A picture drawn by one pass and read by the next. */
interface Target {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
}

/**
 * Draws an image document with WebGL2. The same renderer draws the preview on screen and the
 * export at full size, which is what guarantees that the export matches the preview.
 */
export class ImageRenderer {
	private readonly gl: WebGL2RenderingContext;
	private readonly color: Program<ColorUniform>;
	private readonly blur: Program<BlurUniform>;
	private texture: WebGLTexture | null = null;
	/** The blur's intermediate pictures, at the size of the canvas. */
	private targets: { width: number; height: number; pair: [Target, Target] } | null = null;
	/** Intermediate pictures in half floats where the GPU can draw them, to keep smooth gradients. */
	private readonly floatTargets: boolean;
	/** Size of the picture the document's coordinates refer to: a video's once turned upright. */
	private sourceSize: Size | null = null;
	/** Maps the upright picture to the texture, for videos stored turned (phones). */
	private base: Float32Array | null = null;

	constructor(private readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
		const gl = canvas.getContext('webgl2', {
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
			antialias: false,
		});
		if (!gl) throw new Error('WebGL 2 is not available');
		this.gl = gl;
		this.floatTargets = gl.getExtension('EXT_color_buffer_float') !== null;

		this.color = new Program<ColorUniform>(gl, VERTEX, COLOR_FRAGMENT, [
			'uTransform',
			'uSource',
			'uExposure',
			'uBrightness',
			'uContrast',
			'uHighlights',
			'uShadows',
			'uSaturation',
			'uTemperature',
			'uTint',
			'uHue',
			'uSepia',
			'uFinish',
			'uFlipY',
			...FINISH_UNIFORMS,
		]);
		this.blur = new Program<BlurUniform>(gl, PASS_VERTEX, BLUR_FRAGMENT, [
			'uInput',
			'uStep',
			'uRadius',
			'uFinish',
			'uFlipY',
			...FINISH_UNIFORMS,
		]);

		// Two triangles covering the whole output.
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	}

	setSource(source: ImageBitmap): void {
		this.upload(source);
		this.sourceSize = { width: source.width, height: source.height };
		this.base = null;
	}

	/**
	 * A picture of a video, `size` as stored (square pixels) and `rotation` the video's own, applied
	 * before the document's: the document sees the picture upright, as players show it.
	 */
	setFrame(source: TexImageSource, size: Size, rotation: Rotation): void {
		this.upload(source);
		const upright = orientedSize(size, rotation);
		this.sourceSize = upright;
		this.base =
			rotation === 0
				? null
				: sourceTransform({ ...createImageDoc(), rotation }, size, { x: 0, y: 0, ...upright });
	}

	/** Whether a picture was given: until then, nothing is drawn. */
	get ready(): boolean {
		return this.texture !== null;
	}

	private upload(source: TexImageSource): void {
		const gl = this.gl;
		// Video pictures come one after the other: the same texture takes each.
		this.texture ??= gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
		// Mipmaps give clean downscaling when the preview or the export is smaller than the source.
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	private createTarget(width: number, height: number): Target {
		const gl = this.gl;
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		if (this.floatTargets)
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return { texture, framebuffer };
	}

	private blurTargets(width: number, height: number): [Target, Target] {
		if (this.targets?.width === width && this.targets.height === height) return this.targets.pair;
		this.releaseTargets();
		const pair: [Target, Target] = [this.createTarget(width, height), this.createTarget(width, height)];
		this.targets = { width, height, pair };
		return pair;
	}

	private releaseTargets(): void {
		if (!this.targets) return;
		for (const target of this.targets.pair) {
			this.gl.deleteTexture(target.texture);
			this.gl.deleteFramebuffer(target.framebuffer);
		}
		this.targets = null;
	}

	private setFinish<U extends string>(
		program: Program<U | FinishUniform>,
		adjust: Adjustments,
		options: { original: boolean; opaque: boolean; seed: number },
	): void {
		const gl = this.gl;
		gl.uniform1f(program.at('uVignette'), (adjust.vignette / 100) * 0.85);
		gl.uniform1f(program.at('uGrain'), (adjust.grain / 100) * 0.3);
		gl.uniform1f(program.at('uSeed'), options.seed % 1000);
		gl.uniform1i(program.at('uDither'), options.original ? 0 : 1);
		gl.uniform1i(program.at('uOpaque'), options.opaque ? 1 : 0);
	}

	render(doc: ImageDoc, { region, original = false, opaque = false, flipY = false, seed = 0 }: RenderOptions): void {
		const gl = this.gl;
		if (!this.texture || !this.sourceSize) return;
		const adjust: Adjustments = original ? NEUTRAL_ADJUSTMENTS : doc.adjust;
		const { width, height } = this.canvas;
		const radius = (adjust.blur / 100) * BLUR_SHARE * Math.min(width, height);
		const blurred = radius >= 0.5;
		const pair = blurred ? this.blurTargets(width, height) : null;

		// Colours, straight to the canvas, or to the first picture of the blur.
		const color = this.color;
		color.use();
		gl.viewport(0, 0, width, height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, pair ? pair[0].framebuffer : null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.uniform1i(color.at('uSource'), 0);
		const transform = sourceTransform(doc, this.sourceSize, region);
		gl.uniformMatrix3fv(color.at('uTransform'), false, this.base ? multiply(this.base, transform) : transform);
		gl.uniform1f(color.at('uExposure'), adjust.exposure / 50);
		gl.uniform1f(color.at('uBrightness'), adjust.brightness / 100);
		gl.uniform1f(color.at('uContrast'), adjust.contrast < 0 ? adjust.contrast / 125 : adjust.contrast / 100);
		gl.uniform1f(color.at('uHighlights'), (adjust.highlights / 100) * 1.2);
		gl.uniform1f(color.at('uShadows'), (adjust.shadows / 100) * 1.2);
		gl.uniform1f(color.at('uSaturation'), adjust.saturation / 100);
		gl.uniform1f(color.at('uTemperature'), adjust.temperature / 100);
		gl.uniform1f(color.at('uTint'), adjust.tint / 100);
		gl.uniform1f(color.at('uHue'), (adjust.hue * Math.PI) / 180);
		gl.uniform1f(color.at('uSepia'), adjust.sepia / 100);
		gl.uniform1i(color.at('uFinish'), pair ? 0 : 1);
		// Intermediate pictures are drawn upright; only the last pass flips.
		gl.uniform1i(color.at('uFlipY'), !pair && flipY ? 1 : 0);
		this.setFinish(color, adjust, { original, opaque, seed });
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		if (!pair) return;

		// The blur, across then down; the second pass finishes the picture on the canvas.
		const blur = this.blur;
		blur.use();
		gl.uniform1i(blur.at('uInput'), 0);
		gl.uniform1f(blur.at('uRadius'), radius);
		this.setFinish(blur, adjust, { original, opaque, seed });
		const passes: [Target, WebGLFramebuffer | null, [number, number], boolean][] = [
			[pair[0], pair[1].framebuffer, [1 / width, 0], false],
			[pair[1], null, [0, 1 / height], true],
		];
		for (const [input, output, step, last] of passes) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, output);
			gl.bindTexture(gl.TEXTURE_2D, input.texture);
			gl.uniform2f(blur.at('uStep'), step[0], step[1]);
			gl.uniform1i(blur.at('uFinish'), last ? 1 : 0);
			gl.uniform1i(blur.at('uFlipY'), last && flipY ? 1 : 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
	}

	/** Straight RGBA pixels of the last render. Render with `flipY` to get rows from the top. */
	readPixels(): Uint8Array {
		const { width, height } = this.canvas;
		const pixels = new Uint8Array(width * height * 4);
		this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
		return pixels;
	}

	dispose(): void {
		if (this.texture) this.gl.deleteTexture(this.texture);
		this.releaseTargets();
		this.color.dispose();
		this.blur.dispose();
		this.texture = null;
	}
}
