import { zipSync } from 'fflate';
import {
	BufferTarget,
	CanvasSource,
	canEncodeVideo,
	Mp4OutputFormat,
	Output,
	Quality,
	type VideoCodec,
	WebMOutputFormat,
} from 'mediabunny';
import { effectiveCrop, type Size } from '@/editors/image/document';
import { GifEncoder, trimGif, WebpStillEncoder } from '@/media/gif-codec';
import { assembleWebp, type WebpFrame } from '@/media/webp-animation';
import { FrameComposer } from './compose';
import {
	type FrameLayout,
	frameLayout,
	framesUntouched,
	type GifDoc,
	type OutputFrame,
	outputFrames,
	outputLength,
} from './document';
import type { FrameSource } from './source';
import type { AnimationFormat, GifExportSettings } from './store';

/** File type of each format. APNG keeps the .png extension, which every program opens. */
export const FORMAT_FILES: Record<AnimationFormat, { extension: string; mime: string }> = {
	gif: { extension: 'gif', mime: 'image/gif' },
	apng: { extension: 'png', mime: 'image/apng' },
	webp: { extension: 'webp', mime: 'image/webp' },
	video: { extension: 'mp4', mime: 'video/mp4' },
	frames: { extension: 'zip', mime: 'application/zip' },
};

/**
 * The video codec this browser can write: H.264 in MP4 plays everywhere; VP9 in WebM otherwise.
 * With transparency, only VP9 in WebM keeps it.
 */
export async function videoCodec(width: number, height: number, alpha = false): Promise<VideoCodec | null> {
	if (alpha) return (await canEncodeVideo('vp9', { width, height, alpha: 'keep' })) ? 'vp9' : null;
	if (await canEncodeVideo('avc', { width, height })) return 'avc';
	if (await canEncodeVideo('vp9', { width, height })) return 'vp9';
	return null;
}

/** The frame's size and layout for these settings. */
export function exportLayout(doc: GifDoc, source: Size, settings: Pick<GifExportSettings, 'width' | 'format'>) {
	return frameLayout(doc, source, settings.width, settings.format === 'video');
}

let webpSupport: Promise<boolean> | null = null;

/** Whether the browser encodes WebP itself (Chrome, Edge, Firefox). Safari doesn't. */
export async function browserEncodesWebp(): Promise<boolean> {
	webpSupport ??= (async () => {
		const canvas = new OffscreenCanvas(1, 1);
		// A canvas can only be encoded once it has a drawing context.
		canvas.getContext('2d');
		const blob = await canvas.convertToBlob({ type: 'image/webp' });
		return blob.type === 'image/webp';
	})().catch(() => false);
	return webpSupport;
}

/**
 * Why the GIF's own frames can't be kept, or null when they can. Only cutting and the loop count
 * leave the frames as they are; everything else redraws them.
 */
export function copyBlocker(
	doc: GifDoc,
	settings: GifExportSettings,
	source: FrameSource,
	isGif: boolean,
): 'frames' | 'source' | null {
	if (!isGif || !source.timing) return 'source';
	const resized = settings.width !== null && settings.width < source.width;
	if (doc.speed !== 1 || doc.direction !== 'forward' || doc.fps !== null || !framesUntouched(doc) || resized)
		return 'frames';
	return null;
}

export interface ExportGifOptions {
	/** The file itself, for exports that keep its frames. */
	file: File;
	/** Whether the file is a GIF, whose frames can be copied. */
	isGif: boolean;
	source: FrameSource;
	doc: GifDoc;
	settings: GifExportSettings;
	signal: AbortSignal;
	/** Share of the frames prepared, then null while the encoder finishes. */
	onProgress: (fraction: number | null) => void;
}

function stopped(): DOMException {
	return new DOMException('The export was stopped.', 'AbortError');
}

/**
 * Draws every output frame, in order, through the same composer as the preview, and hands its
 * pixels to `add`.
 */
