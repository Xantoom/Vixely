/**
 * Peak computation for the waveform display.
 *
 * Pure arithmetic on sample arrays, deliberately free of any decoder: it runs
 * in a worker, in a test, or on the main thread without changing.
 */

export type WaveformPeaks = {
	/** Interleaved min/max pairs per bucket, in [-1, 1]. */
	readonly peaks: Float32Array;
	readonly bucketCount: number;
	readonly durationSec: number;
	/** RMS per bucket, which is what actually reads as "loudness" on screen. */
	readonly rms: Float32Array;
};

/**
 * Reduces samples to `bucketCount` min/max pairs.
 *
 * Min and max are kept rather than a single amplitude: a waveform drawn from
 * absolute values loses the asymmetry of real audio and looks synthetic.
 */
export function computePeaks(
	channels: readonly Float32Array[],
	bucketCount: number,
	durationSec: number,
): WaveformPeaks {
	const peaks = new Float32Array(bucketCount * 2);
	const rms = new Float32Array(bucketCount);
	const frameCount = channels[0]?.length ?? 0;

	if (frameCount === 0 || bucketCount === 0) {
		return { peaks, rms, bucketCount, durationSec };
	}

	const samplesPerBucket = frameCount / bucketCount;

	for (let bucket = 0; bucket < bucketCount; bucket++) {
		const start = Math.floor(bucket * samplesPerBucket);
		const end = Math.min(frameCount, Math.ceil((bucket + 1) * samplesPerBucket));

		let min = 0;
		let max = 0;
		let sumOfSquares = 0;
		let counted = 0;

		for (let index = start; index < end; index++) {
			// Channels are mixed down for display; per-channel waveforms would
			// double the work for a difference nobody reads at this size.
			let value = 0;
			for (const channel of channels) value += channel[index] ?? 0;
			value /= channels.length;

			if (value < min) min = value;
			if (value > max) max = value;
			sumOfSquares += value * value;
			counted++;
		}

		peaks[bucket * 2] = min;
		peaks[bucket * 2 + 1] = max;
		rms[bucket] = counted === 0 ? 0 : Math.sqrt(sumOfSquares / counted);
	}

	return { peaks, rms, bucketCount, durationSec };
}

/** Merges two peak runs, for streaming a long file bucket by bucket. */
export function mergePeaks(a: WaveformPeaks, b: WaveformPeaks): WaveformPeaks {
	const peaks = new Float32Array(a.peaks.length + b.peaks.length);
	peaks.set(a.peaks, 0);
	peaks.set(b.peaks, a.peaks.length);

	const rms = new Float32Array(a.rms.length + b.rms.length);
	rms.set(a.rms, 0);
	rms.set(b.rms, a.rms.length);

	return {
		peaks,
		rms,
		bucketCount: a.bucketCount + b.bucketCount,
		durationSec: a.durationSec + b.durationSec,
	};
}

/** Bucket index under a horizontal position, for click-to-seek. */
export function bucketAt(peaks: WaveformPeaks, ratio: number): number {
	return Math.min(peaks.bucketCount - 1, Math.max(0, Math.floor(ratio * peaks.bucketCount)));
}

export function timeAtRatio(peaks: WaveformPeaks, ratio: number): number {
	return Math.min(peaks.durationSec, Math.max(0, ratio * peaks.durationSec));
}
