import { type GainPoint, gainAt } from '@/document/gain-curve';
import { type Kept, keptRanges } from '@/document/kept';
import { cut, outputDuration } from '@/document/kept';
import { junctions, type Range, toOutput, totalLength } from '@/document/timemap';
import { compressorFor } from '@/media/dynamics';
import type { LoudnessReading } from '@/media/loudness';
import { FLAT_EQ, type SoundChanges } from '@/media/sound';

export { type GainPoint, gainAt };
export { cut, keepOnly, keptRanges, MIN_OUTPUT, outputDuration, restoreCut, setTrim } from '@/document/kept';

/**
 * The edits of an audio file. The source is never modified: the document says which part of it
 * is kept and how it sounds. Playback and export both read it, so what is heard is what is saved.
 */
export interface AudioDoc extends Kept {
	/** Volume change, in decibels. */
	gain: number;
	/** Fade lengths, in seconds of the output. */
	fadeIn: number;
	fadeOut: number;
	/** Target loudness in LUFS. When set, the gain is computed from the measured loudness instead. */
	normalize: number | null;
	/** Gain of each equalizer band, in dB. */
	eq: readonly number[];
	/** Share of the sound with its background noise reduced, 0 to 1; 0 for none. */
	denoise: number;
	/** How fast it plays, pitch kept: 2 lasts half as long. Absent plays as it is. */
	speed?: number;
	/** How far the pitch moves, in semitones, the length kept. */
	pitch?: number;
	/** How much the loud and quiet passages are evened out, 0 (none) to 1. */
	compress?: number;
	/**
	 * Loudness measured of the kept audio, in LUFS: set on the document as it sounds (never edited),
	 * so the compressor works around this sound's own level.
	 */
	reference?: number;
}

/** Length of the fade applied on each side of a cut, so the jump doesn't click. */
export const DECLICK = 0.004;

export const GAIN_RANGE = { min: -24, max: 24 } as const;

export function createAudioDoc(duration: number): AudioDoc {
	return {
		duration,
		trim: { start: 0, end: duration },
		cuts: [],
		gain: 0,
		fadeIn: 0,
		fadeOut: 0,
		normalize: null,
		eq: FLAT_EQ,
		denoise: 0,
	};
}

/** Speeds offered, slowest first. */
export const AUDIO_SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function speedOf(doc: AudioDoc): number {
	return doc.speed ?? 1;
}

export function pitchOf(doc: AudioDoc): number {
	return doc.pitch ?? 0;
}

export function compressOf(doc: AudioDoc): number {
	return doc.compress ?? 0;
}

/** Length of the output, in seconds, once sped up or slowed down. */
export function audioLength(doc: AudioDoc): number {
	return outputDuration(doc) / speedOf(doc);
}

/** Sound left on each side of a silence removed, in seconds, so words keep their breath. */
export const SILENCE_MARGIN = 0.15;

/**
 * The document with the quiet stretches (source time) cut, a margin kept against the sound on
 * each side. Stretches at the very start or end go whole, but for the margin.
 */
