/**
 * Rust WASM GIF encoder wrapper.
 * Passes concatenated RGBA frames to Rust's encode_gif_frames().
 */

export interface GifEncodeOptions {
	frames: Uint8Array[];
	width: number;
	height: number;
	fps: number;
	maxColors?: number;
	speed?: number;
	onProgress?: (progress: number) => void;
}

/**
 * Encode RGBA frames into a GIF using the Rust WASM encoder.
 */
export async function encodeGif(options: GifEncodeOptions): Promise<Blob> {
	const { frames, width, height, fps, maxColors = 256, speed = 10 } = options;

	// Dynamically import the WASM module
	const wasm =
		(await import('../../../../wasm/vixely_core.js')) as typeof import('../../../../wasm/vixely_core.js') & {
			encode_gif_frames: (
				rgba_data: Uint8Array,
				width: number,
				height: number,
				frame_count: number,
				delay_cs: number,
				max_colors: number,
				speed: number,
			) => Uint8Array;
		};

	const frameSize = width * height * 4;
	const totalSize = frameSize * frames.length;
	const concatenated = new Uint8Array(totalSize);

	let offset = 0;
	for (const frame of frames) {
		concatenated.set(frame.subarray(0, frameSize), offset);
		offset += frameSize;
	}

	const delayCentiseconds = Math.round(100 / fps);

	options.onProgress?.(0.5);

	const gifBytes = wasm.encode_gif_frames(
		concatenated,
		width,
		height,
		frames.length,
		delayCentiseconds,
		maxColors,
		speed,
	);

	options.onProgress?.(1);

	const stableBytes = new Uint8Array(gifBytes.byteLength);
	stableBytes.set(gifBytes);
	return new Blob([stableBytes.buffer], { type: 'image/gif' });
}
