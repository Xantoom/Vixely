import { type GainPoint, gainAt } from '@/document/gain-curve';
import { type Range, toOutput } from '@/document/timemap';
import { LOUDNESS_STEP } from './peaks-protocol';

/** Integrated loudness and true peak of some audio. */
export interface LoudnessReading {
	/** LUFS. Minus infinity when everything is silent. */
	integrated: number;
	/** dBTP: the highest true peak, in decibels relative to full scale. */
	truePeak: number;
}

/** EBU R128 ignores blocks quieter than this, in LUFS: silence doesn't lower the average. */
const ABSOLUTE_GATE = -70;
/** Then it ignores blocks more than this far below the average of the others, in LU. */
const RELATIVE_GATE = -10;

function energy(lufs: number): number {
	return 10 ** ((lufs + 0.691) / 10);
}

function lufs(meanEnergy: number): number {
	return -0.691 + 10 * Math.log10(meanEnergy);
}

/**
 * The loudness of a track, block by block: the momentary loudness of the 400 ms ending every
 * 100 ms, and the true peak within each 100 ms. Integrated loudness is computed from them for any
 * part of the track with any volume curve, so an edit never needs the audio to be read again.
 * Three hours take about 850 KB.
 */
export class Loudness {
	/** Source time at which block 0 ends, minus one step. */
	start = 0;
	private momentary: Float32Array = new Float32Array(0);
	private peaks: Float32Array = new Float32Array(0);

	reserve(start: number, duration: number) {
		this.start = start;
		const blocks = Math.ceil((duration - start) / LOUDNESS_STEP) + 2;
		this.momentary = new Float32Array(blocks).fill(Number.NaN);
		this.peaks = new Float32Array(blocks);
	}

	append(index: number, momentary: Float32Array, peaks: Float32Array) {
		const end = index + momentary.length;
		if (end > this.momentary.length) {
			const grown = new Float32Array(Math.ceil(end * 1.2)).fill(Number.NaN);
			grown.set(this.momentary);
			this.momentary = grown;
			const grownPeaks = new Float32Array(grown.length);
			grownPeaks.set(this.peaks);
			this.peaks = grownPeaks;
		}
		this.momentary.set(momentary, index);
		this.peaks.set(peaks, index);
	}

	/**
	 * Loudness of the kept ranges once the volume curve (over output time) is applied. A block
	 * counts when its middle is kept; its loudness moves by the gain at that moment.
	 */
	measure(ranges: readonly Range[], curve: readonly GainPoint[]): LoudnessReading | null {
		const blocks: number[] = [];
		let peak = 0;
		for (let k = 0; k < this.momentary.length; k++) {
			const value = this.momentary[k] ?? Number.NaN;
			if (Number.isNaN(value)) continue;
			// Block k reads the 400 ms ending at (k + 1) steps; its middle is 200 ms earlier.
			const middle = this.start + (k + 1) * LOUDNESS_STEP - 0.2;
			const range = ranges.find((kept) => middle >= kept.start && middle < kept.end);
			if (!range) continue;
			const gain = curve.length > 0 ? gainAt(curve, toOutput(ranges, middle)) : 1;
			if (gain <= 0) continue;
			peak = Math.max(peak, (this.peaks[k] ?? 0) * gain);
			const level = value + 20 * Math.log10(gain);
			if (level > ABSOLUTE_GATE) blocks.push(level);
		}
		if (blocks.length === 0) {
			return peak > 0 || this.momentary.some((value) => !Number.isNaN(value))
				? { integrated: Number.NEGATIVE_INFINITY, truePeak: 20 * Math.log10(peak) }
				: null;
		}
		const ungated = blocks.reduce((sum, level) => sum + energy(level), 0) / blocks.length;
		const threshold = lufs(ungated) + RELATIVE_GATE;
		const kept = blocks.filter((level) => level > threshold);
		const integrated = lufs(kept.reduce((sum, level) => sum + energy(level), 0) / kept.length);
		return { integrated, truePeak: 20 * Math.log10(peak) };
	}

	/**
	 * Stretches of source time where the sound stays under `threshold` (dBFS, by its peaks, 100 ms
	 * at a time) for at least `shortest` seconds, in order.
	 */
	quietSpans(threshold: number, shortest: number): Range[] {
		const limit = 10 ** (threshold / 20);
		const spans: Range[] = [];
		let from: number | null = null;
		const close = (end: number) => {
			if (from !== null && end - from >= shortest) spans.push({ start: from, end });
			from = null;
		};
		for (let k = 0; k < this.peaks.length; k++) {
			// Step k holds the peak of the 100 ms ending at (k + 1) steps; unread steps end a stretch.
			// The first 400 ms have no momentary loudness of their own: the next ones tell they were read.
			const read = [k, k + 1, k + 2, k + 3].some((at) => !Number.isNaN(this.momentary[at] ?? Number.NaN));
			const start = this.start + k * LOUDNESS_STEP;
			if (read && (this.peaks[k] ?? 0) < limit) from ??= start;
			else close(start);
		}
		close(this.start + this.peaks.length * LOUDNESS_STEP);
		return spans;
	}
}
