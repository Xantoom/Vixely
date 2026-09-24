/**
 * The subtitle document: a list of cues, each shown between two times, and what the file needs
 * around them to be written back (the styles of an ASS file, the header of a WebVTT one).
 *
 * Times are whole milliseconds, the precision of SRT and WebVTT, so shifting and rescaling never
 * accumulates rounding errors. Cue text is kept in the markup of the file it came from: `{\i1}`
 * for ASS, `<i>` for SRT and WebVTT. It is converted only when written in another format.
 */

export type SubtitleFormat = 'srt' | 'vtt' | 'ass';

export interface Cue {
	/** Stable across edits, for selection and lists. Not written to files. */
	id: number;
	/** Milliseconds. */
	start: number;
	/** Milliseconds, after `start`. */
	end: number;
	/** In the markup of the document's format. */
	text: string;
	/** ASS: every field of the event line other than times and text, by lowercase field name. */
	fields?: Readonly<Record<string, string>>;
	/** ASS: a `Comment:` line. Kept in the file, never shown. */
	comment?: boolean;
	/** WebVTT: the cue identifier and the settings after its times. */
	vtt?: { id: string; settings: string };
}

export interface AssHeader {
	/** Everything before `[Events]`, as it was: script info, styles, fonts. */
	head: string;
	/** Field names of the `Format:` line of `[Events]`, as written. */
	format: string[];
	/** Sections after the events, as they were. */
	tail: string;
	/** The resolution positions and sizes refer to. */
	playRes: { width: number; height: number } | null;
	title: string | null;
	styles: string[];
	/** `v4.00` for SSA, `v4.00+` for ASS. */
	scriptType: string | null;
}

export interface SubtitleDoc {
	/** The markup cue text is written in. */
	format: SubtitleFormat;
	cues: readonly Cue[];
	/** ASS files, and documents converted to ASS. */
	ass: AssHeader | null;
	/** WebVTT files: header text and STYLE or REGION blocks before the first cue. */
	vttHeader: string | null;
}

/** Shortest cue the editor makes, in milliseconds: shorter is unreadable. */
export const MIN_CUE = 100;
/** Length of a new cue, in milliseconds. */
export const NEW_CUE = 2000;

let nextId = 1;

export function newCueId(): number {
	return nextId++;
}

/** Last moment any cue shows, in milliseconds. */
export function lastEnd(doc: SubtitleDoc): number {
	return doc.cues.reduce((end, cue) => Math.max(end, cue.end), 0);
}

/** Cues that are shown, in time order. Comments are left out. */
export function shownCues(doc: SubtitleDoc): Cue[] {
	return doc.cues.filter((cue) => !cue.comment).toSorted((a, b) => a.start - b.start || a.end - b.end);
}

/** Cues showing at a time, in milliseconds. */
export function cuesAt(doc: SubtitleDoc, time: number): Cue[] {
	return doc.cues.filter((cue) => !cue.comment && cue.start <= time && time < cue.end);
}

export function findCue(doc: SubtitleDoc, id: number): Cue | undefined {
	return doc.cues.find((cue) => cue.id === id);
}

export function updateCue(doc: SubtitleDoc, id: number, change: Partial<Omit<Cue, 'id'>>): SubtitleDoc {
	return { ...doc, cues: doc.cues.map((cue) => (cue.id === id ? { ...cue, ...change } : cue)) };
}

/** Sets a cue's times, keeping it at least MIN_CUE long and never before zero. */
export function setCueTimes(doc: SubtitleDoc, id: number, start: number, end: number): SubtitleDoc {
	const from = Math.max(0, Math.round(start));
	return updateCue(doc, id, { start: from, end: Math.max(from + MIN_CUE, Math.round(end)) });
}

/**
 * Adds a cue at a time. It lasts NEW_CUE, shortened so it doesn't run into the next cue. For
 * ASS, it takes the fields of the cue before it (style, layer), as a new line in Aegisub does.
 */
export function addCue(doc: SubtitleDoc, at: number, text = ''): { doc: SubtitleDoc; id: number } {
	const start = Math.max(0, Math.round(at));
	const next = doc.cues
		.filter((cue) => !cue.comment && cue.start > start)
		.reduce((min, cue) => Math.min(min, cue.start), Infinity);
	const end = Math.max(start + MIN_CUE, Math.min(start + NEW_CUE, next));
	const before = doc.cues.findLast((cue) => !cue.comment && cue.start <= start);
	const id = newCueId();
	const cue: Cue = { id, start, end, text };
	if (doc.format === 'ass') cue.fields = before?.fields ?? defaultAssFields();
	// Inserted in time order, so files written in document order stay sorted.
	const index = doc.cues.findIndex((other) => other.start > start);
	const cues = [...doc.cues];
	cues.splice(index === -1 ? cues.length : index, 0, cue);
	return { doc: { ...doc, cues }, id };
}

export function removeCues(doc: SubtitleDoc, ids: ReadonlySet<number>): SubtitleDoc {
	return { ...doc, cues: doc.cues.filter((cue) => !ids.has(cue.id)) };
}

/**
 * Applies `time → time × scale + offset` to the chosen cues (all of them when `ids` is null).
 * Cues pushed before zero are clamped to it, keeping at least MIN_CUE.
 */
export function retime(
	doc: SubtitleDoc,
	scale: number,
	offset: number,
	ids: ReadonlySet<number> | null = null,
): SubtitleDoc {
	if (scale === 1 && offset === 0) return doc;
	return {
		...doc,
		cues: doc.cues.map((cue) => {
			if (ids && !ids.has(cue.id)) return cue;
			const start = Math.max(0, Math.round(cue.start * scale + offset));
			const end = Math.max(start + MIN_CUE, Math.round(cue.end * scale + offset));
			return { ...cue, start, end };
		}),
	};
}

/**
 * The linear retiming that brings two cues to where they should start: `from` are the current
 * start times, `to` the wanted ones. Two known points fix both a drift and an offset, which is
 * what goes wrong when subtitles were made for another cut or frame rate.
 */
export function syncPoints(from: [number, number], to: [number, number]): { scale: number; offset: number } | null {
	const span = from[1] - from[0];
	if (span <= 0) return null;
	const scale = (to[1] - to[0]) / span;
	if (!(scale > 0)) return null;
	return { scale, offset: to[0] - from[0] * scale };
}

/** Frame rates subtitles are commonly converted between, as exact fractions. */
export const FRAME_RATES = [
	{ label: '23.976', value: 24000 / 1001 },
	{ label: '24', value: 24 },
	{ label: '25', value: 25 },
	{ label: '29.97', value: 30000 / 1001 },
	{ label: '30', value: 30 },
] as const;

/** Event fields of a new ASS line, by lowercase field name. */
export function defaultAssFields(): Record<string, string> {
	return {
		layer: '0',
		marked: 'Marked=0',
		style: 'Default',
		name: '',
		marginl: '0',
		marginr: '0',
		marginv: '0',
		effect: '',
	};
}
