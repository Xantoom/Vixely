/**
 * EBU R128 loudness measurement.
 *
 * Normalisation is two passes by nature — measure, then apply — and the
 * measurement is pure arithmetic, so it lives here rather than in the editor.
 * Implemented from the standard's description: K-weighting, 400 ms blocks with
 * 75% overlap, an absolute gate at -70 LUFS and a relative gate 10 LU below the
 * ungated mean.
 */

export type LoudnessMeasurement = {
	/** Integrated loudness, in LUFS. */
	readonly integratedLufs: number;
	/** Highest short-term (3 s) loudness, in LUFS. */
	readonly shortTermMaxLufs: number;
	/** Sample peak, in dBFS. True peak would require oversampling. */
	readonly samplePeakDb: number;
	/** Gain that brings the material to the requested target, in dB. */
	readonly gainToTargetDb: number;
};

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_OFFSET = -10;
const BLOCK_SECONDS = 0.4;
const BLOCK_STEP_SECONDS = 0.1;
const SHORT_TERM_SECONDS = 3;

type Biquad = {
	readonly b0: number;
	readonly b1: number;
	readonly b2: number;
	readonly a1: number;
	readonly a2: number;
};

/** BS.1770 channel weights: surround counts for more, LFE not at all. */
export function channelWeight(index: number, channelCount: number): number {
	if (channelCount <= 2) return 1;
	// Usual 5.1 order: 0=L 1=R 2=C 3=LFE 4=Ls 5=Rs.
	if (index === 3) return 0;
	return index >= 4 ? 1.41 : 1;
}

/** Stage 1 of K-weighting: a high shelf standing in for the head. */
export function shelvingFilter(sampleRate: number): Biquad {
	const f0 = 1681.974450955533;
	const gainDb = 3.999843853973347;
	const q = 0.7071752072225522;

	const k = Math.tan((Math.PI * f0) / sampleRate);
	const vh = 10 ** (gainDb / 20);
	const vb = vh ** 0.4996667741557851;
	const denominator = 1 + k / q + k * k;

	return {
		b0: (vh + (vb * k) / q + k * k) / denominator,
		b1: (2 * (k * k - vh)) / denominator,
		b2: (vh - (vb * k) / q + k * k) / denominator,
		a1: (2 * (k * k - 1)) / denominator,
		a2: (1 - k / q + k * k) / denominator,
	};
}

/** Stage 2: a high pass removing what does not contribute to loudness. */
export function highPassFilter(sampleRate: number): Biquad {
	const f0 = 38.13547087602444;
	const q = 0.5003270373238773;

	const k = Math.tan((Math.PI * f0) / sampleRate);
	const denominator = 1 + k / q + k * k;

	return {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (k * k - 1)) / denominator,
		a2: (1 - k / q + k * k) / denominator,
	};
}

/** Applies a biquad in place, returning a new array. */
function applyBiquad(samples: Float32Array, filter: Biquad): Float32Array {
	const output = new Float32Array(samples.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;

	for (let index = 0; index < samples.length; index++) {
		const x0 = samples[index] ?? 0;
		const y0 = filter.b0 * x0 + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2;
		output[index] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}

	return output;
}

export function kWeight(samples: Float32Array, sampleRate: number): Float32Array {
	return applyBiquad(applyBiquad(samples, shelvingFilter(sampleRate)), highPassFilter(sampleRate));
}

/** Mean square of a window, which is what the loudness formula consumes. */
function meanSquare(samples: Float32Array, start: number, end: number): number {
	let sum = 0;
	for (let index = start; index < end; index++) {
		const value = samples[index] ?? 0;
		sum += value * value;
	}
	const count = end - start;
	return count === 0 ? 0 : sum / count;
}

function loudnessOf(power: number): number {
	return power <= 0 ? Number.NEGATIVE_INFINITY : -0.691 + 10 * Math.log10(power);
}

/**
 * Measures integrated loudness over the whole programme.
 *
 * The two gates are the reason a quiet passage does not drag the measurement
 * down: without them, a film with long silences normalises far too loud.
 */
export function measureLoudness(
	channels: readonly Float32Array[],
	sampleRate: number,
	targetLufs = -14,
): LoudnessMeasurement {
	const frameCount = channels[0]?.length ?? 0;
	if (frameCount === 0 || channels.length === 0) {
		return {
			integratedLufs: Number.NEGATIVE_INFINITY,
			shortTermMaxLufs: Number.NEGATIVE_INFINITY,
			samplePeakDb: Number.NEGATIVE_INFINITY,
			gainToTargetDb: 0,
		};
	}

	const weighted = channels.map((channel) => kWeight(channel, sampleRate));
	const weights = channels.map((_, index) => channelWeight(index, channels.length));

	const blockSize = Math.round(BLOCK_SECONDS * sampleRate);
	const stepSize = Math.round(BLOCK_STEP_SECONDS * sampleRate);
	const shortTermSize = Math.round(SHORT_TERM_SECONDS * sampleRate);

	const blockPowers: number[] = [];
	for (let start = 0; start + blockSize <= frameCount; start += stepSize) {
		let power = 0;
		for (const [index, samples] of weighted.entries()) {
			power += (weights[index] ?? 1) * meanSquare(samples, start, start + blockSize);
		}
		blockPowers.push(power);
	}

	let shortTermMax = Number.NEGATIVE_INFINITY;
	for (let start = 0; start + shortTermSize <= frameCount; start += stepSize) {
		let power = 0;
		for (const [index, samples] of weighted.entries()) {
			power += (weights[index] ?? 1) * meanSquare(samples, start, start + shortTermSize);
		}
		shortTermMax = Math.max(shortTermMax, loudnessOf(power));
	}

	const integratedLufs = gatedMean(blockPowers);

	let peak = 0;
	for (const channel of channels) {
		for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
	}

	return {
		integratedLufs,
		shortTermMaxLufs: shortTermMax,
		samplePeakDb: peak === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(peak),
		gainToTargetDb: Number.isFinite(integratedLufs) ? targetLufs - integratedLufs : 0,
	};
}

/** Absolute gate, then a relative gate derived from what survived it. */
function gatedMean(blockPowers: readonly number[]): number {
	const aboveAbsolute = blockPowers.filter((power) => loudnessOf(power) > ABSOLUTE_GATE_LUFS);
	if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY;

	const ungatedMean = aboveAbsolute.reduce((sum, power) => sum + power, 0) / aboveAbsolute.length;
	const relativeThreshold = loudnessOf(ungatedMean) + RELATIVE_GATE_OFFSET;

	const aboveRelative = aboveAbsolute.filter((power) => loudnessOf(power) > relativeThreshold);
	if (aboveRelative.length === 0) return loudnessOf(ungatedMean);

	return loudnessOf(aboveRelative.reduce((sum, power) => sum + power, 0) / aboveRelative.length);
}

/**
 * Caps the gain so applying it cannot clip.
 *
 * Reaching the loudness target matters less than not destroying the peaks; the
 * interface says when the cap kicked in rather than clipping silently.
 */
export function limitGainToPeak(
	gainDb: number,
	samplePeakDb: number,
	truePeakCeilingDb: number,
): { readonly gainDb: number; readonly limited: boolean } {
	if (!Number.isFinite(samplePeakDb)) return { gainDb, limited: false };
	const headroom = truePeakCeilingDb - samplePeakDb;
	return gainDb <= headroom ? { gainDb, limited: false } : { gainDb: headroom, limited: true };
}

export function dbToGain(db: number): number {
	return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
	return gain <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(gain);
}