async function drawFrames(
	{ source, doc, signal, onProgress }: ExportGifOptions,
	frames: readonly OutputFrame[],
	layout: FrameLayout,
	add: (image: ImageData, frame: OutputFrame) => Promise<void> | void,
) {
	const composer = new FrameComposer();
	const canvas = new OffscreenCanvas(layout.width, layout.height);
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('No 2D canvas.');
	const crop = effectiveCrop(doc.picture, source);
	const length = outputLength(frames);
	// The source is read no larger than the picture's place in the frame needs.
	const scale = Math.max(layout.content.width / crop.width, layout.content.height / crop.height);
	let index = 0;
	try {
		for await (const picture of source.render(
			frames.map((frame) => frame.source),
			scale,
		)) {
			if (signal.aborted) throw stopped();
			const frame = frames[index];
			if (frame) {
				composer.draw(context, picture, source, doc, layout, { time: frame.start, length });
				// Frames are drawn and encoded in order; each waits for the previous one.
				// oxlint-disable-next-line no-await-in-loop
				await add(context.getImageData(0, 0, layout.width, layout.height), frame);
			}
			index += 1;
			onProgress(index / frames.length);
		}
	} finally {
		composer.dispose();
	}
}

/**
 * GIF through gifski (palettes across frames, temporal dithering) or lossless APNG, in a worker.
 */
async function exportPalette(options: ExportGifOptions, frames: readonly OutputFrame[], format: 'gif' | 'apng') {
	const { source, doc, settings, signal } = options;
	const layout = exportLayout(doc, source, settings);
	const size = { width: layout.width, height: layout.height };
	const encoder = new GifEncoder({
		format,
		...size,
		frames: frames.length,
		quality: settings.quality,
		lossy: Math.max(1, 100 - settings.compression),
		repeat: settings.repeat,
		dither: settings.dither,
	});
	const stop = () => {
		encoder.cancel();
	};
	signal.addEventListener('abort', stop, { once: true });
	try {
		await drawFrames(options, frames, layout, (image, frame) => {
			encoder.addFrame(image.data, size.width, size.height, frame.start, frame.duration);
		});
		options.onProgress(null);
		const bytes = await encoder.finish();
		if (signal.aborted) throw stopped();
		return new Blob([bytes.slice()], { type: FORMAT_FILES[format].mime });
	} finally {
		signal.removeEventListener('abort', stop);
	}
}

/**
 * Animated WebP: each frame is compressed by the browser's own lossy encoder (or losslessly in
 * a worker where there is none), then the frames are wrapped into one animation.
 */
async function exportWebp(options: ExportGifOptions, frames: readonly OutputFrame[]) {
	const { source, doc, settings } = options;
	const layout = exportLayout(doc, source, settings);
	const size = { width: layout.width, height: layout.height };
	const lossy = await browserEncodesWebp();
	const canvas = new OffscreenCanvas(size.width, size.height);
	const context = canvas.getContext('2d');
	const fallback = lossy ? null : new WebpStillEncoder();
	const stills: WebpFrame[] = [];
	try {
		await drawFrames(options, frames, layout, async (image, frame) => {
			let still: Uint8Array;
			if (fallback) {
				still = await fallback.encode(image.data, size.width, size.height);
			} else {
				context?.putImageData(image, 0, 0);
				const blob = await canvas.convertToBlob({ type: 'image/webp', quality: settings.quality / 100 });
				still = new Uint8Array(await blob.arrayBuffer());
			}
			stills.push({ still, duration: frame.duration * 1000 });
		});
	} finally {
		fallback?.close();
	}
	options.onProgress(null);
	const bytes = assembleWebp(stills, size.width, size.height, settings.repeat);
	return new Blob([bytes.slice()], { type: 'image/webp' });
}

/**
 * A short video: H.264 in MP4 where the browser encodes it, VP9 in WebM otherwise. Frames keep
 * their own durations, so a GIF's rhythm survives. With `alpha`, a WebM that keeps transparency.
 */
async function exportVideo(options: ExportGifOptions, frames: readonly OutputFrame[]) {
	const { source, doc, settings } = options;
	const layout = exportLayout(doc, source, settings);
	const size = { width: layout.width, height: layout.height };
	const codec = await videoCodec(size.width, size.height, settings.alpha);
	if (!codec) throw new Error('This browser has no video encoder.');
	const canvas = new OffscreenCanvas(size.width, size.height);
	const context = canvas.getContext('2d');
	const target = new BufferTarget();
	const output = new Output({
		format: codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
		target,
	});
	const video = new CanvasSource(canvas, {
		codec,
		quality: new Quality(settings.quality / 100),
		...(settings.alpha && { alpha: 'keep' as const }),
	});
	output.addVideoTrack(video);
	await output.start();
	try {
		await drawFrames(options, frames, layout, async (image, frame) => {
			if (!context) return;
			context.putImageData(image, 0, 0);
			if (!settings.alpha) {
				// Without transparency, transparent areas show white, as on most pages.
				context.globalCompositeOperation = 'destination-over';
				context.fillStyle = '#fff';
				context.fillRect(0, 0, size.width, size.height);
				context.globalCompositeOperation = 'source-over';
			}
			await video.add(frame.start, frame.duration);
		});
		options.onProgress(null);
		await output.finalize();
	} catch (error) {
		await output.cancel();
		throw error;
	}
	const buffer = target.buffer;
	if (!buffer) throw new Error('The video is empty.');
	return new Blob([buffer], { type: codec === 'avc' ? 'video/mp4' : 'video/webm' });
}

