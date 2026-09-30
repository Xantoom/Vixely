import type { ThumbnailMessage, ThumbnailRequest } from './thumbnails-protocol';

/**
 * Pictures along a video, for its timeline. Asked for by time, answered with the key frame at or
 * before each time; pictures are kept, so zooming out and back in shows them at once.
 */
export class Thumbnails {
	/** Told when pictures or key frames arrive: views draw again. */
	readonly listeners = new Set<() => void>();
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
			for (const listener of this.listeners) listener();
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

/** Filmstrips kept, the most recent last: going to another editor and back decodes nothing again. */
const kept: { file: File; height: number; thumbnails: Thumbnails }[] = [];
const KEPT_FILMSTRIPS = 3;

/**
 * The pictures of a video at this height, made once and shared: `onChange` hears of new ones
 * until `release` is called. They stay for the next timeline to show them.
 */
export function sharedThumbnails(
	file: File,
	height: number,
	onChange: () => void,
): { thumbnails: Thumbnails; release: () => void } {
	let entry = kept.find((candidate) => candidate.file === file && candidate.height === height);
	if (entry) kept.splice(kept.indexOf(entry), 1);
	else {
		entry = { file, height, thumbnails: new Thumbnails(file, height) };
		while (kept.length >= KEPT_FILMSTRIPS) kept.shift()?.thumbnails.dispose();
	}
	kept.push(entry);
	const { thumbnails } = entry;
	thumbnails.listeners.add(onChange);
	return {
		thumbnails,
		release: () => {
			thumbnails.listeners.delete(onChange);
		},
	};
}
