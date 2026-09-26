import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import { decodeAnimation } from '@/media/gif-codec';
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
	dispose: () => void;
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
