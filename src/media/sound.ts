/**
 * What changes the sound itself, rather than its volume: the equalizer and the noise reduction.
 * Playback runs the equalizer on Web Audio filters and the export on the same formulas here (the
 * Web Audio specification's, after Robert Bristow-Johnson's cookbook), so both sound alike. The
 * noise reduction runs the same WebAssembly code in both.
 */
import { loadAudio } from '@/wasm/audio';
import type { NoiseReducer } from '@/wasm/vixely-audio/vixely_audio.js';

export type BandKind = 'lowshelf' | 'peaking' | 'highshelf';

export interface EqBand {
	kind: BandKind;
	/** Centre or corner frequency, in hertz. */
	frequency: number;
}

/** The equalizer's bands: rumble and bass, body, voice, presence, air. */
export const EQ_BANDS: readonly EqBand[] = [
	{ kind: 'lowshelf', frequency: 80 },
	{ kind: 'peaking', frequency: 250 },
	{ kind: 'peaking', frequency: 1000 },
	{ kind: 'peaking', frequency: 4000 },
	{ kind: 'highshelf', frequency: 12_000 },
];

/** Width of the peaking bands: about an octave and a half. */
export const EQ_Q = 1;

export const EQ_RANGE = { min: -12, max: 12 } as const;

export const FLAT_EQ: readonly number[] = EQ_BANDS.map(() => 0);

export type EqPresetId = 'flat' | 'voice' | 'bass' | 'bass-cut' | 'treble' | 'warm' | 'bright';

/** Gains of each band, in dB, for the usual needs. */
export const EQ_PRESETS: Record<EqPresetId, readonly number[]> = {
	flat: FLAT_EQ,
	voice: [-6, -2, 1, 4, 2],
	bass: [6, 3, 0, 0, 0],
	'bass-cut': [-12, -3, 0, 0, 0],
	treble: [0, 0, 0, 3, 6],
	warm: [3, 2, 0, -2, -3],
	bright: [-2, 0, 0, 3, 4],
};

export const EQ_PRESET_IDS: EqPresetId[] = ['flat', 'voice', 'bass', 'bass-cut', 'treble', 'warm', 'bright'];

export function isFlat(eq: readonly number[]): boolean {
	return eq.every((gain) => gain === 0);
}

/** Normalized coefficients [b0, b1, b2, a1, a2] of one band, as a Web Audio BiquadFilterNode computes them. */
export function coefficients(band: EqBand, gain: number, rate: number): [number, number, number, number, number] {
	const a = 10 ** (gain / 40);
	const w0 = (2 * Math.PI * Math.min(band.frequency, rate / 2 - 1)) / rate;
	const cos = Math.cos(w0);
	const sin = Math.sin(w0);
	let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
	if (band.kind === 'peaking') {
		const alpha = sin / (2 * EQ_Q);
		b0 = 1 + alpha * a;
		b1 = -2 * cos;
		b2 = 1 - alpha * a;
		a0 = 1 + alpha / a;
		a1 = -2 * cos;
		a2 = 1 - alpha / a;
	} else {
		// Shelves with a slope of 1, as Web Audio draws them.
		const alpha = (sin / 2) * Math.SQRT2;
		const root = 2 * Math.sqrt(a) * alpha;
		if (band.kind === 'lowshelf') {
			b0 = a * (a + 1 - (a - 1) * cos + root);
			b1 = 2 * a * (a - 1 - (a + 1) * cos);
			b2 = a * (a + 1 - (a - 1) * cos - root);
			a0 = a + 1 + (a - 1) * cos + root;
			a1 = -2 * (a - 1 + (a + 1) * cos);
			a2 = a + 1 + (a - 1) * cos - root;
		} else {
			b0 = a * (a + 1 + (a - 1) * cos + root);
			b1 = -2 * a * (a - 1 + (a + 1) * cos);
			b2 = a * (a + 1 + (a - 1) * cos - root);
			a0 = a + 1 - (a - 1) * cos + root;
			a1 = 2 * (a - 1 - (a + 1) * cos);
			a2 = a + 1 - (a - 1) * cos - root;
		}
	}
	return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Gain of the whole equalizer at a frequency, in dB: for tests and for drawing its curve. */
export function responseAt(eq: readonly number[], frequency: number, rate: number): number {
	const w = (2 * Math.PI * frequency) / rate;
	let total = 0;
	EQ_BANDS.forEach((band, index) => {
		const [b0, b1, b2, a1, a2] = coefficients(band, eq[index] ?? 0, rate);
		// |H(e^jw)| from the numerator and denominator at z = e^jw.
		const re = (c0: number, c1: number, c2: number) => c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w);
		const im = (c1: number, c2: number) => -c1 * Math.sin(w) - c2 * Math.sin(2 * w);
		const numerator = Math.hypot(re(b0, b1, b2), im(b1, b2));
		const denominator = Math.hypot(re(1, a1, a2), im(a1, a2));
		total += 20 * Math.log10(numerator / denominator);
	});
	return total;
}

