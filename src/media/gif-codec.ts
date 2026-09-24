/**
 * Animated images, off the main thread: reading GIF, APNG and animated WebP frame by frame, and
 * writing GIFs with gifski. Each task gets its own worker, closed when it is done.
 */

export interface EncodeOptions {
	/** 1 to 100. */
	quality: number;
	/** 1 to 100; 100 adds no lossy compression. */
	lossy: number;
	/** −1 plays once, 0 loops forever, n loops n more times. */
	repeat: number;
}

export type GifRequest =
	| { type: 'decode'; bytes: ArrayBuffer; format: string }
	| ({ type: 'begin' } & EncodeOptions)
	| { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; pts: number }
	| { type: 'finish' };

export type GifResponse =
	| { type: 'size'; width: number; height: number }
	| { type: 'frame'; bitmap: ImageBitmap; delay: number }
	| { type: 'done' }
	| { type: 'gif'; bytes: Uint8Array }
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

/** Writes a GIF with gifski in a worker. Frames are handed over as they are drawn. */
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

	/** Adds a frame shown from `pts` seconds. The pixels are transferred, not copied. */
	addFrame(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, pts: number) {
		const request: GifRequest = { type: 'frame', rgba: rgba.buffer, width, height, pts };
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