/** Every frame as a PNG, numbered in order, in one ZIP; the delays go in a text file beside them. */
async function exportFrames(options: ExportGifOptions, frames: readonly OutputFrame[]) {
	const { source, doc, settings } = options;
	const layout = exportLayout(doc, source, settings);
	const canvas = new OffscreenCanvas(layout.width, layout.height);
	const context = canvas.getContext('2d');
	const files: Record<string, Uint8Array> = {};
	const digits = String(frames.length).length;
	const delays: string[] = [];
	let index = 0;
	await drawFrames(options, frames, layout, async (image, frame) => {
		context?.putImageData(image, 0, 0);
		const blob = await canvas.convertToBlob({ type: 'image/png' });
		index += 1;
		const name = `frame-${String(index).padStart(digits, '0')}.png`;
		files[name] = new Uint8Array(await blob.arrayBuffer());
		delays.push(`${name}\t${Math.round(frame.duration * 1000)} ms`);
	});
	options.onProgress(null);
	files['delays.txt'] = new TextEncoder().encode(`${delays.join('\n')}\n`);
	// PNGs are already compressed: stored as they are.
	const bytes = zipSync(files, { level: 0 });
	return new Blob([bytes.slice()], { type: 'application/zip' });
}

/**
 * Makes the animation in the chosen format. Every output frame is drawn cropped and resized, in
 * order: the same list the preview plays, so what is seen is what is saved.
 */
export async function exportGif(options: ExportGifOptions): Promise<Blob> {
	const { doc, settings, source, file, isGif } = options;
	if (settings.mode === 'copy' && copyBlocker(doc, settings, source, isGif) === null) {
		options.onProgress(null);
		const bytes = await trimGif(file, doc.trim.start, doc.trim.end, settings.repeat);
		return new Blob([bytes.slice()], { type: 'image/gif' });
	}
	const frames = outputFrames(options.doc, options.source.timing);
	const format = options.settings.format;
	if (format === 'webp') return exportWebp(options, frames);
	if (format === 'video') return exportVideo(options, frames);
	if (format === 'frames') return exportFrames(options, frames);
	return exportPalette(options, frames, format);
}

/** Tries at most this many widths before giving up on a size limit. */
const FIT_ATTEMPTS = 6;
/** Narrowest width tried to meet a size limit. */
const FIT_MIN_WIDTH = 120;

export interface FittedExport {
	blob: Blob;
	/** The width used when it had to shrink to meet the size limit, else null. */
	fittedWidth: number | null;
	/** False when even the narrowest width tried is too heavy. */
	fits: boolean;
}

/**
 * Exports, then, if the file is over the size limit, again at a smaller width until it fits.
 * Size grows roughly with the number of pixels, so each attempt scales the width by the square
 * root of how much too heavy the last one was, with a little margin.
 */
export async function exportWithinLimit(
	options: ExportGifOptions,
	onRetry: (width: number) => void,
): Promise<FittedExport> {
	const { settings, source, doc } = options;
	const limit = settings.maxBytes;
	let blob = await exportGif(options);
	const copying = settings.mode === 'copy' && copyBlocker(doc, settings, source, options.isGif) === null;
	if (limit === null || copying || blob.size <= limit) return { blob, fittedWidth: null, fits: true };
	let width = exportLayout(doc, source, settings).width;
	for (let attempt = 1; attempt < FIT_ATTEMPTS && width > FIT_MIN_WIDTH; attempt++) {
		width = Math.max(FIT_MIN_WIDTH, Math.floor(width * Math.sqrt(limit / blob.size) * 0.92));
		onRetry(width);
		// Attempts depend on each other: each width comes from the last size.
		// oxlint-disable-next-line no-await-in-loop
		blob = await exportGif({ ...options, settings: { ...settings, width } });
		if (blob.size <= limit) return { blob, fittedWidth: width, fits: true };
	}
	return { blob, fittedWidth: width, fits: false };
}
