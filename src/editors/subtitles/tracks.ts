/**
 * Subtitle tracks of video files turned into documents. Each container stores lines its own way:
 * Matroska keeps SRT text as is and ASS events without their times, MP4 timed text prefixes each
 * line with its length, WebVTT in MP4 wraps cues in boxes, and PGS pictures come as display sets.
 */
import type { ExtractedTrack, SubtitleTrackInfo } from '@/media/subtitle-source';
import { loadSubs } from '@/wasm/subs';
import type { Pictures } from '@/wasm/vixely-subs/vixely_subs.js';
import { type Cue, newCueId, type Picture, type SubtitleDoc } from './document';
import { parseAss } from './formats/ass';

/** How the lines of a track are stored. */
export type TrackKind = 'srt' | 'ass' | 'vtt' | 'wvtt' | 'tx3g' | 'pgs';

/** Why a track can't be opened. */
export type Unsupported = 'vobsub' | 'dvb' | 'ttml' | 'captions' | 'compressed' | 'other';

const KINDS: Record<string, TrackKind> = {
	'S_TEXT/UTF8': 'srt',
	'S_TEXT/ASCII': 'srt',
	'S_TEXT/ASS': 'ass',
	'S_TEXT/SSA': 'ass',
	S_ASS: 'ass',
	S_SSA: 'ass',
	'S_TEXT/WEBVTT': 'vtt',
	'D_WEBVTT/SUBTITLES': 'vtt',
	'D_WEBVTT/CAPTIONS': 'vtt',
	'D_WEBVTT/DESCRIPTIONS': 'vtt',
	'S_HDMV/PGS': 'pgs',
	tx3g: 'tx3g',
	text: 'tx3g',
	wvtt: 'wvtt',
};

export function trackKind(track: SubtitleTrackInfo): TrackKind | null {
	return track.readable ? (KINDS[track.codec] ?? null) : null;
}

export function unsupportedReason(track: SubtitleTrackInfo): Unsupported {
	if (!track.readable) return 'compressed';
	if (track.codec === 'S_VOBSUB') return 'vobsub';
	if (track.codec === 'S_DVBSUB') return 'dvb';
	if (track.codec === 'stpp' || track.codec === 'S_TEXT/USF') return 'ttml';
	if (track.codec === 'c608' || track.codec === 'c708') return 'captions';
	return 'other';
}

/** Short codec name shown next to a track. */
export function codecLabel(track: SubtitleTrackInfo): string {
	const kind = KINDS[track.codec];
	if (kind === 'tx3g') return 'Timed Text';
	if (kind === 'wvtt' || kind === 'vtt') return 'WebVTT';
	if (kind) return kind.toUpperCase();
	if (track.codec === 'S_VOBSUB') return 'VobSub';
	return track.codec.replace(/^S_/, '');
}

/**
 * The track shown first: the default one, else the first that can be opened. Forced tracks
 * (signs only) come after complete ones.
 */
export function preferredTrack(tracks: readonly SubtitleTrackInfo[]): SubtitleTrackInfo | null {
	const usable = tracks.filter((track) => trackKind(track) !== null);
	return (
		usable.find((track) => track.default && !track.forced) ??
		usable.find((track) => !track.forced) ??
		usable[0] ??
		null
	);
}

const utf8 = new TextDecoder();

function packet(track: ExtractedTrack, k: number): Uint8Array {
	return track.data.subarray(track.offsets[k] ?? 0, track.offsets[k + 1] ?? 0);
}

/** End of line `k`: its duration, else the start of the next line, else two seconds later. */
function endOf(track: ExtractedTrack, k: number): number {
	const start = track.starts[k] ?? 0;
	const duration = track.durations[k] ?? Number.NaN;
	if (Number.isFinite(duration) && duration > 0) return Math.round(start + duration);
	const next = track.starts[k + 1];
	return Math.round(next !== undefined && next > start ? next : start + 2000);
}

function lines(track: ExtractedTrack, text: (data: Uint8Array) => string | null): Cue[] {
	const cues: Cue[] = [];
	for (let k = 0; k < track.starts.length; k++) {
		const content = text(packet(track, k));
		if (content === null) continue;
		const start = Math.round(track.starts[k] ?? 0);
		cues.push({ id: newCueId(), start, end: Math.max(start + 1, endOf(track, k)), text: content });
	}
	return cues;
}

