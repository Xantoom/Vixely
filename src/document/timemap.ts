/**
 * Source time and output time.
 *
 * Timed editors never modify the source: they keep a list of the source ranges that make up the
 * output, in order. Output time runs through those ranges back to back, so a passage removed in
 * the middle simply disappears from the output. The timeline shows source time, playback and
 * export follow output time; these functions translate between the two.
 */

/** A span of time in seconds, `start` inclusive, `end` exclusive. */
export interface Range {
	start: number;
	end: number;
}

export function rangeLength(range: Range): number {
	return range.end - range.start;
}

export function totalLength(ranges: readonly Range[]): number {
	return ranges.reduce((total, range) => total + rangeLength(range), 0);
}

/**
 * Output time of a source time. A source time inside a removed passage maps to where the output
 * resumes, and one past the end maps to the end of the output.
 */
export function toOutput(ranges: readonly Range[], source: number): number {
	let output = 0;
	for (const range of ranges) {
		if (source < range.start) return output;
		if (source < range.end) return output + (source - range.start);
		output += rangeLength(range);
	}
	return output;
}

/** Source time of an output time, clamped to the output. */
export function toSource(ranges: readonly Range[], output: number): number {
	let remaining = Math.max(0, output);
	for (const range of ranges) {
		const length = rangeLength(range);
		if (remaining < length) return range.start + remaining;
		remaining -= length;
	}
	return ranges.at(-1)?.end ?? 0;
}

/** Whether a source time is part of the output. */
export function isKept(ranges: readonly Range[], source: number): boolean {
	return ranges.some((range) => source >= range.start && source < range.end);
}

/**
 * Output times where two ranges meet. The audio jumps there, so it is briefly faded out and back
 * in to avoid a click.
 */
export function junctions(ranges: readonly Range[]): number[] {
	const times: number[] = [];
	let output = 0;
	for (const range of ranges.slice(0, -1)) {
		output += rangeLength(range);
		times.push(output);
	}
	return times;
}

/** What `ranges` cover beyond `within`: both sorted, neither overlapping itself. */
export function beyond(ranges: readonly Range[], within: readonly Range[]): Range[] {
	const left: Range[] = [];
	for (const range of ranges) {
		let start = range.start;
		for (const other of within) {
			if (other.end <= start || other.start >= range.end) continue;
			if (other.start > start) left.push({ start, end: other.start });
			start = Math.max(start, other.end);
		}
		if (range.end > start) left.push({ start, end: range.end });
	}
	return left;
}

export function sameRanges(a: readonly Range[], b: readonly Range[]): boolean {
	return a.length === b.length && a.every((range, i) => range.start === b[i]?.start && range.end === b[i]?.end);
}

/** Shortest span a timeline zooms to, in seconds. */
export const MIN_VIEW = 1;

/** Keeps a timeline view within the source and at least MIN_VIEW long, preserving its length when possible. */
export function clampView(view: Range, duration: number): Range {
	const length = Math.min(duration, Math.max(MIN_VIEW, view.end - view.start));
	const start = Math.min(Math.max(0, view.start), duration - length);
	return { start, end: start + length };
}
