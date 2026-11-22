import type { Cue, SubtitleDoc } from './document';
import { plainText } from './formats/markup';

export interface Rules {
	maxLines: number;
	maxLineLength: number;
	/** Characters a second. */
	maxReadingSpeed: number;
	/** Milliseconds. */
	minDuration: number;
	maxDuration: number;
	/** Gaps between these two are too short to read as a pause, too long to look joined. */
	joinedGap: number;
	minGap: number;
}

/**
 * What professional subtitling asks of a line, as advice: none of it is enforced. Films, series
 * and anime follow Netflix's Timed Text Style Guide (two lines, 42 characters a line, 5/6 of a
 * second to 7 seconds, 20 characters a second for adults) and fansub timing guides (no gap under
 * 300 ms). Short vertical videos (TikTok, Reels, Shorts) show two to five words at a time, in a
 * narrow picture: lines are much shorter, and a caption may flash by.
 */
export const PROFILES = {
	film: {
		maxLines: 2,
		maxLineLength: 42,
		maxReadingSpeed: 20,
		minDuration: 833,
		maxDuration: 7000,
		joinedGap: 84,
		minGap: 300,
	},
	short: {
		maxLines: 2,
		maxLineLength: 24,
		maxReadingSpeed: 20,
		minDuration: 400,
		maxDuration: 7000,
		joinedGap: 84,
		minGap: 300,
	},
} as const satisfies Record<string, Rules>;

export type ProfileId = keyof typeof PROFILES;

/** Film and series rules, the default. */
const RULES: Rules = PROFILES.film;

export type IssueId = 'empty' | 'lines' | 'length' | 'speed' | 'short' | 'long' | 'gap' | 'stack';

/**
 * Issues that are only worth a look: timing that may be deliberate, such as a gap left for a
 * shot change. The others make a line hard to read.
 */
export const HINTS: ReadonlySet<IssueId> = new Set(['short', 'long', 'gap']);

/** Whether any of a line's issues makes it hard to read. */
export function hasError(issues: readonly IssueId[] | undefined): boolean {
	return issues?.some((issue) => !HINTS.has(issue)) ?? false;
}

/** ASS lines placed by hand or at the top: signs and typesetting, not dialogue. */
function isSign(cue: Cue): boolean {
	return /\\(?:pos|move)\(|\\an[4-9]/.test(cue.text);
}

const segmenter = new Intl.Segmenter();

/** Characters as a reader sees them: an emoji or an accented letter counts once. */
function characterCount(text: string): number {
	let count = 0;
	for (const _ of segmenter.segment(text)) count += 1;
	return count;
}

function linesOf(cue: Cue, doc: SubtitleDoc): string[] {
	return plainText(cue.text, doc.format)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

/**
 * The issues of every line, by id; lines without any are left out. Pictures (PGS) aren't read,
 * and signs are checked for their timing alone.
 */
export function checkLines(doc: SubtitleDoc, rules: Rules = RULES): Map<number, IssueId[]> {
	const issues = new Map<number, IssueId[]>();
	if (doc.format === 'pgs') return issues;
	const flag = (cue: Cue, issue: IssueId) => {
		const list = issues.get(cue.id);
		if (!list) issues.set(cue.id, [issue]);
		else if (!list.includes(issue)) list.push(issue);
	};
	const dialogue: { cue: Cue; lines: number }[] = [];
	for (const cue of doc.cues) {
		if (cue.comment) continue;
		const duration = cue.end - cue.start;
		const lines = linesOf(cue, doc);
		if (lines.length === 0) {
			flag(cue, 'empty');
			continue;
		}
		if (duration < rules.minDuration) flag(cue, 'short');
		if (isSign(cue)) continue;
		if (duration > rules.maxDuration) flag(cue, 'long');
		if (lines.length > rules.maxLines) flag(cue, 'lines');
		if (lines.some((line) => characterCount(line) > rules.maxLineLength)) flag(cue, 'length');
		const characters = lines.join(' ').length;
		if (characters / Math.max(0.001, duration / 1000) > rules.maxReadingSpeed) flag(cue, 'speed');
		dialogue.push({ cue, lines: lines.length });
	}
	dialogue.sort((a, b) => a.cue.start - b.cue.start || a.cue.end - b.cue.end);
	// In linear time or near it, so long tracks and tracks of overlapping lines stay quick to check.
	const count = dialogue.length;
	const starts = dialogue.map(({ cue }) => cue.start);
	/** The first line after `i` that starts once line `i` has ended: those between overlap it. */
	const after = (i: number, end: number) => {
		let [low, high] = [i + 1, count];
		while (low < high) {
			const middle = (low + high) >> 1;
			if ((starts[middle] ?? 0) >= end) high = middle;
			else low = middle + 1;
		}
		return low;
	};
	// Lines shown together beyond two are too many: counts above the limit all weigh the same.
	const cap = rules.maxLines + 1;
	const weight = dialogue.map(({ lines }) => Math.min(lines, cap));
	const total = [0];
	for (const lines of dialogue.map((entry) => entry.lines)) total.push((total.at(-1) ?? 0) + lines);
	/** For each weight, the next line at or after each index that weighs at least as much. */
	const nextHeavy = Array.from({ length: cap + 1 }, () => new Int32Array(count + 1).fill(count));
	for (let i = count - 1; i >= 0; i--)
		for (let at = 1; at <= cap; at++) {
			const row = nextHeavy[at]!;
			row[i] = (weight[i] ?? 0) >= at ? i : (row[i + 1] ?? count);
		}
	/** For each weight, the latest end among the lines so far that weigh at least as much. */
	const latestEnd = Array.from({ length: cap + 1 }, () => Number.NEGATIVE_INFINITY);
	for (let i = 0; i < count; i++) {
		const { cue, lines } = dialogue[i]!;
		const end = after(i, cue.end);
		// The next line that starts after this one ends: a gap too short flickers.
		const next = dialogue[end];
		if (next) {
			const gap = next.cue.start - cue.end;
			if (gap > rules.joinedGap && gap < rules.minGap) flag(cue, 'gap');
		}
		// Lines shown together, stacked at the bottom: more than two lines is too many to read.
		const shown = lines + (total[end] ?? 0) - (total[i + 1] ?? 0);
		if (shown > rules.maxLines && end > i + 1) flag(cue, 'stack');
		// Two lines together over the limit: both are flagged, this one with any later one…
		const heavier = Math.max(1, rules.maxLines - lines + 1);
		if ((nextHeavy[Math.min(heavier, cap)]?.[i + 1] ?? count) < end) flag(cue, 'stack');
		// … and with any earlier one still showing.
		if ((latestEnd[Math.min(heavier, cap)] ?? Number.NEGATIVE_INFINITY) > cue.start) flag(cue, 'stack');
		for (let at = 1; at <= (weight[i] ?? 0); at++) latestEnd[at] = Math.max(latestEnd[at] ?? 0, cue.end);
	}
	return issues;
}
