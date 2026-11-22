import { describe, expect, it } from 'vitest';
import { EQ_PRESETS, Equalizer, FLAT_EQ, responseAt } from './sound';

/** Level of a sine after the equalizer, in dB, once its filters have settled. */
function measured(eq: readonly number[], frequency: number, rate: number): number {
	const frames = rate;
	const data = new Float32Array(frames * 2);
	for (let i = 0; i < frames; i++) {
		const value = Math.sin((2 * Math.PI * frequency * i) / rate);
		data[i] = value;
		data[frames + i] = value;
	}
	// In two halves, as a stream: the filters carry their state across.
	const equalizer = new Equalizer(eq, 2, rate);
	const half = frames / 2;
	const first = new Float32Array([...data.subarray(0, half), ...data.subarray(frames, frames + half)]);
	const second = new Float32Array([...data.subarray(half, frames), ...data.subarray(frames + half)]);
	equalizer.process(first, half, 2);
	equalizer.process(second, half, 2);
	// RMS of a whole number of periods, as a sine's amplitude: sample peaks miss high tones' tops.
	const tail = second.subarray(half / 2, half);
	const rms = Math.sqrt(tail.reduce((sum, value) => sum + value * value, 0) / tail.length);
	return 20 * Math.log10(rms * Math.SQRT2);
}

describe('equalizer', () => {
	it('boosts a band by its gain at its centre', () => {
		const eq = [0, 0, 6, 0, 0];
		expect(responseAt(eq, 1000, 48_000)).toBeCloseTo(6, 1);
		expect(responseAt(FLAT_EQ, 1000, 48_000)).toBeCloseTo(0, 5);
		// Shelves reach their gain far from their corner.
		expect(responseAt([-12, 0, 0, 0, 0], 20, 48_000)).toBeLessThan(-11);
	});

	it('filters sound as its curve says, carrying its state across calls', () => {
		for (const [frequency, eq] of [
			[1000, [0, 0, 6, 0, 0]],
			[60, EQ_PRESETS['bass-cut']],
			[8000, EQ_PRESETS.treble],
		] as const) {
			expect(measured(eq, frequency, 48_000)).toBeCloseTo(responseAt(eq, frequency, 48_000), 1);
		}
	});
});
