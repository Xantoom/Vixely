/**
 * Rewrites a Matroska or MP4 file with other subtitle tracks (vixely-subs), in a worker that reads
 * the source in place and hands the new file over a few megabytes at a time: every other track,
 * the fonts and the chapters are copied as they are, nothing is re-encoded.
 */
import type { SaveTarget } from './save-target';

/** The lines of a subtitle track as the container stores them: data of line `k` at `offsets[k]..offsets[k + 1]`. */
export interface StreamData {
	codec: string;
	private: Uint8Array;
	/** Milliseconds. */
	starts: Float64Array;
	/** Milliseconds; NaN for none (PGS). */
	durations: Float64Array;
	offsets: Uint32Array;
	data: Uint8Array;
}

/** What becomes of a track of the source. Unset fields stay as they are. */
export interface TrackChoice {
	number: number;
	keep: boolean;
	language?: string;
	name?: string;
	default?: boolean;
	forced?: boolean;
	/** Index of the stream replacing its lines. */
	stream?: number;
}

export interface AddedTrack {
	stream: number;
	language: string;
	name: string;
	default: boolean;
	forced: boolean;
}

export interface RemuxJob {
	file: File;
	choices: TrackChoice[];
	added: AddedTrack[];
	streams: StreamData[];
}

export type RemuxRequest = { type: 'start'; job: RemuxJob } | { type: 'next' };

export type RemuxResponse =
	| { type: 'planning'; share: number }
	| { type: 'size'; total: number }
	| { type: 'chunk'; data: Uint8Array }
	| { type: 'done' }
	| { type: 'error'; message: string };

/**
 * Writes the new file to `save`. `onProgress` gets the share done, 0 to 1: the layout pass reads
 * the source's structure first (a tenth of the time), then the file is copied.
 */
export async function remux(
	job: RemuxJob,
	save: SaveTarget,
	onProgress: (share: number) => void,
	signal: AbortSignal,
): Promise<void> {
	const worker = new Worker(new URL('../workers/remux.worker.ts', import.meta.url), { type: 'module' });
	try {
		await new Promise<void>((resolve, reject) => {
			let total = 0;
			let written = 0;
			let writing = Promise.resolve();
			signal.addEventListener('abort', () => {
				reject(new DOMException('Stopped.', 'AbortError'));
			});
			worker.onmessage = (event: MessageEvent<RemuxResponse>) => {
				const message = event.data;
				if (message.type === 'planning') {
					onProgress(message.share * 0.1);
				} else if (message.type === 'size') {
					total = message.total;
					worker.postMessage({ type: 'next' } satisfies RemuxRequest);
				} else if (message.type === 'chunk') {
					// One chunk in flight: the next is asked for once this one is on disk.
					writing = writing
						.then(async () => save.append(message.data))
						.then(() => {
							written += message.data.length;
							onProgress(0.1 + 0.9 * (written / Math.max(total, 1)));
							if (!signal.aborted) worker.postMessage({ type: 'next' } satisfies RemuxRequest);
						}, reject);
				} else if (message.type === 'done') {
					writing.then(resolve, reject);
				} else {
					reject(new Error(message.message));
				}
			};
			worker.onerror = () => {
				reject(new Error('The remuxer stopped.'));
			};
			worker.postMessage({ type: 'start', job } satisfies RemuxRequest);
		});
	} finally {
		worker.terminate();
	}
}
