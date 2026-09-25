import type { ThumbnailMessage, ThumbnailRequest } from './thumbnails-protocol';

/**
 * Pictures along a video, for its timeline. Asked for by time, answered with the key frame at or
 * before each time; pictures are kept, so zooming out and back in shows them at once.
 */
export class Thumbnails {
	/** Called when pictures or key frames arrive: views draw again. */
	onChange: () => void = () => {};
	failed = false;

	private worker: Worker;
	private pictures = new Map<number, ImageBitmap>();
	/** Key frame shown at each time asked for. */
	private keyOf = new Map<number, number>();
	private generation = 0;
	private asked = '';

	constructor(file: File, height: number) {
		this.worker = new Worker(new URL('../workers/thumbnails.worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (event: MessageEvent<ThumbnailMessage>) => {
			const message = event.data;
			if (message.type === 'failed') this.failed = true;
			else if (message.type === 'keys') {
				message.times.forEach((time, index) => {
					const key = message.keys[index];
					if (key !== undefined) this.keyOf.set(time, key);
				});
			} else this.pictures.set(message.key, message.bitmap);
			this.onChange();
		};
		this.post({ type: 'open', file, height });
	}

	/** Asks for pictures at these times; times already answered cost nothing. */
	want(times: number[]) {
		const missing = times.filter((time) => !this.keyOf.has(time) || !this.picture(time));
		const asked = missing.join();
		if (missing.length === 0 || asked === this.asked) return;
		this.asked = asked;
		this.generation += 1;
		this.post({ type: 'want', generation: this.generation, times: missing });
	}

	/** The picture shown at a time asked for, once it arrived. */
	picture(time: number): ImageBitmap | null {
		const key = this.keyOf.get(time);
		return key === undefined ? null : (this.pictures.get(key) ?? null);
	}

	dispose() {
		this.worker.terminate();
		for (const bitmap of this.pictures.values()) bitmap.close();
		this.pictures.clear();
	}

	private post(message: ThumbnailRequest) {
		this.worker.postMessage(message);
	}
}
