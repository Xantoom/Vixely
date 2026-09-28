/**
 * Subtitle tracks of video files turned into documents. Each container stores lines its own way:
 * Matroska keeps SRT text as is and ASS events without their times, MP4 timed text prefixes each
 * line with its length, WebVTT in MP4 wraps cues in boxes, and PGS pictures come as display sets.
 */
import type { ExtractedTrack, SubtitleTrackInfo } from '@/media/subtitle-source';
import { loadSubs } from '@/wasm/subs';
import type { Pictures, PgsStream } from '@/wasm/vixely-subs/vixely_subs.js';
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

/**
 * End of line `k`: its duration, else the start of the next line (`after` when it is in the next
 * batch), else two seconds later.
 */
function endOf(track: ExtractedTrack, k: number, after = Number.NaN): number {
	const start = track.starts[k] ?? 0;
	const duration = track.durations[k] ?? Number.NaN;
	if (Number.isFinite(duration) && duration > 0) return Math.round(start + duration);
	const next = track.starts[k + 1] ?? (Number.isFinite(after) ? after : undefined);
	return Math.round(next !== undefined && next > start ? next : start + 2000);
}

function lines(track: ExtractedTrack, after: number, text: (data: Uint8Array) => string | null): Cue[] {
	const cues: Cue[] = [];
	for (let k = 0; k < track.starts.length; k++) {
		const content = text(packet(track, k));
		if (content === null) continue;
		const start = Math.round(track.starts[k] ?? 0);
		cues.push({ id: newCueId(), start, end: Math.max(start + 1, endOf(track, k, after)), text: content });
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
function assLines(names: readonly string[], track: ExtractedTrack, after: number): { order: number; cue: Cue }[] {
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
			cue: { id: newCueId(), start, end: Math.max(start + 1, endOf(track, k, after)), text, fields },
		});
	}
	return ordered.sort((a, b) => a.order - b.order);
}

/** PGS lines from pictures read by vixely-subs, and the video size their positions refer to. */
function pictureCues(pictures: Pictures): { cues: Cue[]; size: { width: number; height: number } | null } {
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
	return { cues, size };
}

/** A `.sup` file as a document. */
export async function supDoc(bytes: Uint8Array): Promise<SubtitleDoc> {
	const subs = await loadSubs();
	const { cues, size } = pictureCues(subs.pgs_from_sup(bytes));
	return { format: 'pgs', cues, ass: null, vttHeader: null, pgsSize: size };
}

/** Lines of a batch, and for PGS the video size their pictures are placed in. */
export interface BatchLines {
	cues: Cue[];
	pgsSize?: { width: number; height: number } | null;
}

/**
 * A track of a video file turned into a document a batch of lines at a time, in file order. The
 * first batch gives the document, without lines; each batch then gives its lines.
 */
export class TrackReader {
	readonly kind: TrackKind | null;
	/** ASS: field names of the events, and the ReadOrder of each line read, by id. */
	private names: string[] = [];
	private readonly orders = new Map<number, number>();
	private pgs: Promise<PgsStream> | null = null;

	constructor(info: SubtitleTrackInfo) {
		this.kind = trackKind(info);
		if (this.kind === 'pgs') this.pgs = loadSubs().then((subs) => new subs.PgsStream());
	}

	/** The document before its lines, from the setup data of the track. Null for unknown kinds. */
	empty(codecPrivate: Uint8Array): SubtitleDoc | null {
		const doc = { cues: [], ass: null, vttHeader: null };
		if (this.kind === 'pgs') return { ...doc, format: 'pgs', pgsSize: null };
		if (this.kind === 'ass') {
			const header = utf8.decode(codecPrivate);
			const parsed = parseAss(header.includes('[Events]') ? header : `${header}\n[Events]\n`);
			if (!parsed?.ass) return null;
			this.names = parsed.ass.format
				.map((name) => name.toLowerCase())
				.filter((name) => name !== 'start' && name !== 'end');
			return { ...parsed, cues: [] };
		}
		if (this.kind === 'srt' || this.kind === 'tx3g') return { ...doc, format: 'srt' };
		if (this.kind === 'vtt') {
			const header = utf8.decode(codecPrivate).trim();
			return { ...doc, format: 'vtt', vttHeader: header.startsWith('WEBVTT') ? header : 'WEBVTT' };
		}
		if (this.kind === 'wvtt') return { ...doc, format: 'vtt', vttHeader: 'WEBVTT' };
		return null;
	}

	/**
	 * The lines of a batch. `after` is the start of the line after it, in milliseconds (NaN when
	 * unknown); `last` says the track ends with it. PGS pictures are given once their end is known,
	 * so the last one of a batch comes with the next.
	 */
	async lines(track: ExtractedTrack, after: number, last: boolean): Promise<BatchLines> {
		if (this.pgs) {
			const stream = await this.pgs;
			const { cues, size } = pictureCues(
				stream.push(track.starts, track.durations, track.offsets, track.data, last),
			);
			if (last) stream.free();
			return { cues, pgsSize: size };
		}
		if (this.kind === 'ass') {
			const ordered = assLines(this.names, track, after);
			for (const { order, cue } of ordered) this.orders.set(cue.id, order);
			return { cues: ordered.map((entry) => entry.cue) };
		}
		if (this.kind === 'srt' || this.kind === 'vtt') return { cues: lines(track, after, cleanText) };
		if (this.kind === 'tx3g') return { cues: lines(track, after, timedText) };
		if (this.kind === 'wvtt') {
			const cues: Cue[] = [];
			for (let k = 0; k < track.starts.length; k++) {
				const start = Math.round(track.starts[k] ?? 0);
				for (const cue of webvttCues(packet(track, k))) {
					cues.push({
						id: newCueId(),
						start,
						end: Math.max(start + 1, endOf(track, k, after)),
						text: cue.text,
						vtt: { id: cue.id, settings: cue.settings },
					});
				}
			}
			return { cues };
		}
		return { cues: [] };
	}

	/**
	 * ASS lines in the order of the file, once every batch is read: each batch is in order, but
	 * the file may put lines of different times in any order.
	 */
	inFileOrder(cues: readonly Cue[]): readonly Cue[] {
		if (this.kind !== 'ass') return cues;
		return cues.toSorted((a, b) => (this.orders.get(a.id) ?? 0) - (this.orders.get(b.id) ?? 0));
	}
}

/** A track read from a video file, as a document. Null when nothing could be made of it. */
export async function trackDoc(info: SubtitleTrackInfo, track: ExtractedTrack): Promise<SubtitleDoc | null> {
	const reader = new TrackReader(info);
	const doc = reader.empty(track.codecPrivate);
	if (!doc) return null;
	const { cues, pgsSize } = await reader.lines(track, Number.NaN, true);
	return { ...doc, cues: reader.inFileOrder(cues), ...(pgsSize === undefined ? {} : { pgsSize }) };
}
