/**
 * Palette quantisation.
 *
 * GIF carries at most 256 colours, which is the format's limit and not ours.
 * Median cut is used rather than a neural or octree approach: it is
 * deterministic, it is fast enough to run per frame on a 500-frame file, and
 * its failure mode — slight banding in smooth gradients — is the one users
 * expect from a GIF.
 */

export type Rgb = readonly [number, number, number];
export type Palette = readonly Rgb[];

export type QuantizeOptions = {
	/** Palette size, 2 to 256. */
	readonly colors: number;
	/** Alpha below this becomes the transparent index. */
	readonly alphaThreshold: number;
};

const CHANNELS = 4;

type Box = {
	readonly pixels: Uint8ClampedArray;
	readonly indices: number[];
};

function boxRange(box: Box, channel: number): { min: number; max: number } {
	let min = 255;
	let max = 0;
	for (const index of box.indices) {
		const value = box.pixels[index * CHANNELS + channel] ?? 0;
		if (value < min) min = value;
		if (value > max) max = value;
	}
	return { min, max };
}

function widestChannel(box: Box): number {
	let widest = 0;
	let widestSpread = -1;
	for (let channel = 0; channel < 3; channel++) {
		const { min, max } = boxRange(box, channel);
		const spread = max - min;
		if (spread > widestSpread) {
			widestSpread = spread;
			widest = channel;
		}
	}
	return widest;
}

function averageColor(box: Box): Rgb {
	let r = 0;
	let g = 0;
	let b = 0;
	for (const index of box.indices) {
		r += box.pixels[index * CHANNELS] ?? 0;
		g += box.pixels[index * CHANNELS + 1] ?? 0;
		b += box.pixels[index * CHANNELS + 2] ?? 0;
	}
	const count = Math.max(1, box.indices.length);
	return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

/**
 * Builds a palette by repeatedly splitting the widest box at its median.
 *
 * Splitting at the median rather than the midpoint is what keeps rare colours
 * from claiming a slot they do not deserve.
 */
export function buildPalette(pixels: Uint8ClampedArray, options: QuantizeOptions): Palette {
	const wanted = Math.max(2, Math.min(256, options.colors));
	const opaque: number[] = [];
	for (let index = 0; index * CHANNELS < pixels.length; index++) {
		if ((pixels[index * CHANNELS + 3] ?? 255) >= options.alphaThreshold) opaque.push(index);
	}

	if (opaque.length === 0) return [[0, 0, 0]];

	let boxes: Box[] = [{ pixels, indices: opaque }];

	while (boxes.length < wanted) {
		// Split the box with the widest spread; splitting the largest by count
		// would spend the palette on flat backgrounds.
		let target = -1;
		let targetSpread = 0;
		for (const [position, box] of boxes.entries()) {
			if (box.indices.length < 2) continue;
			const channel = widestChannel(box);
			const { min, max } = boxRange(box, channel);
			if (max - min > targetSpread) {
				targetSpread = max - min;
				target = position;
			}
		}
		if (target === -1 || targetSpread === 0) break;

		const box = boxes[target];
		if (box === undefined) break;
		const channel = widestChannel(box);
		const sorted = box.indices.toSorted(
			(a, b) => (pixels[a * CHANNELS + channel] ?? 0) - (pixels[b * CHANNELS + channel] ?? 0),
		);
		const middle = Math.floor(sorted.length / 2);

		boxes = [
			...boxes.slice(0, target),
			{ pixels, indices: sorted.slice(0, middle) },
			{ pixels, indices: sorted.slice(middle) },
			...boxes.slice(target + 1),
		];
	}

	return boxes.filter((box) => box.indices.length > 0).map((box) => averageColor(box));
}

/** Squared distance; the square root would not change the ordering. */
export function colorDistance(a: Rgb, b: Rgb): number {
	const dr = a[0] - b[0];
	const dg = a[1] - b[1];
	const db = a[2] - b[2];
	return dr * dr + dg * dg + db * db;
}

export function nearestIndex(palette: Palette, color: Rgb): number {
	let best = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [index, entry] of palette.entries()) {
		const distance = colorDistance(entry, color);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}
	return best;
}

export type DitherMode = "none" | "floyd-steinberg" | "bayer";

/** 4×4 ordered matrix: cheap, deterministic, and it does not smear on motion. */
const BAYER_4X4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
] as const;

export type QuantizedFrame = {
	readonly indices: Uint8Array;
	readonly transparentIndex: number | null;
};

