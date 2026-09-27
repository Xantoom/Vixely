import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
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
	/** Made of still images: more can be added at the end. */
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

/** Browsers show delays under 20 ms as 100 ms; so does gifski's output, so the preview does too. */
function effectiveDelay(milliseconds: number): number {
	return (milliseconds < 20 ? 100 : milliseconds) / 1000;
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
	const { width, height } = await decodeAnimation(
		file,
		format === 'gif' ? 'gif' : format === 'webp' ? 'webp' : 'apng',
		(bitmap, delay) => {
			const duration = effectiveDelay(delay);
			frames.push({ bitmap, start: clock, duration });
			clock += duration;
			onProgress(frames.length);
		},
		signal,
	);
	const at = (time: number) => frames[frameIndex(frames, time)]?.bitmap ?? null;
	return {
		width,
		height,
		duration: clock,
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
		dispose: () => {
			for (const frame of frames) frame.bitmap.close();
		},
	};
}

/** Longest side of the pictures kept for the preview of a video. The export reads at full size. */
const PREVIEW_SIZE = 960;
/** Preview pictures kept in memory: about 20 seconds at 30 fps. */
const CACHE_LIMIT = 600;

function key(time: number): number {
	return Math.round(time * 1000);
}

/** Opens the video track of a file. Pictures are read on demand and the preview's are kept. */
export async function openVideo(file: File, fps: number | null): Promise<FrameSource> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const track: InputVideoTrack | null = await input.getPrimaryVideoTrack();
	if (!track) throw new Error('No video track.');
	const [duration, start, width, height] = await Promise.all([
		input.computeDuration(),
		track.getFirstTimestamp(),
		track.getDisplayWidth(),
		track.getDisplayHeight(),
	]);
	const scale = Math.min(1, PREVIEW_SIZE / Math.max(width, height));
	const preview = new CanvasSink(track, { width: Math.round(width * scale), poolSize: 0 });
	const cache = new Map<number, ImageBitmap>();
	let prefetchRun = 0;

	const remember = async (time: number, canvas: HTMLCanvasElement | OffscreenCanvas) => {
		const bitmap = await createImageBitmap(canvas);
		cache.get(key(time))?.close();
		cache.set(key(time), bitmap);
		// Oldest pictures go first when the cache is full.
		while (cache.size > CACHE_LIMIT) {
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
			const missing = [...new Set(times.map(key))].filter((time) => !cache.has(time)).toSorted((a, b) => a - b);
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
			for await (const frame of sink.canvasesAtTimestamps(times.map((time) => Math.max(start, time)))) {
				if (frame) yield frame.canvas;
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
export const IMAGE_DELAY = 0.5;
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
	return imagesSource(bitmaps, width, height);
}

function imagesSource(bitmaps: ImageBitmap[], width: number, height: number): FrameSource {
	const at = (time: number) =>
		bitmaps[Math.min(bitmaps.length - 1, Math.max(0, Math.floor(time / IMAGE_DELAY + 1e-6)))] ?? null;
	const source: FrameSource = {
		width,
		height,
		duration: bitmaps.length * IMAGE_DELAY,
		timing: bitmaps.map((_, index) => ({ start: index * IMAGE_DELAY, duration: IMAGE_DELAY })),
		fps: null,
		peek: at,
		fetch: async (time) => Promise.resolve(at(time)),
		prefetch: () => {},
		// oxlint-disable-next-line require-await
		async *render(times) {
			for (const time of times) {
				const picture = at(time);
				if (picture) yield picture;
			}
		},
		async addImages(images) {
			const added: ImageBitmap[] = [];
			for (const image of images) {
				// oxlint-disable-next-line no-await-in-loop
				const bitmap = await fitImage(image, width, height);
				if (bitmap) added.push(bitmap);
			}
			// The pictures move to the new source, which frees them: this one no longer does.
			source.dispose = () => {};
			return imagesSource([...bitmaps, ...added], width, height);
		},
		dispose: () => {
			for (const bitmap of bitmaps) bitmap.close();
		},
	};
	return source;
}
