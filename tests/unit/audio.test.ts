import { describe, expect, it } from "vitest";
import {
	bucketAt,
	channelWeight,
	computePeaks,
	dbToGain,
	defaultEqualizer,
	equalizerIsNeutral,
	gainAt,
	gainToDb,
	kWeight,
	limitGainToPeak,
	measureLoudness,
	mergePeaks,
	moveSegment,
	outputOffset,
	removeSegment,
	sourceTimeAt,
	splitAt,
	timeAtRatio,
	totalDuration,
} from "~/core/audio";
import type { AudioSegment } from "~/core/document";

const SAMPLE_RATE = 48_000;

function energy(samples: Float32Array): number {
	return samples.reduce((sum, value) => sum + value * value, 0);
}

function sine(frequency: number, seconds: number, amplitude = 1): Float32Array {
	const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	for (let index = 0; index < samples.length; index++) {
		samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
	}
	return samples;
}

function segment(overrides: Partial<AudioSegment> = {}): AudioSegment {
	return {
		id: "a",
		sourceId: "src",
		startSec: 0,
		endSec: 10,
		gainDb: 0,
		fadeInSec: 0,
		fadeOutSec: 0,
		...overrides,
	};
}

describe("waveform peaks", () => {
	it("keeps the asymmetry of the signal, not just an amplitude", () => {
		const channel = new Float32Array([-1, 0.5, -0.25, 0.75]);
		const { peaks } = computePeaks([channel], 2, 1);
		expect(peaks[0]).toBeCloseTo(-1, 5);
		expect(peaks[1]).toBeCloseTo(0.5, 5);
		expect(peaks[2]).toBeCloseTo(-0.25, 5);
		expect(peaks[3]).toBeCloseTo(0.75, 5);
	});

	it("mixes channels down for display", () => {
		const left = new Float32Array([1, 1]);
		const right = new Float32Array([-1, -1]);
		const { peaks } = computePeaks([left, right], 1, 1);
		expect(peaks[0]).toBeCloseTo(0, 5);
		expect(peaks[1]).toBeCloseTo(0, 5);
	});

	it("reports RMS, which is what reads as loudness on screen", () => {
		const { rms } = computePeaks([sine(440, 0.1)], 1, 0.1);
		// A full-scale sine sits at 1/sqrt(2).
		expect(rms[0]).toBeCloseTo(Math.SQRT1_2, 2);
	});

	it("handles an empty track without dividing by zero", () => {
		const result = computePeaks([new Float32Array(0)], 10, 0);
		expect(result.peaks.every((value) => value === 0)).toBe(true);
	});

	it("merges two runs for streaming a long file", () => {
		const first = computePeaks([new Float32Array([1, -1])], 1, 1);
		const second = computePeaks([new Float32Array([0.5, -0.5])], 1, 1);
		const merged = mergePeaks(first, second);
		expect(merged.bucketCount).toBe(2);
		expect(merged.durationSec).toBe(2);
		expect(merged.peaks).toHaveLength(4);
	});

	it("maps a horizontal position to a bucket and a time", () => {
		const peaks = computePeaks([new Float32Array(100)], 10, 60);
		expect(bucketAt(peaks, 0)).toBe(0);
		expect(bucketAt(peaks, 0.55)).toBe(5);
		expect(bucketAt(peaks, 1)).toBe(9);
		expect(timeAtRatio(peaks, 0.5)).toBeCloseTo(30, 5);
	});
});

describe("EBU R128 measurement", () => {
	it("gives a full-scale sine a plausible integrated loudness", () => {
		const result = measureLoudness([sine(1000, 5)], SAMPLE_RATE);
		// A 1 kHz full-scale sine measures around -3 LUFS; the tolerance covers
		// the filter implementation rather than hiding a wrong order of magnitude.
		expect(result.integratedLufs).toBeGreaterThan(-6);
		expect(result.integratedLufs).toBeLessThan(0);
	});

	it("measures a quieter signal as quieter, by the right amount", () => {
		const loud = measureLoudness([sine(1000, 5, 1)], SAMPLE_RATE);
		const quiet = measureLoudness([sine(1000, 5, 0.1)], SAMPLE_RATE);
		expect(loud.integratedLufs - quiet.integratedLufs).toBeCloseTo(20, 0);
	});

	it("reports silence rather than pretending to a number", () => {
		const result = measureLoudness([new Float32Array(SAMPLE_RATE * 5)], SAMPLE_RATE);
		expect(result.integratedLufs).toBe(Number.NEGATIVE_INFINITY);
		expect(result.gainToTargetDb).toBe(0);
	});

	it("is not dragged down by long silences — that is what the gates are for", () => {
		const tone = sine(1000, 4);
		const withSilence = new Float32Array(SAMPLE_RATE * 12);
		withSilence.set(tone, 0);

		const gated = measureLoudness([withSilence], SAMPLE_RATE);
		const toneOnly = measureLoudness([tone], SAMPLE_RATE);
		expect(Math.abs(gated.integratedLufs - toneOnly.integratedLufs)).toBeLessThan(2);
	});

	it("computes the gain that reaches the target", () => {
		const result = measureLoudness([sine(1000, 4, 0.05)], SAMPLE_RATE, -14);
		expect(result.integratedLufs + result.gainToTargetDb).toBeCloseTo(-14, 5);
	});

	it("reports the sample peak", () => {
		const result = measureLoudness([sine(1000, 1, 0.5)], SAMPLE_RATE);
		expect(result.samplePeakDb).toBeCloseTo(-6, 0);
	});

	it("ignores the LFE channel and weights surround more", () => {
		expect(channelWeight(3, 6)).toBe(0);
		expect(channelWeight(4, 6)).toBeCloseTo(1.41, 5);
		expect(channelWeight(0, 2)).toBe(1);
	});

	it("attenuates low frequencies through K-weighting", () => {
		const low = kWeight(sine(30, 1), SAMPLE_RATE);
		const mid = kWeight(sine(1000, 1), SAMPLE_RATE);
		expect(energy(low)).toBeLessThan(energy(mid));
	});
});

