/**
 * Reads subtitle tracks and attachments from video files with vixely-subs. The module reads the
 * file through a synchronous callback, which only a worker can offer (FileReaderSync). See
 * `src/media/subtitle-source.ts`.
 */
import type {
	AttachmentInfo,
	ExtractedTrack,
	MediaTrackInfo,
	SubtitleSourceRequest,
	SubtitleSourceResponse,
	SubtitleTrackInfo,
} from '@/media/subtitle-source';
import { loadSubs } from '@/wasm/subs';
import type { Packets } from '@/wasm/vixely-subs/vixely_subs.js';

type Source = InstanceType<Awaited<ReturnType<typeof loadSubs>>['SubtitleSource']>;

let source: Source | null = null;
let file: File | null = null;
/** Tracks the file's index doesn't cover, read whole once and handed out a batch at a time. */
const whole = new Map<number, ExtractedTrack>();

/** Reads run at once, at most: the browser serves them in turn, this keeps it busy. */
const READS_AT_ONCE = 16;

/** Reads every range at once, side by side in one buffer. */
async function readRanges(
	from: File,
	ranges: Float64Array,
): Promise<{ starts: Float64Array; lengths: Uint32Array; data: Uint8Array }> {
	const count = ranges.length / 2;
	const starts = new Float64Array(count);
	const lengths = new Uint32Array(count);
	const parts: Uint8Array[] = Array.from({ length: count });
	let next = 0;
	const reader = async () => {
		while (next < count) {
			const k = next++;
			const start = ranges[k * 2] ?? 0;
			// oxlint-disable-next-line no-await-in-loop -- each reader reads in turn
			const part = new Uint8Array(await from.slice(start, start + (ranges[k * 2 + 1] ?? 0)).arrayBuffer());
			starts[k] = start;
			lengths[k] = part.length;
			parts[k] = part;
		}
	};
	await Promise.all(Array.from({ length: Math.min(READS_AT_ONCE, count) }, reader));
	const data = new Uint8Array(lengths.reduce((sum, length) => sum + length, 0));
	let at = 0;
	for (const part of parts) {
		data.set(part, at);
		at += part.length;
	}
	return { starts, lengths, data };
}

function packetsOf(packets: Packets, track: number): ExtractedTrack {
	const extracted = {
		starts: packets.starts(),
		durations: packets.durations(),
		offsets: packets.offsets(),
		data: packets.data(),
		codecPrivate: source?.codec_private(track) ?? new Uint8Array(),
	};
	packets.free();
	return extracted;
}

/** Packets `from..to` of a track read whole. */
function slice(track: ExtractedTrack, from: number, to: number): ExtractedTrack {
	const offsets = track.offsets.slice(from, to + 1);
	const base = offsets[0] ?? 0;
	return {
		starts: track.starts.slice(from, to),
		durations: track.durations.slice(from, to),
		offsets: offsets.map((offset) => offset - base),
		data: track.data.slice(base, offsets.at(-1) ?? base),
		codecPrivate: track.codecPrivate.slice(),
	};
}

/** Sends the share read as it grows: a message every percent is plenty. */
function progress(): (share: number) => void {
	let last = 0;
	return (share) => {
		if (share - last < 0.01 && share < 1) return;
		last = share;
		post({ type: 'progress', share });
	};
}

function transfers(track: ExtractedTrack): Transferable[] {
	return [
		track.starts.buffer,
		track.durations.buffer,
		track.offsets.buffer,
		track.data.buffer,
		track.codecPrivate.buffer,
	];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function list(json: string): Record<string, unknown>[] {
	const value: unknown = JSON.parse(json);
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

/** The track list vixely-subs writes as JSON. */
function tracksFrom(json: string): SubtitleTrackInfo[] {
	return list(json).map((track) => ({
		id: Number(track.id),
		codec: text(track.codec, ''),
		language: text(track.language, 'und'),
		name: text(track.name, ''),
		default: track.default === true,
		forced: track.forced === true,
		readable: track.readable === true,
	}));
}

function mediaFrom(json: string): MediaTrackInfo[] {
	return list(json).map((track) => ({
		id: Number(track.id),
		kind: track.kind === 'video' ? 'video' : 'audio',
		codec: text(track.codec, ''),
		language: text(track.language, 'und'),
		name: text(track.name, ''),
		default: track.default === true,
	}));
}

function attachmentsFrom(json: string): AttachmentInfo[] {
	return list(json).map((file) => ({
		name: text(file.name, ''),
		mime: text(file.mime, ''),
		size: Number(file.size),
	}));
}

function post(message: SubtitleSourceResponse, transfer: Transferable[] = []) {
	self.postMessage(message, { transfer });
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function handle(message: SubtitleSourceRequest) {
	const subs = await loadSubs();
	if (message.type === 'open') {
		const reader = new FileReaderSync();
		const opened = message.file;
		const read = (offset: number, length: number) =>
			new Uint8Array(reader.readAsArrayBuffer(opened.slice(offset, offset + length)));
		source?.free();
		whole.clear();
		file = opened;
		source = new subs.SubtitleSource(read, opened.size);
		post({
			type: 'opened',
			tracks: tracksFrom(source.tracks()),
			media: mediaFrom(source.media_tracks()),
			attachments: attachmentsFrom(source.attachments()),
		});
		return;
	}
	if (!source || !file) throw new Error('No file is open.');
	if (message.type === 'batch') {
		const { track, from, count } = message;
		const total = source.indexed_count(track);
		if (total >= 0) {
			const read = await readRanges(file, source.batch_ranges(track, from, count));
			source.prefetch(read.starts, read.lengths, read.data);
			const packets = packetsOf(source.read_batch(track, from, count), track);
			const next = source.block_time(track, from + count);
			post({ type: 'batch', packets, total, next }, transfers(packets));
			return;
		}
		let all = whole.get(track);
		if (!all) {
			const [read] = source.extract_all(new Uint32Array([track]), progress());
			if (!read) throw new Error('No such track.');
			all = packetsOf(read, track);
			whole.set(track, all);
		}
		const to = Math.min(all.starts.length, from + count);
		const packets = slice(all, from, to);
		post(
			{ type: 'batch', packets, total: all.starts.length, next: all.starts[to] ?? Number.NaN },
			transfers(packets),
		);
		return;
	}
	if (message.type === 'extract') {
		const all = source.extract_all(new Uint32Array(message.tracks), progress());
		const tracks = all.map((packets, index) => packetsOf(packets, message.tracks[index] ?? 0));
		post({ type: 'extracted', tracks }, tracks.flatMap(transfers));
		return;
	}
	const files = message.indices.map((index) => source?.attachment(index) ?? new Uint8Array());
	post(
		{ type: 'attachments', files },
		files.map((file) => file.buffer),
	);
}

self.onmessage = (event: MessageEvent<SubtitleSourceRequest>) => {
	handle(event.data).catch((error: unknown) => {
		post({ type: 'error', message: describe(error) });
	});
};