/** The equalizer over planar audio, as a stream: its filters keep their state from call to call. */
export class Equalizer {
	private readonly bands: { c: [number, number, number, number, number]; state: Float64Array }[];

	constructor(eq: readonly number[], channels: number, rate: number) {
		this.bands = EQ_BANDS.flatMap((band, index) => {
			const gain = eq[index] ?? 0;
			return gain === 0 ? [] : [{ c: coefficients(band, gain, rate), state: new Float64Array(channels * 4) }];
		});
	}

	/** Filters `frames` frames of planar audio in place. */
	process(planar: Float32Array, frames: number, channels: number): void {
		for (const { c, state } of this.bands) {
			const [b0, b1, b2, a1, a2] = c;
			for (let channel = 0; channel < channels; channel++) {
				const offset = channel * frames;
				const s = channel * 4;
				let x1 = state[s] ?? 0;
				let x2 = state[s + 1] ?? 0;
				let y1 = state[s + 2] ?? 0;
				let y2 = state[s + 3] ?? 0;
				for (let i = 0; i < frames; i++) {
					const x = planar[offset + i] ?? 0;
					const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
					x2 = x1;
					x1 = x;
					y2 = y1;
					y1 = y;
					planar[offset + i] = y;
				}
				state[s] = x1;
				state[s + 1] = x2;
				state[s + 2] = y1;
				state[s + 3] = y2;
			}
		}
	}
}

export interface SoundChanges {
	eq: readonly number[];
	/** Share of denoised sound, 0 to 1; 0 leaves the sound as it is. */
	denoise: number;
}

/** Planar audio and how many frames it holds. */
export interface Planar {
	data: Float32Array;
	frames: number;
}

/**
 * The noise reduction then the equalizer, over a stream of planar audio. The output lines up with
 * the input and has the same length once `finish` is called, but may come a little behind it.
 */
export class SoundProcessor {
	private constructor(
		private readonly reducer: NoiseReducer | null,
		private readonly equalizer: Equalizer | null,
		private readonly channels: number,
	) {}

	static async create(changes: SoundChanges, channels: number, rate: number): Promise<SoundProcessor> {
		const reducer =
			changes.denoise > 0 ? new (await loadAudio()).NoiseReducer(channels, rate, changes.denoise) : null;
		const equalizer = isFlat(changes.eq) ? null : new Equalizer(changes.eq, channels, rate);
		return new SoundProcessor(reducer, equalizer, channels);
	}

	push(input: Planar): Planar {
		if (!this.reducer) return this.equalize({ data: input.data, frames: input.frames });
		const data = this.reducer.process(input.data, input.frames);
		return this.equalize({ data, frames: this.reducer.ready_frames() });
	}

	/** What is still held back, once all the input is in. */
	finish(): Planar {
		if (!this.reducer) return { data: new Float32Array(0), frames: 0 };
		const data = this.reducer.finish();
		return this.equalize({ data, frames: this.reducer.ready_frames() });
	}

	dispose(): void {
		this.reducer?.free();
	}

	private equalize(planar: Planar): Planar {
		if (planar.frames > 0) this.equalizer?.process(planar.data, planar.frames, this.channels);
		return planar;
	}
}

/** Whether the sound itself changes, which rules out copying it as it is. */
export function changesSound(changes: SoundChanges): boolean {
	return changes.denoise > 0 || !isFlat(changes.eq);
}
