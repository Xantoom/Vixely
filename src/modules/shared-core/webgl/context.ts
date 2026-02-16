export interface GLContext {
	gl: WebGL2RenderingContext;
	canvas: HTMLCanvasElement | OffscreenCanvas;
	vao: WebGLVertexArrayObject;
	quadBuffer: WebGLBuffer;
}

const QUAD_VERTICES = new Float32Array([
	// position (x,y), texcoord (u,v)
	-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
]);

export function createWebGL2Context(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	options?: WebGLContextAttributes,
): GLContext {
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: false,
		powerPreference: 'high-performance',
		...options,
	});

	if (!gl || !(gl instanceof WebGL2RenderingContext)) throw new Error('WebGL2 not supported');

	const vao = gl.createVertexArray();
	if (!vao) throw new Error('Failed to create VAO');

	const quadBuffer = gl.createBuffer();
	if (!quadBuffer) throw new Error('Failed to create buffer');

	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

	// position attribute (location 0)
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

	// texcoord attribute (location 1)
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

	gl.bindVertexArray(null);

	return { gl, canvas, vao, quadBuffer };
}

export function setupContextLossHandling(
	canvas: HTMLCanvasElement,
	onLost: () => void,
	onRestored: () => void,
): () => void {
	const handleLost = (e: Event) => {
		e.preventDefault();
		onLost();
	};
	const handleRestored = () => {
		onRestored();
	};

	canvas.addEventListener('webglcontextlost', handleLost);
	canvas.addEventListener('webglcontextrestored', handleRestored);

	return () => {
		canvas.removeEventListener('webglcontextlost', handleLost);
		canvas.removeEventListener('webglcontextrestored', handleRestored);
	};
}

export function destroyGLContext(ctx: GLContext): void {
	const { gl, vao, quadBuffer } = ctx;
	gl.deleteVertexArray(vao);
	gl.deleteBuffer(quadBuffer);
	gl.getExtension('WEBGL_lose_context')?.loseContext();
}

export function drawQuad(ctx: GLContext): void {
	const { gl, vao } = ctx;
	gl.bindVertexArray(vao);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	gl.bindVertexArray(null);
}
