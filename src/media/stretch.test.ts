import { describe, expect, it } from 'vitest';
import { SpeedPitch, TimeStretcher } from './stretch';

const RATE = 48_000;

function tone(seconds: number, frequency: number): Float32Array {
	return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, n) =>
		Math.sin((2 * Math.PI * frequency * n) / RATE),
	);
}

/** Streams mono input through in uneven chunks, as decoders give it. */
function stretch(input: Float32Array, speed: number): Float32Array {
	const stretcher = new TimeStretcher(1, RATE, speed);
	const parts: Float32Array[] = [];
	for (let at = 0, step = 997; at < input.length; at += step, step = step === 997 ? 4096 : 997) {
		const chunk = input.subarray(at, Math.min(input.length, at + step));
		parts.push(stretcher.push({ data: chunk, frames: chunk.length }).data);
	}
	parts.push(stretcher.flush().data);
	const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** Frequency from the zero crossings of the steady middle. */
function frequencyOf(signal: Float32Array): number {
	const middle = signal.subarray(Math.round(signal.length * 0.2), Math.round(signal.length * 0.8));
	let crossings = 0;
	for (let n = 1; n < middle.length; n++) if ((middle[n - 1] ?? 0) < 0 && (middle[n] ?? 0) >= 0) crossings += 1;
	return (crossings * RATE) / middle.length;
}

describe('time stretching', () => {
	for (const speed of [0.5, 0.75, 1.5, 2, 4]) {
		it(`plays ${speed}× as fast at the same pitch`, () => {
			const input = tone(3, 440);
			const out = stretch(input, speed);
			expect(out.length / RATE).toBeCloseTo(3 / speed, 1);
			expect(frequencyOf(out)).toBeGreaterThan(430);
			expect(frequencyOf(out)).toBeLessThan(450);
		});
	}

	it('keeps the level steady', () => {
		const out = stretch(tone(2, 220), 1.5);
		const middle = out.subarray(RATE * 0.3, RATE * 1);
		let peak = 0;
		let low = 1;
		for (let at = 0; at + 480 < middle.length; at += 480) {
			let max = 0;
			for (let n = at; n < at + 480; n++) max = Math.max(max, Math.abs(middle[n] ?? 0));
			peak = Math.max(peak, max);
			low = Math.min(low, max);
		}
		expect(peak).toBeLessThan(1.1);
		expect(low).toBeGreaterThan(0.85);
	});
});

/** Streams mono input through a speed and pitch change, in uneven chunks. */
function shape(input: Float32Array, speed: number, semitones: number): Float32Array {
	const shaper = new SpeedPitch(1, RATE, speed, semitones);
	const parts: Float32Array[] = [];
	for (let at = 0, step = 997; at < input.length; at += step, step = step === 997 ? 4096 : 997) {
		const chunk = input.subarray(at, Math.min(input.length, at + step));
		parts.push(shaper.push({ data: chunk, frames: chunk.length }).data);
	}
	parts.push(shaper.flush().data);
	const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

describe('speed and pitch apart', () => {
	for (const [speed, semitones] of [
		[1, 12],
		[1, -5],
		[1.5, 3],
		[0.75, -12],
	] as const) {
		it(`plays ${speed}× as fast, ${semitones} semitones away`, () => {
			const out = shape(tone(3, 440), speed, semitones);
			expect(out.length / RATE).toBeCloseTo(3 / speed, 1);
			const expected = 440 * 2 ** (semitones / 12);
			expect(frequencyOf(out)).toBeGreaterThan(expected * 0.97);
			expect(frequencyOf(out)).toBeLessThan(expected * 1.03);
		});
	}
});
