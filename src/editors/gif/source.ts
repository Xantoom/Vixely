import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import { canDecode } from '@/media/decoders';
import { decodeAnimation } from '@/media/gif-codec';
import { decodeStill } from '@/media/probe';
import type { SourceTiming } from './document';

/**
 * Where the pictures of an animation come from: the frames of a GIF held in memory, or a video
 * read on demand. The editor asks for the picture at a source time and never cares which.
 */
export interface FrameSource {
	width: number;
	height: number;
	duration: number;
	/** When each frame of an animation starts and how long it shows; null for a video. */
	timing: SourceTiming[] | null;
	/** Frame rate of a video, or null. */
	fps: number | null;
	/** The picture at a source time if it is ready now, to draw during playback. */
	peek: (time: number) => CanvasImageSource | null;
	/** The picture at a source time, read if needed. */
	fetch: (time: number) => Promise<CanvasImageSource | null>;
	/** Reads pictures ahead of playback, in order. A new call replaces the previous one. */
	prefetch: (times: readonly number[]) => void;
	/**
	 * The picture at each time, in order, at least `scale` times the source's size (a video is
	 * decoded no larger than needed). Valid until the next one is asked for.
	 */
	render: (times: readonly number[], scale: number) => AsyncGenerator<TexImageSource & CanvasImageSource>;
	/** Made of frames held in memory (an animation, or still images): more images can follow. */
	addImages?: (images: readonly StillImage[]) => Promise<FrameSource>;
	dispose: () => void;
}

/** A still image to make an animation from. */
export interface StillImage {
	file: File;
	format: string;
}

interface Frame extends SourceTiming {
	bitmap: ImageBitmap;
}

/** Index of the frame showing at a time, by binary search. */
function frameIndex(frames: readonly SourceTiming[], time: number): number {
	let low = 0;
	let high = frames.length - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if ((frames[middle]?.start ?? 0) <= time) low = middle;
		else high = middle - 1;
	}
	return low;
}

/**
 * Delays as browsers play them: 10 ms or less shows as 100 ms in any format, and a GIF's 10 ms
 * steps make that anything under 20 ms (gifski's output too, so the preview does the same). An
 * APNG or WebP keeps its finer delays: 17 ms stays 17 ms.
 */
function effectiveDelay(milliseconds: number, format: 'gif' | 'webp' | 'apng'): number {
	const fastest = format === 'gif' ? 20 : 11;
	return (milliseconds < fastest ? 100 : milliseconds) / 1000;
}

/**
 * Decodes a GIF, APNG or animated WebP. `onProgress` receives the source so far, so the first
 * frames show while the rest decode.
 */
export async function openAnimation(
	file: File,
	format: string,
	onProgress: (frames: number) => void,
	signal: AbortSignal,
): Promise<FrameSource> {
	const frames: Frame[] = [];
	let clock = 0;
	const kind = format === 'gif' ? 'gif' : format === 'webp' ? 'webp' : 'apng';
	const { width, height } = await decodeAnimation(
		file,
		kind,
		(bitmap, delay) => {
			const duration = effectiveDelay(delay, kind);
			frames.push({ bitmap, start: clock, duration });
			clock += duration;
			onProgress(frames.length);
		},
		signal,
	);
	return framesSource(frames, width, height);
}

/** Pictures decoded forward at a time when a video is read backwards: a few seconds of it. */
const REVERSE_BLOCK = 48;

/** Longest side of the pictures kept for the preview of a video. The export reads at full size. */
const PREVIEW_SIZE = 960;
/** Preview pictures kept in memory, at most: about 20 seconds at 30 fps. */
const CACHE_LIMIT = 600;

/**
 * Bytes the preview pictures may take: a share of the device's memory where the browser tells it
 * (Chromium), between 256 and 512 MB. At 960 × 540 that is 120 to 240 pictures.
 */
function cacheBudget(): number {
	const gigabytes = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
	return Math.min(512, Math.max(256, gigabytes * 64)) * 1024 * 1024;
}

function key(time: number): number {
	return Math.round(time * 1000);
}