export function removeSilences(doc: AudioDoc, spans: readonly Range[]): { doc: AudioDoc; count: number } {
	let next = doc;
	let count = 0;
	for (const span of spans) {
		const start = span.start <= next.trim.start ? span.start : span.start + SILENCE_MARGIN;
		const end = span.end >= next.trim.end ? span.end : span.end - SILENCE_MARGIN;
		if (end - start < 0.1) continue;
		const cutDoc = cut(next, { start, end });
		if (cutDoc === next) continue;
		next = cutDoc;
		count += 1;
	}
	return { doc: next, count };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function setGain(doc: AudioDoc, gain: number): AudioDoc {
	return { ...doc, gain: clamp(gain, GAIN_RANGE.min, GAIN_RANGE.max) };
}

export function setFades(doc: AudioDoc, fades: { fadeIn?: number; fadeOut?: number }): AudioDoc {
	return {
		...doc,
		fadeIn: Math.max(0, fades.fadeIn ?? doc.fadeIn),
		fadeOut: Math.max(0, fades.fadeOut ?? doc.fadeOut),
	};
}

/** Normalization never lets true peaks above this, in dBTP: encoders need a little headroom. */
export const TRUE_PEAK_CEILING = -1;

export interface Normalization {
	/** Gain applied, in dB. */
	gain: number;
	/** Whether the ceiling on true peaks stopped the gain short of the target. */
	limited: boolean;
}

/**
 * Gain that brings audio measured at `reading` (with no gain applied) to the target loudness,
 * without true peaks above the ceiling. Raising a quiet recording would otherwise clip it.
 */
export function normalizationGain(target: number, reading: LoudnessReading): Normalization | null {
	if (!Number.isFinite(reading.integrated)) return null;
	const wanted = target - reading.integrated;
	const allowed = Number.isFinite(reading.truePeak) ? TRUE_PEAK_CEILING - reading.truePeak : wanted;
	const gain = Math.max(GAIN_RANGE.min, Math.min(GAIN_RANGE.max, wanted, allowed));
	return { gain, limited: gain < wanted - 0.05 };
}

/**
 * The document as it sounds: with normalization on, the gain is the one that reaches the target.
 * `reading` is the loudness of the kept audio with fades but no gain; null until it is measured.
 */
export function resolveGain(doc: AudioDoc, reading: LoudnessReading | null): AudioDoc {
	if (!reading) return doc;
	const measured = Number.isFinite(reading.integrated) ? { ...doc, reference: reading.integrated } : doc;
	if (doc.normalize === null) return measured;
	const normalization = normalizationGain(doc.normalize, reading);
	return normalization ? { ...measured, gain: normalization.gain } : measured;
}

/** Loudness assumed until the sound is measured, in LUFS: a typical recording. */
const TYPICAL_LOUDNESS = -20;

/** What changes the sound itself, as the processors take it. */
export function soundChanges(doc: AudioDoc): SoundChanges {
	const compress = compressOf(doc);
	return {
		eq: doc.eq,
		denoise: doc.denoise,
		compressor: compress > 0 ? compressorFor(compress, doc.reference ?? TYPICAL_LOUDNESS) : null,
	};
}

/** Whether the pace or the pitch changes. */
export function timeShaped(doc: AudioDoc): boolean {
	return speedOf(doc) !== 1 || pitchOf(doc) !== 0;
}

/** Points sampled along each fade. Enough for the curve to look and sound smooth. */
const FADE_STEPS = 24;

/** S-shaped fade from 0 to 1: gentle at both ends, so neither the start nor the end is abrupt. */
function fadeCurve(x: number): number {
	return (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
}

export function dbToGain(db: number): number {
	return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
	return 20 * Math.log10(gain);
}

/**
 * The volume curve of the output, as points joined by straight lines: gain, fades and the short
 * dips at cuts. Playback schedules these points on a gain node and the export multiplies samples
 * by the same curve, so both sound the same.
 */
export function envelope(doc: AudioDoc): GainPoint[] {
	const ranges = keptRanges(doc);
	const length = totalLength(ranges);
	// Fades are heard at the output's pace: at double speed, a 2 s fade takes 4 s of the source.
	const speed = speedOf(doc);
	// Fades longer than the output share it in proportion.
	const fadeTotal = (doc.fadeIn + doc.fadeOut) * speed;
	const scale = fadeTotal > length ? length / fadeTotal : 1;
	const fadeIn = doc.fadeIn * speed * scale;
	const fadeOut = doc.fadeOut * speed * scale;
	const cuts = junctions(ranges);
	const base = dbToGain(doc.gain);

	const valueAt = (t: number) => {
		let gain = base;
		if (fadeIn > 0) gain *= fadeCurve(t / fadeIn);
		if (fadeOut > 0) gain *= fadeCurve((length - t) / fadeOut);
		for (const junction of cuts) gain *= clamp(Math.abs(t - junction) / DECLICK, 0, 1);
		return gain;
	};

	const times = [0, length];
	for (let i = 1; i < FADE_STEPS; i++) {
		if (fadeIn > 0) times.push((fadeIn * i) / FADE_STEPS);
		if (fadeOut > 0) times.push(length - (fadeOut * i) / FADE_STEPS);
	}
	if (fadeIn > 0) times.push(fadeIn);
	if (fadeOut > 0) times.push(length - fadeOut);
	for (const junction of cuts) times.push(junction - DECLICK, junction, junction + DECLICK);

	const sorted = times.filter((t) => t >= 0 && t <= length).toSorted((a, b) => a - b);
	const points: GainPoint[] = [];
	for (const time of sorted) {
		if (points.length > 0 && time - (points.at(-1)?.time ?? 0) < 1e-6) continue;
		points.push({ time, gain: valueAt(time) });
	}
	return points;
}

/** Gain at a source time, or null when that moment is not in the output. */
export function sourceGainAt(ranges: readonly Range[], points: readonly GainPoint[], source: number): number | null {
	if (!ranges.some((range) => source >= range.start && source < range.end)) return null;
	return gainAt(points, toOutput(ranges, source));
}
