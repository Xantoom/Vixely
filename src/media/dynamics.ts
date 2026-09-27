/**
 * A compressor, as a stream: loud passages are turned down, then the whole is turned up again, so
 * a voice that comes and goes sounds even. Channels share one gain, so the stereo image holds.
 */
import type { Planar } from './sound';

export interface CompressorSettings {
	/** Level above which the sound is turned down, in dBFS. */
	threshold: number;
	/** How much: 4 turns 4 dB over the threshold into 1. */
	ratio: number;
	/** Gain added afterwards, in dB. */
	makeup: number;
}

/** How fast the compressor reacts to a louder sound, and lets go after it, in seconds. */
const ATTACK = 0.008;
const RELEASE = 0.18;
/** Width of the soft bend around the threshold, in dB. */
const KNEE = 6;

/**
 * The settings for an amount from 0 (none) to 1 (strong), around the sound's own loudness
 * (`reference`, in LUFS): the louder passages of this sound are the ones evened out, whatever
 * its level. The makeup brings the loudness back near where it was.
 */
export function compressorFor(amount: number, reference: number): CompressorSettings {
	const threshold = reference + 6 - 10 * amount;
	const ratio = 1.5 + 3.5 * amount;
	const makeup = Math.max(0, (1 - 1 / ratio) * (reference + 3 - threshold));
	return { threshold, ratio, makeup };
}

export function sameCompressor(a: CompressorSettings | null, b: CompressorSettings | null): boolean {
	return a === b || (a !== null && b !== null && a.threshold === b.threshold && a.ratio === b.ratio);
}

export class Compressor {
	private readonly attack: number;
	private readonly release: number;
	/** Level followed so far, in linear amplitude. */
	private level = 0;

	constructor(
		private readonly channels: number,
		rate: number,
		private readonly settings: CompressorSettings,
	) {
		this.attack = Math.exp(-1 / (ATTACK * rate));
		this.release = Math.exp(-1 / (RELEASE * rate));
	}

	/** Gain reduction for a level in dB, with a soft knee. */
	private reduction(db: number): number {
		const { threshold, ratio } = this.settings;
		const over = db - threshold;
		if (over <= -KNEE / 2) return 0;
		if (over >= KNEE / 2) return over * (1 - 1 / ratio);
		const x = over + KNEE / 2;
		return ((1 - 1 / ratio) * x * x) / (2 * KNEE);
	}

	/** Compresses planar audio in place. */
	process({ data, frames }: Planar): void {
		const makeup = this.settings.makeup;
		for (let i = 0; i < frames; i++) {
			let peak = 0;
			for (let c = 0; c < this.channels; c++) peak = Math.max(peak, Math.abs(data[c * frames + i] ?? 0));
			const coefficient = peak > this.level ? this.attack : this.release;
			this.level = coefficient * this.level + (1 - coefficient) * peak;
			const db = this.level > 1e-6 ? 20 * Math.log10(this.level) : -120;
			const gain = 10 ** ((makeup - this.reduction(db)) / 20);
			for (let c = 0; c < this.channels; c++) {
				const at = c * frames + i;
				data[at] = (data[at] ?? 0) * gain;
			}
		}
	}
}