/** Opens the video track of a file. Pictures are read on demand and the preview's are kept. */
export async function openVideo(file: File, fps: number | null): Promise<FrameSource> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const track: InputVideoTrack | null = await input.getPrimaryVideoTrack();
	if (!track || !(await canDecode(track))) throw new Error('No video track.');
	const [duration, start, width, height] = await Promise.all([
		input.computeDuration(),
		track.getFirstTimestamp(),
		track.getDisplayWidth(),
		track.getDisplayHeight(),
	]);
	const scale = Math.min(1, PREVIEW_SIZE / Math.max(width, height));
	const preview = new CanvasSink(track, { width: Math.round(width * scale), poolSize: 0 });
	const cache = new Map<number, ImageBitmap>();
	const pictureBytes = Math.max(1, Math.round(width * scale) * Math.round(height * scale) * 4);
	const limit = Math.max(30, Math.min(CACHE_LIMIT, Math.floor(cacheBudget() / pictureBytes)));
	let prefetchRun = 0;

	const remember = async (time: number, canvas: HTMLCanvasElement | OffscreenCanvas) => {
		const bitmap = await createImageBitmap(canvas);
		cache.get(key(time))?.close();
		cache.set(key(time), bitmap);
		// Oldest pictures go first when the cache is full.
		while (cache.size > limit) {
			const [oldest, picture] = cache.entries().next().value ?? [];
			if (oldest === undefined) break;
			picture?.close();
			cache.delete(oldest);
		}
		return bitmap;
	};

	const source: FrameSource = {
		width,
		height,
		duration,
		timing: null,
		fps,
		peek: (time) => cache.get(key(time)) ?? null,
		async fetch(time) {
			const cached = cache.get(key(time));
			if (cached) return cached;
			const frame = await preview.getCanvas(Math.max(start, time));
			return frame ? remember(time, frame.canvas) : null;
		},
		prefetch(times) {
			prefetchRun += 1;
			const run = prefetchRun;
			// No more than the cache holds: reading further would push out the first ones before they show.
			const missing = [...new Set(times.slice(0, limit).map(key))]
				.filter((time) => !cache.has(time))
				.toSorted((a, b) => a - b);
			if (missing.length === 0) return;
			void (async () => {
				const wanted = missing.map((time) => Math.max(start, time / 1000));
				let index = 0;
				for await (const frame of preview.canvasesAtTimestamps(wanted)) {
					if (run !== prefetchRun) return;
					const time = missing[index] ?? 0;
					index += 1;
					// oxlint-disable-next-line no-await-in-loop
					if (frame) await remember(time / 1000, frame.canvas);
				}
			})().catch(() => undefined);
		},
		async *render(times, scale) {
			// Decoded no larger than the output needs: a 4K video made into a small GIF stays light.
			const factor = Math.min(1, scale);
			const sink = new CanvasSink(track, {
				width: Math.max(2, Math.round(width * factor)),
				height: Math.max(2, Math.round(height * factor)),
				fit: 'fill',
				poolSize: 2,
			});
			const wanted = times.map((time) => Math.max(start, time));
			if (wanted.every((time, index) => index === 0 || time >= (wanted[index - 1] ?? 0))) {
				for await (const frame of sink.canvasesAtTimestamps(wanted)) {
					if (frame) yield frame.canvas;
				}
				return;
			}
			// Backwards (reverse, back and forth): each time going back would decode again from the
			// key frame before it. Blocks of pictures are decoded forward, then given in the order asked.
			for (let from = 0; from < wanted.length; from += REVERSE_BLOCK) {
				const block = wanted.slice(from, from + REVERSE_BLOCK);
				const forward = [...new Set(block)].toSorted((a, b) => a - b);
				const pictures = new Map<number, ImageBitmap>();
				try {
					let index = 0;
					// oxlint-disable-next-line no-await-in-loop -- one block after the other, in order
					for await (const frame of sink.canvasesAtTimestamps(forward)) {
						const time = forward[index] ?? 0;
						index += 1;
						// oxlint-disable-next-line no-await-in-loop -- the sink reuses its canvases
						if (frame) pictures.set(time, await createImageBitmap(frame.canvas));
					}
					for (const time of block) {
						const picture = pictures.get(time);
						if (picture) yield picture;
					}
				} finally {
					for (const picture of pictures.values()) picture.close();
				}
			}
		},
		dispose() {
			prefetchRun += 1;
			for (const bitmap of cache.values()) bitmap.close();
			cache.clear();
			input.dispose();
		},
	};
	return source;
}