describe("clipping protection", () => {
	it("caps the gain at the available headroom", () => {
		expect(limitGainToPeak(12, -3, -1)).toEqual({ gainDb: 2, limited: true });
	});

	it("leaves a safe gain untouched", () => {
		expect(limitGainToPeak(2, -12, -1)).toEqual({ gainDb: 2, limited: false });
	});

	it("converts between dB and linear gain", () => {
		expect(dbToGain(0)).toBeCloseTo(1, 10);
		expect(dbToGain(6)).toBeCloseTo(2, 1);
		expect(gainToDb(1)).toBeCloseTo(0, 10);
		expect(gainToDb(0)).toBe(Number.NEGATIVE_INFINITY);
	});
});

describe("segment arithmetic", () => {
	it("sums durations across the cut list", () => {
		const segments = [segment({ endSec: 5 }), segment({ id: "b", startSec: 20, endSec: 30 })];
		expect(totalDuration(segments)).toBe(15);
		expect(outputOffset(segments, 1)).toBe(5);
	});

	it("maps an output timestamp back onto the source", () => {
		const segments = [segment({ endSec: 5 }), segment({ id: "b", startSec: 20, endSec: 30 })];
		expect(sourceTimeAt(segments, 2)?.sourceSec).toBe(2);
		// Six seconds in is one second into the second segment, i.e. source 21 s.
		expect(sourceTimeAt(segments, 6)?.sourceSec).toBe(21);
		expect(sourceTimeAt(segments, 99)).toBeNull();
	});

	it("splits a segment at an output timestamp", () => {
		const result = splitAt([segment({ endSec: 10 })], 4, () => "new");
		expect(result).toHaveLength(2);
		expect(result[0]?.endSec).toBe(4);
		expect(result[1]?.startSec).toBe(4);
		expect(result[1]?.id).toBe("new");
	});

	it("leaves a cut on an edge alone", () => {
		const segments = [segment({ endSec: 10 })];
		expect(splitAt(segments, 0, () => "new")).toHaveLength(1);
		expect(splitAt(segments, 10, () => "new")).toHaveLength(1);
	});

	it("keeps fades on the right side of a cut", () => {
		const [first, second] = splitAt(
			[segment({ endSec: 10, fadeInSec: 1, fadeOutSec: 2 })],
			5,
			() => "new",
		);
		expect(first?.fadeInSec).toBe(1);
		expect(first?.fadeOutSec).toBe(0);
		expect(second?.fadeInSec).toBe(0);
		expect(second?.fadeOutSec).toBe(2);
	});

	it("removes and reorders segments", () => {
		const segments = [segment(), segment({ id: "b" }), segment({ id: "c" })];
		expect(removeSegment(segments, "b").map((s) => s.id)).toEqual(["a", "c"]);
		expect(moveSegment(segments, 0, 2).map((s) => s.id)).toEqual(["b", "c", "a"]);
		expect(moveSegment(segments, 1, 1)).toBe(segments);
	});

	it("applies fades and gain as one envelope", () => {
		const faded = segment({ endSec: 10, fadeInSec: 2, fadeOutSec: 2 });
		expect(gainAt(faded, 0)).toBeCloseTo(0, 5);
		expect(gainAt(faded, 1)).toBeCloseTo(0.5, 5);
		expect(gainAt(faded, 5)).toBeCloseTo(1, 5);
		expect(gainAt(faded, 10)).toBeCloseTo(0, 5);
		expect(gainAt(segment({ gainDb: 6 }), 5)).toBeCloseTo(2, 1);
	});

	it("starts the equaliser neutral, with shelves at the ends", () => {
		const bands = defaultEqualizer((index) => `band-${index}`);
		expect(bands).toHaveLength(8);
		expect(bands[0]?.type).toBe("lowshelf");
		expect(bands.at(-1)?.type).toBe("highshelf");
		expect(equalizerIsNeutral(bands)).toBe(true);
		expect(equalizerIsNeutral([{ ...bands[0]!, gainDb: 3 }])).toBe(false);
	});
});
