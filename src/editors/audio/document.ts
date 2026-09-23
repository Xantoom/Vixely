import { type GainPoint, gainAt } from '@/document/gain-curve';
import { junctions, type Range, toOutput, totalLength } from '@/document/timemap';

export { type GainPoint, gainAt };

/**
 * The edits of an audio file. The source is never modified: the document says which part of it
 * is kept and how it sounds. Playback and export both read it, so what is heard is what is saved.
 */
export interface AudioDoc {
	/** Length of the source, in seconds. */
	duration: number;
	/** Part of the source kept, in source seconds. */
	trim: Range;
	/** Passages removed inside the trim, in source seconds: sorted, never touching each other. */
	cuts: readonly Range[];
	/** Volume change, in decibels. */
	gain: number;
	/** Fade lengths, in seconds of the output. */
	fadeIn: number;
	fadeOut: number;
}

/** Shortest output allowed: a trim or a cut never leaves less than this. */
export const MIN_OUTPUT = 0.05;

/** Length of the fade applied on each side of a cut, so the jump doesn't click. */
export const DECLICK = 0.004;

export const GAIN_RANGE = { min: -24, max: 24 } as const;

export function createAudioDoc(duration: number): AudioDoc {
	return { duration, trim: { start: 0, end: duration }, cuts: [], gain: 0, fadeIn: 0, fadeOut: 0 };
}

/** The source ranges heard in the output, in order. */
export function keptRanges(doc: AudioDoc): Range[] {
	const ranges: Range[] = [];
	let start = doc.trim.start;
	for (const cut of doc.cuts) {
		if (cut.start > start) ranges.push({ start, end: cut.start });
		start = Math.max(start, cut.end);
	}
	if (doc.trim.end > start) ranges.push({ start, end: doc.trim.end });
	return ranges;
}

export function outputDuration(doc: AudioDoc): number {
	return totalLength(keptRanges(doc));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Sorts cuts, merges those that touch and drops what falls outside the trim. */
function normaliseCuts(cuts: readonly Range[], trim: Range): Range[] {
	const inside = cuts
		.map((cut) => ({ start: Math.max(cut.start, trim.start), end: Math.min(cut.end, trim.end) }))
		.filter((cut) => cut.end > cut.start)
		.toSorted((a, b) => a.start - b.start);
	const merged: Range[] = [];
	for (const cut of inside) {
		const last = merged.at(-1);
		if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
		else merged.push({ ...cut });
	}
	return merged;
}

/** Applies a new trim and cuts, unless they would leave almost nothing to hear. */
function withRanges(doc: AudioDoc, trim: Range, cuts: readonly Range[]): AudioDoc {
	const next = { ...doc, trim, cuts: normaliseCuts(cuts, trim) };
	return outputDuration(next) < MIN_OUTPUT ? doc : next;
}

/** Moves the start and end of the kept part. Cuts outside it are dropped. */
export function setTrim(doc: AudioDoc, trim: Range): AudioDoc {
	const start = clamp(trim.start, 0, doc.duration - MIN_OUTPUT);
	const end = clamp(trim.end, start + MIN_OUTPUT, doc.duration);
	return withRanges(doc, { start, end }, doc.cuts);
}

/**
 * Removes a passage. A passage that reaches the start or the end of the kept part moves the trim
 * instead, so the handles stay where the sound starts and stops.
 */
export function cut(doc: AudioDoc, passage: Range): AudioDoc {
	const start = Math.max(passage.start, doc.trim.start);
	const end = Math.min(passage.end, doc.trim.end);
	if (end - start <= 0) return doc;
	const trim = {
		start: start <= doc.trim.start ? end : doc.trim.start,
		end: end >= doc.trim.end ? start : doc.trim.end,
	};
	if (trim.end - trim.start < MIN_OUTPUT) return doc;
	const touchesEdge = trim.start !== doc.trim.start || trim.end !== doc.trim.end;
	return withRanges(doc, trim, touchesEdge ? doc.cuts : [...doc.cuts, { start, end }]);
}

/** Keeps only a passage: the trim becomes the passage, cuts inside it stay. */
export function keepOnly(doc: AudioDoc, passage: Range): AudioDoc {
	const start = clamp(passage.start, 0, doc.duration);
	const end = clamp(passage.end, 0, doc.duration);
	if (end - start < MIN_OUTPUT) return doc;
	return withRanges(doc, { start, end }, doc.cuts);
}

export function restoreCut(doc: AudioDoc, index: number): AudioDoc {
	return { ...doc, cuts: doc.cuts.filter((_, i) => i !== index) };
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
	// Fades longer than the output share it in proportion.
	const fadeTotal = doc.fadeIn + doc.fadeOut;
	const scale = fadeTotal > length ? length / fadeTotal : 1;
	const fadeIn = doc.fadeIn * scale;
	const fadeOut = doc.fadeOut * scale;
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
