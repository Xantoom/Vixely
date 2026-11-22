import { describe, expect, it } from 'vitest';
import { Loudness } from './loudness';

/** Blocks every 100 ms from 0.4 s: `level(k)` LUFS, true peak 0.5. */
function blocks(seconds: number, level: (k: number) => number): Loudness {
	const loudness = new Loudness();
	loudness.reserve(0, seconds);
	const count = seconds * 10 - 3;
	const momentary = Float32Array.from({ length: count }, (_, i) => level(i + 3));
	loudness.append(3, momentary, new Float32Array(count).fill(0.5));
	return loudness;
}

const all = [{ start: 0, end: 60 }];

describe('loudness', () => {
	it('averages steady audio to its level', () => {
		const reading = blocks(60, () => -20).measure(all, []);
		expect(reading?.integrated).toBeCloseTo(-20, 3);
		expect(reading?.truePeak).toBeCloseTo(-6.02, 2);
	});

	it('ignores silence and quiet passages, as EBU R128 gates them', () => {
		// Half the file is silence, a tenth is 30 LU below: neither lowers the result.
		const reading = blocks(60, (k) => (k < 300 ? -20 : k < 360 ? -50 : Number.NEGATIVE_INFINITY)).measure(all, []);
		expect(reading?.integrated).toBeCloseTo(-20, 3);
	});

	it('follows the gain and the kept ranges', () => {
		const loudness = blocks(60, (k) => (k < 300 ? -20 : -10));
		const half = [{ time: 0, gain: 0.5 }];
		// Energy average of 297 blocks at −20 and 300 at −10 is −12.58 LUFS; half the amplitude is −6.02 dB.
		expect(loudness.measure(all, half)?.integrated).toBeCloseTo(-18.6, 1);
		expect(loudness.measure([{ start: 0, end: 25 }], half)?.integrated).toBeCloseTo(-26.02, 2);
		expect(loudness.measure([{ start: 35, end: 60 }], [])?.integrated).toBeCloseTo(-10, 3);
	});

	it('finds the quiet stretches long enough', () => {
		const loudness = new Loudness();
		loudness.reserve(0, 10);
		// Loud, then 2 s nearly silent from 3 s, loud, then 0.3 s silent at 7 s (too short).
		const peaks = Float32Array.from({ length: 100 }, (_, k) =>
			(k >= 30 && k < 50) || (k >= 70 && k < 73) ? 0.001 : 0.5,
		);
		loudness.append(0, new Float32Array(100).fill(-20), peaks);
		const spans = loudness.quietSpans(-40, 0.5);
		expect(spans).toHaveLength(1);
		expect(spans[0]?.start).toBeCloseTo(3);
		expect(spans[0]?.end).toBeCloseTo(5);
	});
});
