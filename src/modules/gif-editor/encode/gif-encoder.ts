/**
 * Pure-JS GIF encoder built on top of `gifenc`.
 *
 * Uses a single global color table (GCT) for the whole animation rather than a
 * per-frame local color table. This gives smaller files, broader viewer
 * compatibility, and matches the standard pattern used by ImageMagick/gifsicle.
 */

import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export interface GifEncodeOptions {
	/** Each entry is a frame in raw RGBA (width * height * 4 bytes). */
	frames: Uint8Array[];
	width: number;
	height: number;
	fps: number;
	/** 2..256 — palette size. Defaults to 256. Lower = smaller file, less color fidelity. */
	maxColors?: number;
	/** Legacy compression speed knob from the previous WASM encoder. Accepted
	 *  for API compatibility but ignored — gifenc has no equivalent. */
	speed?: number;
	/** 0 = infinite, N = play N times. */
	loopCount?: number;
	/** Per-frame delays in centiseconds. Falls back to 1/fps when missing. */
	frameDelaysCs?: number[];
	/** 0..1, called as encoding progresses. */
	onProgress?: (progress: number) => void;
}

const QUANTIZE_FORMAT = 'rgb565';

// How many frames to sample when building the global palette. More frames =
// better palette fit across the whole animation, but slower. 16 keeps quantize
// under ~100 ms even for HD frames.
const PALETTE_SAMPLE_FRAMES = 16;

// Yield to the host event loop every N frames so the worker can process
// cancellation messages and the main thread (when used directly) stays
// responsive.
const YIELD_EVERY_FRAMES = 8;

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

function delayMsForFrame(index: number, fps: number, frameDelaysCs?: number[]): number {
	const fallback = Math.max(1, Math.round(1000 / Math.max(1, fps)));
	if (!frameDelaysCs) return fallback;
	const cs = frameDelaysCs[index];
	if (cs == null || !Number.isFinite(cs) || cs <= 0) return fallback;
	return cs * 10;
}

/**
 * Build a single representative palette from a sample of frames spread across
 * the whole animation. Concatenating raw RGBA from N frames means the
 * quantizer sees a fair distribution of colors instead of overfitting to the
 * first frame.
 */
function buildGlobalPalette(frames: Uint8Array[], frameSize: number, maxColors: number): number[][] {
	const totalFrames = frames.length;
	const sampleCount = Math.min(totalFrames, PALETTE_SAMPLE_FRAMES);
	if (sampleCount === 1) {
		const only = frames[0]!;
		const rgba = only.length === frameSize ? only : only.subarray(0, frameSize);
		return quantize(rgba, maxColors, { format: QUANTIZE_FORMAT });
	}

	const stride = (totalFrames - 1) / (sampleCount - 1);
	const combined = new Uint8Array(frameSize * sampleCount);
	for (let s = 0; s < sampleCount; s++) {
		const i = Math.round(s * stride);
		const raw = frames[i]!;
		const rgba = raw.length === frameSize ? raw : raw.subarray(0, frameSize);
		combined.set(rgba, s * frameSize);
	}
	return quantize(combined, maxColors, { format: QUANTIZE_FORMAT });
}

export async function encodeGif(options: GifEncodeOptions): Promise<Blob> {
	const { frames, width, height, fps, maxColors = 256, loopCount = 0, frameDelaysCs, onProgress } = options;

	if (frames.length === 0) throw new Error('No frames provided to GIF encoder');

	const palette = buildGlobalPalette(frames, width * height * 4, clamp(Math.round(maxColors), 2, 256));
	const frameSize = width * height * 4;
	const encoder = GIFEncoder();

	// Quick fingerprint helper so we can confirm the worker is feeding distinct
	// frames into the encoder (identical first 16 bytes = identical RGBA prefix).
	const fingerprint = (arr: Uint8Array): string => {
		let s = '';
		for (let k = 0; k < Math.min(16, arr.length); k++) {
			s += arr[k]!.toString(16).padStart(2, '0');
		}
		return s;
	};

	const debugSamples: Array<{ i: number; rgbaPrefix: string; indexedPrefix: string; indexedSum: number }> = [];

	for (let i = 0; i < frames.length; i++) {
		const raw = frames[i]!;
		// Frames coming from the worker are sometimes oversized — slice to the
		// expected RGBA length so applyPalette never reads beyond it.
		const rgba = raw.length === frameSize ? raw : raw.subarray(0, frameSize);

		const indexed = applyPalette(rgba, palette, QUANTIZE_FORMAT);

		// Sample 5 evenly-spaced frames so we can later verify they differ.
		if (
			i === 0 ||
			i === 1 ||
			i === Math.floor(frames.length / 2) ||
			i === frames.length - 2 ||
			i === frames.length - 1
		) {
			let sum = 0;
			for (let k = 0; k < indexed.length; k++) sum += indexed[k]!;
			debugSamples.push({
				i,
				rgbaPrefix: fingerprint(rgba),
				indexedPrefix: fingerprint(indexed),
				indexedSum: sum,
			});
		}

		encoder.writeFrame(indexed, width, height, {
			// Pass the palette only on the first frame so it becomes the global
			// color table; subsequent frames reuse it (no LCT) which keeps the
			// file small and avoids viewer quirks with frame-by-frame palettes.
			palette: i === 0 ? palette : undefined,
			delay: delayMsForFrame(i, fps, frameDelaysCs),
			repeat: i === 0 ? loopCount : undefined,
		});

		onProgress?.((i + 1) / frames.length);

		if (i % YIELD_EVERY_FRAMES === YIELD_EVERY_FRAMES - 1) {
			// Macrotask yield — keeps the worker able to receive postMessage.
			// eslint-disable-next-line no-await-in-loop
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		}
	}

	encoder.finish();
	const bytes = encoder.bytes();

	console.debug('[gif-encoder] frame samples', {
		totalFrames: frames.length,
		width,
		height,
		paletteSize: palette.length,
		outputBytes: bytes.byteLength,
		samples: debugSamples,
	});

	// Copy into a fresh Uint8Array so the resulting blob owns a stable buffer
	// (gifenc internally reuses its growable buffer between calls).
	const stable = new Uint8Array(bytes.byteLength);
	stable.set(bytes);

	return new Blob([stable.buffer], { type: 'image/gif' });
}
