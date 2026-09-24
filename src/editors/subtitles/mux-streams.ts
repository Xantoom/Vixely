/**
 * Subtitle documents as the tracks of a video file store them: Matroska keeps SRT text as it is,
 * ASS events without their times (their order in `ReadOrder`), and PGS display sets as blocks.
 */
import type { StreamData } from '@/media/remux';
import { type Cue, shownCues, type SubtitleDoc } from './document';
import { defaultAssFields } from './document';
import { plainText } from './formats/markup';
import { pgsBlocks } from './pgs';

const utf8 = new TextEncoder();

function pack(codec: string, codecPrivate: string, lines: { start: number; end: number; text: string }[]): StreamData {
	const encoded = lines.map((line) => utf8.encode(line.text));
	const offsets = new Uint32Array(encoded.length + 1);
	encoded.forEach((bytes, k) => {
		offsets[k + 1] = (offsets[k] ?? 0) + bytes.length;
	});
	const data = new Uint8Array(offsets[encoded.length] ?? 0);
	encoded.forEach((bytes, k) => {
		data.set(bytes, offsets[k]);
	});
	return {
		codec,
		private: utf8.encode(codecPrivate),
		starts: Float64Array.from(lines.map((line) => line.start)),
		durations: Float64Array.from(lines.map((line) => line.end - line.start)),
		offsets,
		data,
	};
}

/** Lines with words: a line left empty would show nothing and only clutter the track. */
function withText(doc: SubtitleDoc): Cue[] {
	return shownCues(doc).filter((cue) => plainText(cue.text, doc.format).trim() !== '');
}

/** Matroska codec of a document's track. */
export function trackCodec(doc: SubtitleDoc): string {
	if (doc.format === 'pgs') return 'S_HDMV/PGS';
	if (doc.format === 'vtt') return 'S_TEXT/WEBVTT';
	if (doc.format === 'ass') return doc.ass?.scriptType?.toLowerCase() === 'v4.00' ? 'S_TEXT/SSA' : 'S_TEXT/ASS';
	return 'S_TEXT/UTF8';
}

/** The document as a Matroska subtitle track. */
export async function matroskaStream(doc: SubtitleDoc): Promise<StreamData> {
	const codec = trackCodec(doc);
	if (doc.format === 'pgs') {
		return { codec, private: new Uint8Array(), ...(await pgsBlocks(doc)) };
	}
	if (doc.format === 'ass' && doc.ass) {
		const { ass } = doc;
		// The header up to the events, which Matroska keeps as the codec setup.
		const format = ass.format.filter((name) => !/^(start|end)$/i.test(name));
		const setup = `${ass.head.replace(/\s+$/, '')}\r\n\r\n[Events]\r\nFormat: ${ass.format.join(', ')}\r\n`;
		const defaults = defaultAssFields();
		// Comments are not stored in Matroska; the order of the others says which one draws on top.
		const events = doc.cues
			.filter((cue) => !cue.comment)
			.map((cue, order) => {
				const values = format.map((name) => {
					const key = name.toLowerCase();
					if (key === 'text') return cue.text.replace(/\r?\n/g, '\\N');
					return cue.fields?.[key] ?? defaults[key] ?? '';
				});
				return { start: cue.start, end: cue.end, text: `${order},${values.join(',')}` };
			});
		return pack(codec, setup, events);
	}
	return pack(codec, '', withText(doc));
}

/** The document as MP4 timed text: plain lines, one shown at a time. */
export function timedTextStream(doc: SubtitleDoc): StreamData {
	const lines = withText(doc).map((cue) => ({
		start: cue.start,
		end: cue.end,
		text: plainText(cue.text, doc.format).trim(),
	}));
	return pack('tx3g', '', lines);
}
