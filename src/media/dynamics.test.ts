import { describe, expect, it } from 'vitest';
import { Compressor, compressorFor } from './dynamics';

const RATE = 48_000;

/** One second loud, one second quiet, of a 220 Hz tone. */
function loudThenQuiet(): Float32Array {
	return Float32Array.from(
		{ length: 2 * RATE },
		(_, n) => (n < RATE ? 0.8 : 0.1) * Math.sin((2 * Math.PI * 220 * n) / RATE),
	);
}

function peakDb(signal: Float32Array, from: number, to: number): number {
	let peak = 0;
	for (let n = Math.round(from * RATE); n < Math.round(to * RATE); n++)
		peak = Math.max(peak, Math.abs(signal[n] ?? 0));
	return 20 * Math.log10(peak);
}

describe('compressor', () => {
	it('brings loud and quiet passages closer', () => {
		const signal = loudThenQuiet();
		const before = peakDb(signal, 0.5, 1) - peakDb(signal, 1.5, 2);
		new Compressor(1, RATE, compressorFor(1, -16)).process({ data: signal, frames: signal.length });
		const after = peakDb(signal, 0.5, 1) - peakDb(signal, 1.5, 2);
		expect(before).toBeCloseTo(18, 0);
		expect(after).toBeLessThan(before - 6);
	});

	it('leaves sound under the threshold as it is, but for the makeup', () => {
		const settings = compressorFor(0.5, -16);
		const signal = Float32Array.from({ length: RATE }, (_, n) => 0.01 * Math.sin((2 * Math.PI * 220 * n) / RATE));
		new Compressor(1, RATE, settings).process({ data: signal, frames: signal.length });
		expect(peakDb(signal, 0.5, 1)).toBeCloseTo(-40 + settings.makeup, 0);
	});
});