function cleanText(data: Uint8Array): string {
	return utf8.decode(data).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

/**
 * MP4 timed text: a 16-bit length, then the text, in UTF-8 or UTF-16 with a byte order mark.
 * Style boxes after the text are left out.
 */
export function timedText(data: Uint8Array): string | null {
	if (data.length < 2) return null;
	const length = ((data[0] ?? 0) << 8) | (data[1] ?? 0);
	const bytes = data.subarray(2, 2 + length);
	if (bytes.length === 0) return null;
	const text =
		bytes[0] === 0xfe && bytes[1] === 0xff ? new TextDecoder('utf-16be').decode(bytes) : utf8.decode(bytes);
	return text.replace(/\r\n?/g, '\n');
}

/** The boxes of an MP4 WebVTT sample: `vttc` cues holding `payl` (text), `sttg` (settings), `iden`. */
export function webvttCues(data: Uint8Array): { text: string; settings: string; id: string }[] {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const boxes = (from: number, to: number) => {
		const found: { type: string; start: number; end: number }[] = [];
		for (let at = from; at + 8 <= to;) {
			const size = view.getUint32(at);
			if (size < 8 || at + size > to) break;
			found.push({ type: utf8.decode(data.subarray(at + 4, at + 8)), start: at + 8, end: at + size });
			at += size;
		}
		return found;
	};
	return boxes(0, data.length)
		.filter((box) => box.type === 'vttc')
		.map((cue) => {
			const parts = Object.fromEntries(
				boxes(cue.start, cue.end).map((part) => [part.type, utf8.decode(data.subarray(part.start, part.end))]),
			);
			return { text: parts.payl ?? '', settings: parts.sttg ?? '', id: parts.iden ?? '' };
		});
}

/**
 * Matroska ASS events: `ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text`,
 * the fields of the header's Format line without the times. ReadOrder restores the file order,
 * which decides which line draws on top.
 */
function assDoc(header: string, track: ExtractedTrack): SubtitleDoc | null {
	const doc = parseAss(header.includes('[Events]') ? header : `${header}\n[Events]\n`);
	if (!doc?.ass) return null;
	const names = doc.ass.format.map((name) => name.toLowerCase()).filter((name) => name !== 'start' && name !== 'end');
	const ordered: { order: number; cue: Cue }[] = [];
	for (let k = 0; k < track.starts.length; k++) {
		const line = cleanText(packet(track, k));
		const values: string[] = [];
		let from = 0;
		// ReadOrder first, then every field but the last (the text may hold commas).
		for (let field = 0; field < names.length; field++) {
			const comma = line.indexOf(',', from);
			if (comma === -1) break;
			values.push(line.slice(from, comma));
			from = comma + 1;
		}
		values.push(line.slice(from));
		const [order = '0', ...rest] = values;
		const fields: Record<string, string> = {};
		let text = '';
		names.forEach((name, index) => {
			const value = rest[index] ?? '';
			if (name === 'text') text = value;
			else fields[name] = value.trim();
		});
		const start = Math.round(track.starts[k] ?? 0);
		ordered.push({
			order: Number(order),
			cue: { id: newCueId(), start, end: Math.max(start + 1, endOf(track, k)), text, fields },
		});
	}
	ordered.sort((a, b) => a.order - b.order);
	return { ...doc, cues: ordered.map((entry) => entry.cue) };
}

/** A PGS document from pictures read by vixely-subs. */
async function pgsDoc(read: (subs: Awaited<ReturnType<typeof loadSubs>>) => Pictures): Promise<SubtitleDoc> {
	const subs = await loadSubs();
	const pictures = read(subs);
	const starts = pictures.starts();
	const durations = pictures.durations();
	const offsets = pictures.offsets();
	const data = pictures.data();
	const rects = pictures.rects();
	const forced = pictures.forced();
	pictures.free();
	const cues: Cue[] = [];
	let size: { width: number; height: number } | null = null;
	for (let k = 0; k < starts.length; k++) {
		const start = Math.round(starts[k] ?? 0);
		const duration = durations[k] ?? Number.NaN;
		const end = Math.round(Number.isFinite(duration) ? start + duration : (starts[k + 1] ?? start + 5000));
		const r = k * 6;
		size ??= { width: rects[r + 4] ?? 1920, height: rects[r + 5] ?? 1080 };
		const picture: Picture = {
			set: data.slice(offsets[k] ?? 0, offsets[k + 1] ?? 0),
			x: rects[r] ?? 0,
			y: rects[r + 1] ?? 0,
			width: rects[r + 2] ?? 0,
			height: rects[r + 3] ?? 0,
			forced: forced[k] === 1,
		};
		cues.push({ id: newCueId(), start, end: Math.max(start + 1, end), text: '', picture });
	}
	return { format: 'pgs', cues, ass: null, vttHeader: null, pgsSize: size };
}

/** A `.sup` file as a document. */
export async function supDoc(bytes: Uint8Array): Promise<SubtitleDoc> {
	return pgsDoc((subs) => subs.pgs_from_sup(bytes));
}

/** A track read from a video file, as a document. Null when nothing could be made of it. */
export async function trackDoc(info: SubtitleTrackInfo, track: ExtractedTrack): Promise<SubtitleDoc | null> {
	const kind = trackKind(info);
	if (kind === 'pgs') {
		return pgsDoc((subs) => subs.pgs_from_packets(track.starts, track.durations, track.offsets, track.data));
	}
	if (kind === 'ass') return assDoc(utf8.decode(track.codecPrivate), track);
	if (kind === 'srt') return { format: 'srt', cues: lines(track, cleanText), ass: null, vttHeader: null };
	if (kind === 'tx3g') return { format: 'srt', cues: lines(track, timedText), ass: null, vttHeader: null };
	if (kind === 'vtt') {
		const header = utf8.decode(track.codecPrivate).trim();
		return {
			format: 'vtt',
			cues: lines(track, cleanText),
			ass: null,
			vttHeader: header.startsWith('WEBVTT') ? header : 'WEBVTT',
		};
	}
	if (kind === 'wvtt') {
		const cues: Cue[] = [];
		for (let k = 0; k < track.starts.length; k++) {
			const start = Math.round(track.starts[k] ?? 0);
			for (const cue of webvttCues(packet(track, k))) {
				cues.push({
					id: newCueId(),
					start,
					end: Math.max(start + 1, endOf(track, k)),
					text: cue.text,
					vtt: { id: cue.id, settings: cue.settings },
				});
			}
		}
		return { format: 'vtt', cues, ass: null, vttHeader: 'WEBVTT' };
	}
	return null;
}