/** How long each image of an animation made from images shows at first, in seconds. */
const IMAGE_DELAY = 0.5;
/** Longest side of an animation made from images: larger photos are scaled down to it. */
const IMAGES_SIZE = 1920;

/** A still image drawn whole and centred in a frame of the given size; transparent around it. */
async function fitImage(image: StillImage, width: number, height: number): Promise<ImageBitmap | null> {
	const decoded = await decodeStill(image.file, image.format).catch(() => null);
	if (!decoded) return null;
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) return null;
	const scale = Math.min(width / decoded.width, height / decoded.height);
	const drawn = { width: decoded.width * scale, height: decoded.height * scale };
	context.imageSmoothingQuality = 'high';
	context.drawImage(decoded, (width - drawn.width) / 2, (height - drawn.height) / 2, drawn.width, drawn.height);
	decoded.close();
	return createImageBitmap(canvas);
}

/**
 * Makes an animation from still images, one frame each, in the given order. The frame takes the
 * first image's shape; the others are fitted whole inside it.
 */
export async function openImages(
	images: readonly StillImage[],
	onProgress: (count: number) => void,
): Promise<FrameSource> {
	const [first] = images;
	const lead = first ? await decodeStill(first.file, first.format).catch(() => null) : null;
	if (!lead) throw new Error('No image could be read.');
	const scale = Math.min(1, IMAGES_SIZE / Math.max(lead.width, lead.height));
	const width = Math.max(1, Math.round(lead.width * scale));
	const height = Math.max(1, Math.round(lead.height * scale));
	lead.close();
	const bitmaps: ImageBitmap[] = [];
	for (const image of images) {
		// One by one: a few dozen photos decoded at once would not fit in memory.
		// oxlint-disable-next-line no-await-in-loop
		const bitmap = await fitImage(image, width, height);
		if (bitmap) bitmaps.push(bitmap);
		onProgress(bitmaps.length);
	}
	return framesSource(
		bitmaps.map((bitmap, index) => ({ bitmap, start: index * IMAGE_DELAY, duration: IMAGE_DELAY })),
		width,
		height,
	);
}

/** Frames held in memory, played at their own times. Images added follow the last one. */
function framesSource(frames: Frame[], width: number, height: number): FrameSource {
	const at = (time: number) => frames[frameIndex(frames, time)]?.bitmap ?? null;
	const last = frames.at(-1);
	const duration = last ? last.start + last.duration : 0;
	const source: FrameSource = {
		width,
		height,
		duration,
		timing: frames.map(({ start, duration }) => ({ start, duration })),
		fps: null,
		peek: at,
		fetch: async (time) => Promise.resolve(at(time)),
		prefetch: () => {},
		// The frames are already in memory; the method is asynchronous for video sources.
		// oxlint-disable-next-line require-await
		async *render(times) {
			for (const time of times) {
				const picture = at(time);
				if (picture) yield picture;
			}
		},
		async addImages(images) {
			const added: Frame[] = [];
			let clock = duration;
			for (const image of images) {
				// oxlint-disable-next-line no-await-in-loop
				const bitmap = await fitImage(image, width, height);
				if (!bitmap) continue;
				added.push({ bitmap, start: clock, duration: IMAGE_DELAY });
				clock += IMAGE_DELAY;
			}
			// The pictures move to the new source, which frees them: this one no longer does.
			source.dispose = () => {};
			return framesSource([...frames, ...added], width, height);
		},
		dispose: () => {
			for (const frame of frames) frame.bitmap.close();
		},
	};
	return source;
}