/**
 * Maps pixels onto a palette, optionally spreading the error.
 *
 * Floyd–Steinberg gives the best result on gradients and the worst on flat
 * areas of animation, where it makes static regions shimmer between frames.
 * Bayer is stable across frames, which is why both are offered rather than one
 * being picked for the user.
 */
export function quantizeFrame(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	palette: Palette,
	dither: DitherMode,
	alphaThreshold: number,
	transparentIndex: number | null,
): QuantizedFrame {
	const indices = new Uint8Array(width * height);
	// A working copy, because error diffusion writes back into the pixels.
	const working = dither === "floyd-steinberg" ? Float32Array.from(pixels) : null;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x;
			const offset = pixel * CHANNELS;

			if ((pixels[offset + 3] ?? 255) < alphaThreshold && transparentIndex !== null) {
				indices[pixel] = transparentIndex;
				continue;
			}

			let r: number;
			let g: number;
			let b: number;

			if (working !== null) {
				r = working[offset] ?? 0;
				g = working[offset + 1] ?? 0;
				b = working[offset + 2] ?? 0;
			} else if (dither === "bayer") {
				// The threshold shifts the colour before matching, which is what
				// turns banding into a stable texture.
				const bias = ((BAYER_4X4[y % 4]?.[x % 4] ?? 0) / 16 - 0.5) * 32;
				r = (pixels[offset] ?? 0) + bias;
				g = (pixels[offset + 1] ?? 0) + bias;
				b = (pixels[offset + 2] ?? 0) + bias;
			} else {
				r = pixels[offset] ?? 0;
				g = pixels[offset + 1] ?? 0;
				b = pixels[offset + 2] ?? 0;
			}

			const clamped: Rgb = [clamp255(r), clamp255(g), clamp255(b)];
			const index = nearestIndex(palette, clamped);
			indices[pixel] = index;

			if (working !== null) {
				const chosen = palette[index] ?? [0, 0, 0];
				spreadError(working, width, height, x, y, [
					clamped[0] - chosen[0],
					clamped[1] - chosen[1],
					clamped[2] - chosen[2],
				]);
			}
		}
	}

	return { indices, transparentIndex };
}

/** Floyd–Steinberg weights: 7/16 right, 3/16 down-left, 5/16 down, 1/16 down-right. */
function spreadError(
	working: Float32Array,
	width: number,
	height: number,
	x: number,
	y: number,
	error: readonly [number, number, number],
): void {
	const add = (dx: number, dy: number, factor: number) => {
		const nx = x + dx;
		const ny = y + dy;
		if (nx < 0 || nx >= width || ny >= height) return;
		const offset = (ny * width + nx) * CHANNELS;
		working[offset] = (working[offset] ?? 0) + error[0] * factor;
		working[offset + 1] = (working[offset + 1] ?? 0) + error[1] * factor;
		working[offset + 2] = (working[offset + 2] ?? 0) + error[2] * factor;
	};

	add(1, 0, 7 / 16);
	add(-1, 1, 3 / 16);
	add(0, 1, 5 / 16);
	add(1, 1, 1 / 16);
}

function clamp255(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Builds one palette for the whole animation.
 *
 * A global palette costs a little quality and saves a lot of bytes: a per-frame
 * palette repeats up to 768 bytes on every frame, which on a 500-frame file is
 * most of a megabyte before a single pixel is written.
 */
export function buildGlobalPalette(
	frames: readonly Uint8ClampedArray[],
	options: QuantizeOptions,
): Palette {
	const only = frames[0];
	if (only === undefined) return [[0, 0, 0]];
	if (frames.length === 1) return buildPalette(only, options);

	// Sampled rather than concatenated: 500 frames of 480p is 150 M pixels, and
	// the palette from a sample is indistinguishable from the exact one.
	const stride = Math.max(1, Math.floor(frames.length / 16));
	const sampled: number[] = [];
	for (let index = 0; index < frames.length; index += stride) {
		const frame = frames[index];
		if (frame === undefined) continue;
		const step = Math.max(CHANNELS, Math.floor(frame.length / (32 * 1024)) * CHANNELS);
		for (let offset = 0; offset < frame.length; offset += step) {
			sampled.push(
				frame[offset] ?? 0,
				frame[offset + 1] ?? 0,
				frame[offset + 2] ?? 0,
				frame[offset + 3] ?? 255,
			);
		}
	}

	return buildPalette(new Uint8ClampedArray(sampled), options);
}
