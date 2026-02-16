export { createWebGL2Context, setupContextLossHandling, destroyGLContext, drawQuad } from './context.ts';
export type { GLContext } from './context.ts';

export {
	FULLSCREEN_VERTEX,
	COLOR_CORRECTION_FRAGMENT,
	BLUR_FRAGMENT,
	GRAIN_FRAGMENT,
	COMPARE_FRAGMENT,
} from './shaders.ts';

export {
	compileShader,
	linkProgram,
	getUniformLocations,
	setUniform1f,
	setUniform2f,
	setUniform1i,
} from './programs.ts';
export type { UniformLocations } from './programs.ts';

export {
	createTexture,
	uploadImageBitmap,
	uploadVideoFrame,
	uploadImageData,
	createEmptyTexture,
	bindTexture,
	deleteTexture,
} from './textures.ts';

export {
	createFramebuffer,
	resizeFramebuffer,
	bindFramebuffer,
	unbindFramebuffer,
	readPixelsFromFramebuffer,
	deleteFramebuffer,
	createPingPongBuffers,
	resizePingPongBuffers,
	deletePingPongBuffers,
} from './framebuffer.ts';
export type { Framebuffer, PingPongBuffers } from './framebuffer.ts';
