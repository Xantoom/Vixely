import { type Range, totalLength } from './timemap';

/**
 * What a timed editor keeps of its source: a trim (the part kept) and cuts (passages removed
 * inside it). Audio and video share these rules, so a passage is removed the same way in both.
 */
export interface Kept {
	/** Length of the source, in seconds. */
	duration: number;
	/** Part of the source kept, in source seconds. */
	trim: Range;
	/** Passages removed inside the trim, in source seconds: sorted, never touching each other. */
	cuts: readonly Range[];
}

/** Shortest output allowed: a trim or a cut never leaves less than this. */
export const MIN_OUTPUT = 0.05;

/** The source ranges in the output, in order. */
export function keptRanges(doc: Kept): Range[] {
	const ranges: Range[] = [];
	let start = doc.trim.start;
	for (const cut of doc.cuts) {
		if (cut.start > start) ranges.push({ start, end: cut.start });
		start = Math.max(start, cut.end);
	}
	if (doc.trim.end > start) ranges.push({ start, end: doc.trim.end });
	return ranges;
}

export function outputDuration(doc: Kept): number {
	return totalLength(keptRanges(doc));
}

/** Whether anything of the source is left out. */
export function isShortened(doc: Kept): boolean {
	return doc.trim.start > 0 || doc.trim.end < doc.duration || doc.cuts.length > 0;
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

/** Applies a new trim and cuts, unless they would leave almost nothing. */
function withRanges<T extends Kept>(doc: T, trim: Range, cuts: readonly Range[]): T {
	const next = { ...doc, trim, cuts: normaliseCuts(cuts, trim) };
	return outputDuration(next) < MIN_OUTPUT ? doc : next;
}

/** Moves the start and end of the kept part. Cuts outside it are dropped. */
export function setTrim<T extends Kept>(doc: T, trim: Range): T {
	const start = clamp(trim.start, 0, doc.duration - MIN_OUTPUT);
	const end = clamp(trim.end, start + MIN_OUTPUT, doc.duration);
	return withRanges(doc, { start, end }, doc.cuts);
}

/**
 * Removes a passage. A passage that reaches the start or the end of the kept part moves the trim
 * instead, so the handles stay where the output starts and stops.
 */
export function cut<T extends Kept>(doc: T, passage: Range): T {
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
export function keepOnly<T extends Kept>(doc: T, passage: Range): T {
	const start = clamp(passage.start, 0, doc.duration);
	const end = clamp(passage.end, 0, doc.duration);
	if (end - start < MIN_OUTPUT) return doc;
	return withRanges(doc, { start, end }, doc.cuts);
}

export function restoreCut<T extends Kept>(doc: T, index: number): T {
	return { ...doc, cuts: doc.cuts.filter((_, i) => i !== index) };
}
