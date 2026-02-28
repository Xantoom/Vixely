/**
 * Rust WASM GIF encoder wrapper.
 * Passes concatenated RGBA frames to Rust's encode_gif_frames() / encode_gif_frames_ex().
 */

export interface GifEncodeOptions {
	frames: Uint8Array[];
	width: number;
	height: number;
	fps: number;
	maxColors?: number;
	speed?: number;
	loopCount?: number;
	frameDelaysCs?: number[];
	onProgress?: (progress: number) => void;
}

/**
 * Encode RGBA frames into a GIF using the Rust WASM encoder.
 */
export async function encodeGif(options: GifEncodeOptions): Promise<Blob> {
	const { frames, width, height, fps, maxColors = 256, speed = 10, loopCount = 0, frameDelaysCs } = options;

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
			encode_gif_frames_ex: (
				rgba_data: Uint8Array,
				width: number,
				height: number,
				frame_count: number,
				delay_cs: number,
				max_colors: number,
				speed: number,
				loop_count: number,
				frame_delays_cs: Uint16Array,
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

	const hasPerFrameDelays = frameDelaysCs && frameDelaysCs.length > 0;
	const needsExtended = loopCount !== 0 || hasPerFrameDelays;

	let gifBytes: Uint8Array;

	if (needsExtended) {
		const delays = hasPerFrameDelays ? new Uint16Array(frameDelaysCs) : new Uint16Array(0);
		gifBytes = wasm.encode_gif_frames_ex(
			concatenated,
			width,
			height,
			frames.length,
			delayCentiseconds,
			maxColors,
			speed,
			loopCount,
			delays,
		);
	} else {
		gifBytes = wasm.encode_gif_frames(
			concatenated,
			width,
			height,
			frames.length,
			delayCentiseconds,
			maxColors,
			speed,
		);
	}

	options.onProgress?.(1);

	const stableBytes = new Uint8Array(gifBytes.byteLength);
	stableBytes.set(gifBytes);
	return new Blob([stableBytes.buffer], { type: 'image/gif' });
}
