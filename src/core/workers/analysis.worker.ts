import { expose } from "comlink";
import { computePeaks, type WaveformPeaks } from "../audio/waveform.ts";
import { measureLoudness, type LoudnessMeasurement } from "../audio/loudness.ts";

/**
 * Analysis worker.
 *
 * Peak folding and R128 measurement are pure arithmetic over long arrays —
 * exactly the work that must not sit on the thread that draws the preview.
 * Channel data arrives as transferred ArrayBuffers, never as a copy.
 */
const api = {
	computePeaks(
		channels: readonly Float32Array[],
		bucketCount: number,
		durationSec: number,
	): WaveformPeaks {
		return computePeaks(channels, bucketCount, durationSec);
	},

	measureLoudness(
		channels: readonly Float32Array[],
		sampleRate: number,
		targetLufs: number,
	): LoudnessMeasurement {
		return measureLoudness(channels, sampleRate, targetLufs);
	},
};

export type AnalysisWorkerApi = typeof api;

expose(api);
