/**
 * The subtitle tracks of a video file (Matroska, WebM, MP4, QuickTime), read in a worker. The
 * worker reads only the parts of the file it needs, so a film of several gigabytes lists its
 * tracks at once, and all of them are read together in one pass, in a few seconds at most.
 */

export interface SubtitleTrackInfo {
	/** Track number in the file. */
	id: number;
	/** Matroska codec ID (`S_TEXT/ASS`) or MP4 sample entry (`tx3g`). */
	codec: string;
	/** ISO 639-2 (`fre`) or BCP 47 (`fr-FR`), `und` when unknown. */
	language: string;
	name: string;
	default: boolean;
	forced: boolean;
	/** False for compressed tracks this reader can't unpack, and fragmented MP4 files. */
	readable: boolean;
}

export interface AttachmentInfo {
	name: string;
	mime: string;
	size: number;
}

/** Packets of a track: times in milliseconds, data of packet `k` at `offsets[k]..offsets[k + 1]`. */
export interface ExtractedTrack {
	starts: Float64Array;
	/** NaN when the file doesn't say. */
	durations: Float64Array;
	offsets: Uint32Array;
	data: Uint8Array;
	/** Setup data, such as the ASS header of ASS tracks. */
	codecPrivate: Uint8Array;
}

export type SubtitleSourceRequest =
	| { type: 'open'; file: File }
	| { type: 'extract'; tracks: number[] }
	| { type: 'attachments'; indices: number[] };

export type SubtitleSourceResponse =
	| { type: 'opened'; tracks: SubtitleTrackInfo[]; attachments: AttachmentInfo[] }
	| { type: 'progress'; share: number }
	| { type: 'extracted'; tracks: ExtractedTrack[] }
	| { type: 'attachments'; files: Uint8Array[] }
	| { type: 'error'; message: string };

/** Font files among attachments, by MIME type or extension (muxers write both kinds of types). */
export function isFont(attachment: AttachmentInfo): boolean {
	return /font|truetype|opentype|sfnt/i.test(attachment.mime) || /\.(ttf|otf|ttc|woff2?)$/i.test(attachment.name);
}

export class SubtitleSource {
	readonly tracks: SubtitleTrackInfo[];
	readonly attachments: AttachmentInfo[];
	private worker: Worker;
	/** One request at a time: each waits for the previous one. */
	private queue: Promise<unknown> = Promise.resolve();

	private constructor(worker: Worker, tracks: SubtitleTrackInfo[], attachments: AttachmentInfo[]) {
		this.worker = worker;
		this.tracks = tracks;
		this.attachments = attachments;
	}

	static async open(file: File): Promise<SubtitleSource> {
		const worker = new Worker(new URL('../workers/subs.worker.ts', import.meta.url), { type: 'module' });
		try {
			const opened = await request(worker, { type: 'open', file });
			if (opened.type !== 'opened') throw new Error('Unexpected answer.');
			return new SubtitleSource(worker, opened.tracks, opened.attachments);
		} catch (error) {
			worker.terminate();
			throw error;
		}
	}

	/** Reads several tracks in one pass over the file; results come in the order asked. */
	async extract(tracks: number[], onProgress: (share: number) => void): Promise<ExtractedTrack[]> {
		const answer = await this.enqueue(async () => request(this.worker, { type: 'extract', tracks }, onProgress));
		if (answer.type !== 'extracted') throw new Error('Unexpected answer.');
		return answer.tracks;
	}

	/** The attached fonts, for the subtitle renderer. */
	async fonts(): Promise<Uint8Array[]> {
		const indices = this.attachments.flatMap((attachment, index) => (isFont(attachment) ? [index] : []));
		if (indices.length === 0) return [];
		const answer = await this.enqueue(async () => request(this.worker, { type: 'attachments', indices }));
		return answer.type === 'attachments' ? answer.files : [];
	}

	close() {
		this.worker.terminate();
	}

	private async enqueue<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task);
		this.queue = next.catch(() => undefined);
		return next;
	}
}

async function request(
	worker: Worker,
	message: SubtitleSourceRequest,
	onProgress?: (share: number) => void,
): Promise<SubtitleSourceResponse> {
	return new Promise((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<SubtitleSourceResponse>) => {
			const answer = event.data;
			if (answer.type === 'progress') {
				onProgress?.(answer.share);
				return;
			}
			if (answer.type === 'error') reject(new Error(answer.message));
			else resolve(answer);
		};
		worker.onerror = () => {
			reject(new Error('The subtitle reader stopped.'));
		};
		worker.postMessage(message);
	});
}
