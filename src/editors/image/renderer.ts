import {
	type Adjustments,
	type ImageDoc,
	NEUTRAL_ADJUSTMENTS,
	type Rect,
	type Size,
	sourceTransform,
} from './document';

const VERTEX = `#version 300 es
in vec2 aPosition;
uniform mat3 uTransform;
out vec2 vUv;
void main() {
	// Output coordinates with a top left origin, mapped to the source texture.
	vec2 uv = vec2((aPosition.x + 1.0) * 0.5, 1.0 - (aPosition.y + 1.0) * 0.5);
	vUv = (uTransform * vec3(uv, 1.0)).xy;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uTemperature;
uniform float uTint;
uniform bool uDither;
uniform bool uOpaque;
out vec4 outColor;

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
	vec4 source = texture(uSource, vUv);

	// Exposure and white balance act on light, so they work in linear space.
	vec3 c = toLinear(source.rgb) * exp2(uExposure);
	c *= vec3(1.0 + uTemperature * 0.3 + uTint * 0.1, 1.0 - uTint * 0.2, 1.0 - uTemperature * 0.3 + uTint * 0.1);
	c = toSrgb(clamp(c, 0.0, 1.0));

	// Brightness, contrast and saturation act on perception, so they work in sRGB.
	c = pow(c, vec3(exp2(-uBrightness)));
	c = (c - 0.5) * (1.0 + uContrast) + 0.5;
	float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(luma), c, 1.0 + uSaturation);

	// Half a step of noise breaks the banding that edits create in smooth gradients.
	if (uDither) c += (noise(gl_FragCoord.xy) - 0.5) / 255.0;

	float alpha = uOpaque ? 1.0 : source.a;
	if (uOpaque) c = mix(vec3(1.0), clamp(c, 0.0, 1.0), source.a);
	outColor = vec4(clamp(c, 0.0, 1.0), alpha);
}`;

type Uniform =
	| 'uTransform'
	| 'uSource'
	| 'uExposure'
	| 'uBrightness'
	| 'uContrast'
	| 'uSaturation'
	| 'uTemperature'
	| 'uTint'
	| 'uDither'
	| 'uOpaque';

export interface RenderOptions {
	/** Area of the oriented image to draw, in pixels. */
	region: Rect;
	/** Ignore the adjustments, to compare with the original. */
	original?: boolean;
	/** Flatten transparency on white, for formats without an alpha channel. */
	opaque?: boolean;
}

function compile(gl: WebGL2RenderingContext, type: number, code: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('Could not create a shader');
	gl.shaderSource(shader, code);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
		throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error');
	return shader;
}

/**
 * Draws an image document with WebGL2. The same renderer draws the preview on screen and the
 * export at full size, which is what guarantees that the export matches the preview.
 */
export class ImageRenderer {
	private readonly gl: WebGL2RenderingContext;
	private readonly program: WebGLProgram;
	private readonly uniforms = new Map<Uniform, WebGLUniformLocation | null>();
	private texture: WebGLTexture | null = null;
	private sourceSize: Size | null = null;

	constructor(private readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
		const gl = canvas.getContext('webgl2', {
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
			antialias: false,
		});
		if (!gl) throw new Error('WebGL 2 is not available');
		this.gl = gl;

		const program = gl.createProgram();
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? 'Link error');
		this.program = program;
		gl.useProgram(program);

		const names: Uniform[] = [
			'uTransform',
			'uSource',
			'uExposure',
			'uBrightness',
			'uContrast',
			'uSaturation',
			'uTemperature',
			'uTint',
			'uDither',
			'uOpaque',
		];
		for (const name of names) this.uniforms.set(name, gl.getUniformLocation(program, name));

		// Two triangles covering the whole output.
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, 'aPosition');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	}

	setSource(source: ImageBitmap): void {
		const gl = this.gl;
		if (this.texture) gl.deleteTexture(this.texture);
		this.texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
		// Mipmaps give clean downscaling when the preview or the export is smaller than the source.
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.sourceSize = { width: source.width, height: source.height };
	}

	render(doc: ImageDoc, { region, original = false, opaque = false }: RenderOptions): void {
		const gl = this.gl;
		if (!this.texture || !this.sourceSize) return;
		const adjust: Adjustments = original ? NEUTRAL_ADJUSTMENTS : doc.adjust;
		const u = (name: Uniform) => this.uniforms.get(name) ?? null;

		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.uniform1i(u('uSource'), 0);
		gl.uniformMatrix3fv(u('uTransform'), false, sourceTransform(doc, this.sourceSize, region));
		gl.uniform1f(u('uExposure'), adjust.exposure / 50);
		gl.uniform1f(u('uBrightness'), adjust.brightness / 100);
		gl.uniform1f(u('uContrast'), adjust.contrast < 0 ? adjust.contrast / 125 : adjust.contrast / 100);
		gl.uniform1f(u('uSaturation'), adjust.saturation / 100);
		gl.uniform1f(u('uTemperature'), adjust.temperature / 100);
		gl.uniform1f(u('uTint'), adjust.tint / 100);
		gl.uniform1i(u('uDither'), original ? 0 : 1);
		gl.uniform1i(u('uOpaque'), opaque ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	dispose(): void {
		if (this.texture) this.gl.deleteTexture(this.texture);
		this.gl.deleteProgram(this.program);
		this.texture = null;
	}
}
