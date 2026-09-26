/**
 * Animated images, off the main thread: reading GIF, APNG and animated WebP frame by frame, and
 * writing GIFs with gifski. Each task gets its own worker, closed when it is done.
 */

export interface EncodeOptions {
	/** GIF through gifski, or lossless APNG. */
	format: 'gif' | 'apng';
	width: number;
	height: number;
	/** Number of frames that will be added. APNG needs it up front. */
	frames: number;
	/** 1 to 100, GIF only. */
	quality: number;
	/** 1 to 100; 100 adds no lossy compression. */
	lossy: number;
	/** −1 plays once, 0 loops forever, n loops n more times. */
	repeat: number;
	/** GIF only: false keeps flat colours, without dithering noise. */
	dither: boolean;
}

export type GifRequest =
	| { type: 'decode'; bytes: ArrayBuffer; format: string }
	| ({ type: 'begin' } & EncodeOptions)
	| { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; pts: number; duration: number }
	| { type: 'finish' }
	| { type: 'webp-still'; id: number; rgba: ArrayBuffer; width: number; height: number }
	| { type: 'trim'; bytes: ArrayBuffer; start: number; end: number; repeat: number };

export type GifResponse =
	| { type: 'size'; width: number; height: number }
	| { type: 'frame'; bitmap: ImageBitmap; delay: number }
	| { type: 'done' }
	| { type: 'gif'; bytes: Uint8Array }
	| { type: 'webp-still'; id: number; bytes: Uint8Array }
	| { type: 'error'; message: string };

function spawn(): Worker {
	return new Worker(new URL('../workers/gif.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Decodes every frame of an animation. Frames arrive one by one as bitmaps with their delay in
 * milliseconds, so the first ones show while the rest decode. Resolves with the canvas size.
 */
export async function decodeAnimation(
	file: File,
	format: string,
	onFrame: (bitmap: ImageBitmap, delay: number) => void,
	signal?: AbortSignal,
): Promise<{ width: number; height: number }> {
	const bytes = await file.arrayBuffer();
	const worker = spawn();
	return new Promise((resolve, reject) => {
		let size = { width: 0, height: 0 };
		const stop = () => {
			worker.terminate();
			reject(new DOMException('Decoding was stopped.', 'AbortError'));
		};
		signal?.addEventListener('abort', stop, { once: true });
		worker.onmessage = (event: MessageEvent<GifResponse>) => {
			const message = event.data;
			if (message.type === 'size') size = { width: message.width, height: message.height };
			else if (message.type === 'frame') onFrame(message.bitmap, message.delay);
			else if (message.type === 'done') {
				signal?.removeEventListener('abort', stop);
				worker.terminate();
				resolve(size);
			} else if (message.type === 'error') {
				worker.terminate();
				reject(new Error(message.message));
			}
		};
		const request: GifRequest = { type: 'decode', bytes, format };
		worker.postMessage(request, [bytes]);
	});
}

/** Writes a GIF with gifski, or an APNG, in a worker. Frames are handed over as they are drawn. */
export class GifEncoder {
	private worker = spawn();
	private result: Promise<Uint8Array>;

	constructor(options: EncodeOptions) {
		this.result = new Promise((resolve, reject) => {
			this.worker.onmessage = (event: MessageEvent<GifResponse>) => {
				const message = event.data;
				if (message.type === 'gif') resolve(message.bytes);
				else if (message.type === 'error') reject(new Error(message.message));
				if (message.type === 'gif' || message.type === 'error') this.worker.terminate();
			};
			this.worker.onerror = () => {
				reject(new Error('The GIF encoder failed.'));
			};
		});
		const begin: GifRequest = { type: 'begin', ...options };
		this.worker.postMessage(begin);
	}

	/** Adds a frame shown from `pts` for `duration` seconds. The pixels are transferred, not copied. */
	addFrame(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, pts: number, duration: number) {
		const request: GifRequest = { type: 'frame', rgba: rgba.buffer, width, height, pts, duration };
		this.worker.postMessage(request, [rgba.buffer]);
	}

	/** Encodes the frames added and resolves with the GIF file. */
	async finish(): Promise<Uint8Array> {
		const request: GifRequest = { type: 'finish' };
		this.worker.postMessage(request);
		return this.result;
	}

	cancel() {
		this.worker.terminate();
	}
}

/** Encodes lossless WebP stills in a worker, for browsers that can't encode WebP themselves. */
export class WebpStillEncoder {
	private worker = spawn();
	private next = 0;
	private pending = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();

	constructor() {
		this.worker.onmessage = (event: MessageEvent<GifResponse>) => {
			const message = event.data;
			if (message.type === 'webp-still') {
				this.pending.get(message.id)?.resolve(message.bytes);
				this.pending.delete(message.id);
			} else if (message.type === 'error') {
				for (const { reject } of this.pending.values()) reject(new Error(message.message));
				this.pending.clear();
			}
		};
	}

	async encode(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<Uint8Array> {
		const id = this.next++;
		const result = new Promise<Uint8Array>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
		const request: GifRequest = { type: 'webp-still', id, rgba: rgba.buffer, width, height };
		this.worker.postMessage(request, [rgba.buffer]);
		return result;
	}

	close() {
		this.worker.terminate();
	}
}

/**
 * Cuts a GIF between two times, in seconds, without re-encoding its frames. See `trim_gif` in
 * vixely-gif.
 */
export async function trimGif(file: File, start: number, end: number, repeat: number): Promise<Uint8Array> {
	const bytes = await file.arrayBuffer();
	const worker = spawn();
	return new Promise((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<GifResponse>) => {
			const message = event.data;
			if (message.type === 'gif') resolve(message.bytes);
			else if (message.type === 'error') reject(new Error(message.message));
			worker.terminate();
		};
		const request: GifRequest = { type: 'trim', bytes, start, end, repeat };
		worker.postMessage(request, [bytes]);
	});
}
