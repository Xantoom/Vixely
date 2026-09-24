/**
 * Reads subtitle tracks and attachments from video files with vixely-subs. The module reads the
 * file through a synchronous callback, which only a worker can offer (FileReaderSync). See
 * `src/media/subtitle-source.ts`.
 */
import type {
	AttachmentInfo,
	SubtitleSourceRequest,
	SubtitleSourceResponse,
	SubtitleTrackInfo,
} from '@/media/subtitle-source';
import { loadSubs } from '@/wasm/subs';

type Source = InstanceType<Awaited<ReturnType<typeof loadSubs>>['SubtitleSource']>;

let source: Source | null = null;

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
		const { file } = message;
		const read = (offset: number, length: number) =>
			new Uint8Array(reader.readAsArrayBuffer(file.slice(offset, offset + length)));
		source?.free();
		source = new subs.SubtitleSource(read, file.size);
		post({
			type: 'opened',
			tracks: tracksFrom(source.tracks()),
			attachments: attachmentsFrom(source.attachments()),
		});
		return;
	}
	if (!source) throw new Error('No file is open.');
	if (message.type === 'extract') {
		let last = 0;
		const all = source.extract_all(new Uint32Array(message.tracks), (share: number) => {
			// A progress message every percent is plenty.
			if (share - last < 0.01 && share < 1) return;
			last = share;
			post({ type: 'progress', share });
		});
		const tracks = all.map((packets, index) => {
			const extracted = {
				starts: packets.starts(),
				durations: packets.durations(),
				offsets: packets.offsets(),
				data: packets.data(),
				codecPrivate: source?.codec_private(message.tracks[index] ?? 0) ?? new Uint8Array(),
			};
			packets.free();
			return extracted;
		});
		post(
			{ type: 'extracted', tracks },
			tracks.flatMap((track) => [
				track.starts.buffer,
				track.durations.buffer,
				track.offsets.buffer,
				track.data.buffer,
				track.codecPrivate.buffer,
			]),
		);
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
