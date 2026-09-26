import { m } from '@/paraglide/messages.js';
import { type Adjustments, adjustments, type Size } from './document';

export type LookId =
	| 'auto'
	| 'vivid'
	| 'warm'
	| 'cool'
	| 'faded'
	| 'film'
	| 'vintage'
	| 'moody'
	| 'dramatic'
	| 'bw'
	| 'noir';

export interface Look {
	id: LookId;
	label: () => string;
}

/** Ready-made adjustments, applied in one click; the sliders then show and fine-tune them. */
export const LOOKS: Look[] = [
	{ id: 'auto', label: () => m.look_auto() },
	{ id: 'vivid', label: () => m.look_vivid() },
	{ id: 'warm', label: () => m.look_warm() },
	{ id: 'cool', label: () => m.look_cool() },
	{ id: 'faded', label: () => m.look_faded() },
	{ id: 'film', label: () => m.look_film() },
	{ id: 'vintage', label: () => m.look_vintage() },
	{ id: 'moody', label: () => m.look_moody() },
	{ id: 'dramatic', label: () => m.look_dramatic() },
	{ id: 'bw', label: () => m.look_bw() },
	{ id: 'noir', label: () => m.look_noir() },
];

const FIXED: Record<Exclude<LookId, 'auto'>, Partial<Adjustments>> = {
	vivid: { contrast: 15, highlights: -10, shadows: 10, saturation: 40 },
	warm: { brightness: 4, contrast: 5, saturation: 15, temperature: 30, tint: 4 },
	cool: { exposure: -2, contrast: 10, saturation: -10, temperature: -28, tint: -4 },
	faded: { brightness: 8, contrast: -25, highlights: -10, shadows: 30, saturation: -35, temperature: 6, grain: 8 },
	film: { contrast: 10, highlights: -20, shadows: 20, saturation: -15, temperature: 12, tint: -4, grain: 18 },
	vintage: { contrast: -12, shadows: 15, saturation: -25, sepia: 40, vignette: 35, grain: 22 },
	moody: {
		exposure: -8,
		contrast: 20,
		highlights: -25,
		shadows: -20,
		saturation: -30,
		temperature: -10,
		vignette: 30,
	},
	dramatic: { exposure: -4, contrast: 45, highlights: -30, shadows: 25, saturation: 10, vignette: 25 },
	bw: { contrast: 10, saturation: -100 },
	noir: { exposure: -4, contrast: 45, shadows: -15, saturation: -100, vignette: 45, grain: 20 },
};

export function lookAdjustments(id: LookId, picture: ImageStats | null): Adjustments {
	if (id === 'auto') return picture ? autoAdjustments(picture) : adjustments({});
	return adjustments(FIXED[id]);
}

/** What the automatic correction reads from a picture: averages and the spread of its light. */
export interface ImageStats {
	/** Average colour, in linear light. */
	mean: [number, number, number];
	/** Luma below which 1 % and 99 % of the pixels fall, in sRGB 0 to 1. */
	low: number;
	high: number;
	/** Median luma, in linear light. */
	median: number;
	/** Average colourfulness, 0 to about 1. */
	chroma: number;
}

const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** Reads the picture at a small size: enough for averages, and fast. */
export function measureImage(source: CanvasImageSource & Size): ImageStats | null {
	const scale = Math.min(1, 256 / Math.max(source.width, source.height));
	const width = Math.max(1, Math.round(source.width * scale));
	const height = Math.max(1, Math.round(source.height * scale));
	const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
	if (!context) return null;
	context.drawImage(source, 0, 0, width, height);
	const { data } = context.getImageData(0, 0, width, height);
	const histogram = new Uint32Array(256);
	const mean: [number, number, number] = [0, 0, 0];
	let chroma = 0;
	let count = 0;
	for (let i = 0; i < data.length; i += 4) {
		// Transparent pixels aren't part of the picture.
		if ((data[i + 3] ?? 0) < 128) continue;
		const r = (data[i] ?? 0) / 255;
		const g = (data[i + 1] ?? 0) / 255;
		const b = (data[i + 2] ?? 0) / 255;
		mean[0] += toLinear(r);
		mean[1] += toLinear(g);
		mean[2] += toLinear(b);
		chroma += Math.max(r, g, b) - Math.min(r, g, b);
		histogram[Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 255)]!++;
		count++;
	}
	if (count === 0) return null;
	const percentile = (share: number) => {
		let seen = 0;
		for (let level = 0; level < 256; level++) {
			seen += histogram[level] ?? 0;
			if (seen >= count * share) return level / 255;
		}
		return 1;
	};
	return {
		mean: [mean[0] / count, mean[1] / count, mean[2] / count],
		low: percentile(0.01),
		high: percentile(0.99),
		median: toLinear(percentile(0.5)),
		chroma: chroma / count,
	};
}

const clamp = (value: number, low: number, high: number) => Math.round(Math.min(high, Math.max(low, value)));

/**
 * A gentle correction, like a photographer's first pass: exposure towards a middle grey, contrast
 * to use the whole range, the colour cast of the light neutralised, a little more colour if dull.
 */
export function autoAdjustments(stats: ImageStats): Adjustments {
	// Exposure: the median towards 18 % grey, at most one stop, and only half the way.
	const stops = Math.log2(0.18 / Math.max(stats.median, 0.002)) * 0.5;
	const exposure = clamp(stops * 50, -50, 50);
	// Contrast: stretch a narrow range, never flatten a wide one.
	const spread = Math.max(0.05, stats.high - stats.low);
	const contrast = clamp((0.92 / spread - 1) * 60, 0, 35);
	// Shadows and highlights: open the shadows of a dark picture, bring back blown highlights.
	const shadows = clamp((0.1 - stats.median) * 200, 0, 25);
	const highlights = clamp((stats.high - 0.97) * -1500, -25, 0);
	// White balance: the grey-world guess, a third corrected: a sunset is meant to be orange.
	const [r, g, b] = stats.mean;
	const temperature = clamp(((b - r) / (0.3 * Math.max(r + b, 0.001))) * 33, -20, 20);
	const tint = clamp(((g - (r + b) / 2) / Math.max(0.2 * g + 0.05 * (r + b), 0.001)) * 33, -12, 12);
	// Colour: a lift for dull pictures only.
	const saturation = clamp((0.25 - stats.chroma) * 80, 0, 20);
	return adjustments({ exposure, contrast, shadows, highlights, temperature, tint, saturation });
}
