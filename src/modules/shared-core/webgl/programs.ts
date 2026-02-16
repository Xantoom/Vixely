export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('Failed to create shader');

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${log}`);
	}

	return shader;
}

export function linkProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

	const program = gl.createProgram();
	if (!program) throw new Error('Failed to create program');

	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);

	gl.deleteShader(vs);
	gl.deleteShader(fs);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Program link error: ${log}`);
	}

	return program;
}

export interface UniformLocations {
	[name: string]: WebGLUniformLocation | null;
}

export function getUniformLocations(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	names: string[],
): UniformLocations {
	const locations: UniformLocations = {};
	for (const name of names) {
		locations[name] = gl.getUniformLocation(program, name);
	}
	return locations;
}

export function setUniform1f(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, value: number): void {
	if (loc !== null) gl.uniform1f(loc, value);
}

export function setUniform2f(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, x: number, y: number): void {
	if (loc !== null) gl.uniform2f(loc, x, y);
}

export function setUniform1i(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, value: number): void {
	if (loc !== null) gl.uniform1i(loc, value);
}
