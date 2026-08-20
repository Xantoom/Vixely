import type { AssStyle, SubtitleCue, SubtitleFormat } from "../document/types.ts";

/**
 * The cue model every subtitle format is read into and written out of.
 *
 * Deliberately the lowest common shape plus what ASS needs, rather than a union
 * per format: conversion between formats then becomes a question of what each
 * one can carry, which is exactly what has to be shown to the user before they
 * commit to it.
 */

export type SubtitleTrack = {
	readonly format: SubtitleFormat;
	readonly cues: readonly SubtitleCue[];
	readonly styles: readonly AssStyle[];
	/** `[Script Info]` for ASS, header lines for WebVTT, empty for SRT. */
	readonly scriptInfo: Readonly<Record<string, string>>;
	/** Raw header, kept verbatim so a round trip is lossless. */
	readonly rawHeader: string | null;
};

export class SubtitleParseError extends Error {
	constructor(
		message: string,
		readonly line: number,
	) {
		super(`${message} (line ${line})`);
		this.name = "SubtitleParseError";
	}
}

export const DEFAULT_ASS_STYLE: AssStyle = {
	name: "Default",
	fontName: "Arial",
	fontSize: 48,
	primaryColour: "&H00FFFFFF",
	secondaryColour: "&H000000FF",
	outlineColour: "&H00000000",
	backColour: "&H80000000",
	bold: false,
	italic: false,
	underline: false,
	strikeOut: false,
	scaleX: 100,
	scaleY: 100,
	spacing: 0,
	angle: 0,
	borderStyle: 1,
	outline: 2,
	shadow: 1,
	alignment: 2,
	marginL: 20,
	marginR: 20,
	marginV: 30,
	encoding: 1,
};

export function emptyTrack(format: SubtitleFormat): SubtitleTrack {
	return { format, cues: [], styles: [], scriptInfo: {}, rawHeader: null };
}

/** Strips a UTF-8 BOM, which a great many SRT files in the wild carry. */
export function stripBom(text: string): string {
	return text.codePointAt(0) === 0xfe_ff ? text.slice(1) : text;
}

/** Normalises CRLF and lone CR, both common in subtitle files. */
export function normaliseNewlines(text: string): string {
	return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/**
 * Decodes bytes to text, falling back to Windows-1252.
 *
 * A large share of older SRT files are cp1252, and decoding them as UTF-8
 * turns every accented character into a replacement character — which users
 * read as "the tool is broken", not "the file was mislabelled".
 */
export function decodeSubtitleText(bytes: Uint8Array): { text: string; encoding: string } {
	const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	if (!utf8.includes("\uFFFD")) return { text: stripBom(utf8), encoding: "utf-8" };

	try {
		const fallback = new TextDecoder("windows-1252").decode(bytes);
		return { text: stripBom(fallback), encoding: "windows-1252" };
	} catch {
		return { text: stripBom(utf8), encoding: "utf-8" };
	}
}

export function cueDuration(cue: SubtitleCue): number {
	return Math.max(0, cue.endMs - cue.startMs);
}

/** Characters per second, the readability measure editors show. */
export function charactersPerSecond(cue: SubtitleCue): number {
	const seconds = cueDuration(cue) / 1000;
	if (seconds <= 0) return Number.POSITIVE_INFINITY;
	// Formatting tags do not reach the reader's eye, so they do not count.
	const visible = cue.text.replaceAll(/\{[^}]*\}/gu, "").replaceAll(/<[^>]*>/gu, "");
	return visible.length / seconds;
}

/** Cues that overlap in time, which is a defect in SRT and legal in ASS. */
export function findOverlaps(
	cues: readonly SubtitleCue[],
): readonly (readonly [SubtitleCue, SubtitleCue])[] {
	const sorted = cues.toSorted((a, b) => a.startMs - b.startMs);
	const overlaps: (readonly [SubtitleCue, SubtitleCue])[] = [];

	for (let index = 1; index < sorted.length; index++) {
		const previous = sorted[index - 1];
		const current = sorted[index];
		if (previous === undefined || current === undefined) continue;
		// Different layers are meant to coexist; same-layer overlap is not.
		if (current.startMs < previous.endMs && current.layer === previous.layer) {
			overlaps.push([previous, current]);
		}
	}

	return overlaps;
}

export function shiftCues(cues: readonly SubtitleCue[], offsetMs: number): readonly SubtitleCue[] {
	return cues.map((cue) => ({
		...cue,
		startMs: Math.max(0, cue.startMs + offsetMs),
		endMs: Math.max(0, cue.endMs + offsetMs),
	}));
}

export function sortCues(cues: readonly SubtitleCue[]): readonly SubtitleCue[] {
	return cues.toSorted((a, b) => a.startMs - b.startMs || a.layer - b.layer);
}

/**
 * What a conversion will lose.
 *
 * Listed rather than silently applied: a user converting a styled ASS track to
 * SRT is discarding the styling, and finding that out after the fact is the
 * thing this exists to prevent.
 */
export type ConversionLoss = {
	readonly code:
		| "styles"
		| "positioning"
		| "karaoke"
		| "layers"
		| "drawing"
		| "images"
		| "text-uneditable";
	readonly detail: string;
};

export function conversionLosses(
	from: SubtitleFormat,
	to: SubtitleFormat,
	track: Pick<SubtitleTrack, "cues" | "styles">,
): readonly ConversionLoss[] {
	if (from === to) return [];

	const losses: ConversionLoss[] = [];
	const hasTags = track.cues.some((cue) => /\{\\/u.test(cue.text));
	const hasKaraoke = track.cues.some((cue) => /\{\\k[fo]?\d/u.test(cue.text));
	const hasDrawing = track.cues.some((cue) => /\{\\p[1-9]/u.test(cue.text));
	const hasLayers = track.cues.some((cue) => cue.layer > 0);
	const hasMargins = track.cues.some(
		(cue) => cue.marginLeft !== null || cue.marginRight !== null || cue.marginVertical !== null,
	);

	if (from === "pgs") {
		losses.push({
			code: "images",
			detail: "PGS carries images, not text; converting rasterises nothing back into words",
		});
		return losses;
	}

	if (to === "pgs") {
		losses.push({
			code: "text-uneditable",
			detail: "PGS is images: the text can no longer be edited after conversion",
		});
	}

	if (from === "ass") {
		if (to === "srt" || to === "vtt") {
			if (track.styles.length > 0) {
				losses.push({
					code: "styles",
					detail: `${track.styles.length} style definitions (fonts, colours, outlines)`,
				});
			}
			if (hasTags) {
				losses.push({
					code: "styles",
					detail: "inline override tags such as colour and font changes",
				});
			}
			if (hasKaraoke) {
				losses.push({ code: "karaoke", detail: "karaoke timing" });
			}
			if (hasDrawing) {
				losses.push({ code: "drawing", detail: "vector drawing commands" });
			}
			if (hasLayers) {
				losses.push({ code: "layers", detail: "layering, so overlapping cues will collide" });
			}
		}
		if (to === "srt" && hasMargins) {
			losses.push({ code: "positioning", detail: "cue positioning, which SRT cannot express" });
		}
	}

	if (from === "vtt" && to === "srt" && hasMargins) {
		losses.push({ code: "positioning", detail: "cue positioning and alignment" });
	}

	return losses;
}

export { type SubtitleCue, type AssStyle, type SubtitleFormat };
