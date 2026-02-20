import type { PhotoWebGLRenderer } from './webgl-renderer.ts';

/**
 * Read pixel data from the WebGL canvas after rendering.
 * Only needed for export or piping to Rust heavy filters.
 */
export function readPixelsAsImageData(renderer: PhotoWebGLRenderer): ImageData {
	const pixels = renderer.readPixels();
	const { width, height } = renderer;

	// WebGL readPixels is bottom-up, flip vertically
	const flipped = new Uint8ClampedArray(pixels.length);
	const rowSize = width * 4;
	for (let y = 0; y < height; y++) {
		const srcOffset = y * rowSize;
		const dstOffset = (height - 1 - y) * rowSize;
		for (let x = 0; x < rowSize; x++) {
			flipped[dstOffset + x] = pixels[srcOffset + x]!;
		}
	}

	return new ImageData(flipped, width, height);
}

/**
 * Read pixels directly as Uint8Array (no flip — for raw processing).
 */
export function readPixelsRaw(renderer: PhotoWebGLRenderer): Uint8Array {
	return renderer.readPixels();
}
