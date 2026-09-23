import { describe, expect, it } from 'vitest';
import { Peaks } from './peaks';
import { PEAK_FRAMES } from './peaks-protocol';

/** Peaks rising from silence to full scale over `count` peaks of 10 ms, read by two workers. */
function ramp(count: number, readUpTo = count): Peaks {
	const peaks = new Peaks();
	peaks.setOrigin({ start: 0, rate: PEAK_FRAMES * 100 }, count / 100);
	const data = new Int8Array(count * 2);
	for (let i = 0; i < count; i++) {
		const level = Math.round((i / (count - 1)) * 127);
		data[i * 2] = -level;
		data[i * 2 + 1] = level;
	}
	const half = count / 2;
	const first = peaks.addSegment(0, half);
	const second = peaks.addSegment(half, count);
	// The second half arrives first, as it can when workers race.
	peaks.append(second, half, data.subarray(count, Math.min(count, readUpTo) * 2));
	peaks.append(first, 0, data.subarray(0, count));
	return peaks;
}

describe('peaks', () => {
	it('reads the loudest value of a span, at any zoom', () => {
		const peaks = ramp(100_000);
		const out = { min: 0, max: 0 };
		expect(peaks.range(0, 0.05, out)).toBe(true);
		expect(out.max).toBeLessThan(0.01);
		// A span of 800 s reads summary levels; the loudest part is at its end.
		expect(peaks.range(200, 1000, out)).toBe(true);
		expect(out.max).toBe(1);
		expect(out.min).toBe(-1);
		expect(peaks.range(400, 500, out)).toBe(true);
		expect(out.max).toBeCloseTo(0.5, 1);
	});

	it('knows what has not been read yet', () => {
		const peaks = ramp(1000, 750);
		const out = { min: 0, max: 0 };
		expect(peaks.range(9, 9.5, out)).toBe(false);
		expect(peaks.range(6, 7, out)).toBe(true);
		expect(peaks.progress()).toBeCloseTo(0.75, 1);
	});

	it('measures the peak of the kept ranges only', () => {
		const peaks = ramp(1000);
		expect(peaks.peak([{ start: 0, end: 5 }])).toBeCloseTo(0.5, 1);
		expect(peaks.peak([{ start: 0, end: 10 }])).toBe(1);
	});
});
