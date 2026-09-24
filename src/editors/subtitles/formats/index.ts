import { type Cue, defaultAssFields, shownCues, type SubtitleDoc, type SubtitleFormat } from '../document';
import { defaultAssHeader, parseAss, writeAss } from './ass';
import { convertText, plainText } from './markup';
import { parseSrt, writeSrt } from './srt';
import { parseVtt, writeVtt } from './vtt';

export const FORMAT_FILES: Record<SubtitleFormat, { extension: string; mime: string; label: string }> = {
	srt: { extension: 'srt', mime: 'application/x-subrip', label: 'SRT' },
	vtt: { extension: 'vtt', mime: 'text/vtt', label: 'WebVTT' },
	ass: { extension: 'ass', mime: 'text/x-ssa', label: 'ASS' },
};

/**
 * Reads subtitle text. The content decides, not the extension: WebVTT starts with `WEBVTT`, ASS
 * has sections in brackets, SRT is anything with SRT times. Null when no cue can be found.
 */
export function parseSubtitles(text: string): SubtitleDoc | null {
	const vtt = parseVtt(text);
	if (vtt) return vtt;
	const ass = parseAss(text);
	if (ass) return ass;
	const srt = parseSrt(text);
	return srt.cues.length > 0 ? srt : null;
}

/** Cues as they will be written in `format`: converted, and without those left with no words. */
function convertedCues(doc: SubtitleDoc, format: 'srt' | 'vtt'): Cue[] {
	return shownCues(doc)
		.map((cue) => ({ ...cue, text: convertText(cue.text, doc.format, format) }))
		.filter((cue) => plainText(cue.text, format).trim() !== '');
}

/**
 * Cues that disappear when written in `format`: ASS lines that only draw shapes, or only move
 * text around, have no words for SRT or WebVTT. Comments are counted too.
 */
export function droppedCues(doc: SubtitleDoc, format: SubtitleFormat): number {
	if (format === 'ass' || doc.format === format) return 0;
	return doc.cues.length - convertedCues(doc, format).length;
}

/**
 * The document as an ASS script: as written for ASS files, with a default style for others.
 * `playRes` sizes that default style; it should match the video's shape.
 */
export function toAssScript(doc: SubtitleDoc, title: string, playRes?: { width: number; height: number }): string {
	if (doc.format === 'ass' && doc.ass) return writeAss(doc.cues, doc.ass);
	const header = defaultAssHeader(title, playRes);
	const fields = defaultAssFields();
	const cues = shownCues(doc).map((cue) => ({ ...cue, fields, text: convertText(cue.text, doc.format, 'ass') }));
	return writeAss(cues, header);
}

/** The document written as a file in `format`. */
export function writeSubtitles(
	doc: SubtitleDoc,
	format: SubtitleFormat,
	title: string,
	playRes?: { width: number; height: number },
): string {
	if (format === 'ass') return toAssScript(doc, title, playRes);
	const cues = convertedCues(doc, format);
	if (format === 'srt') return writeSrt(cues);
	return writeVtt(cues, doc.format === 'vtt' ? doc.vttHeader : null);
}
