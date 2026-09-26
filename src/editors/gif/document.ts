import type { Range } from '@/document/timemap';
import {
	createImageDoc,
	effectiveCrop,
	type ImageDoc,
	isAdjusted,
	type Rect,
	type Size,
} from '@/editors/image/document';

export type Direction = 'forward' | 'reverse' | 'pingpong';

/**
 * The edits of an animation, made from a GIF, an animated image or a video. The source is never
 * modified; the document says which part plays, how fast, in which direction and at what rate.
 */
export interface GifDoc {
	/** Length of the source, in seconds. */
	duration: number;
	/** Part of the source used, in source seconds. */
	trim: Range;
	/** Playback speed: 2 plays twice as fast. */
	speed: number;
	direction: Direction;
	/** Frames per second of the output; null keeps the source's own frames and timing. */
	fps: number | null;
	/**
	 * What happens to every picture, as in the image editor: crop, turns, mirrors, colours, text
	 * and stickers. Its crop is in source pixels once turned.
	 */
	picture: ImageDoc;
	/** Frames left out, by the source time they show, in whole milliseconds. */
	removed: number[];
	/** Keeps one frame in `skip`, each shown as long as the ones it replaces: 1 keeps them all. */
	skip: number;
	fade: Fade;
	/** Bands around the picture to reach a shape (a square for a sticker); null for none. */
	bands: Bands | null;
}

export type FadeColor = 'black' | 'white' | 'transparent';

export interface Fade {
	/** Seconds of the output fading in from the colour, and out to it. */
	in: number;
	out: number;
	color: FadeColor;
}

export interface Bands {
	/** Width over height of the whole frame. */
	ratio: number;
	/** Their colour; null leaves them transparent. */
	color: string | null;
}

export const NO_FADE: Fade = { in: 0, out: 0, color: 'black' };

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * Frame rates a GIF can hold. Delays are counted in hundredths of a second and browsers slow down
 * anything faster than 50 fps, so 50 is the ceiling.
 */
export const FRAME_RATES = [10, 12, 15, 20, 25, 30, 50];

/** Shortest animation kept, in seconds. */
export const MIN_LENGTH = 0.1;

export function createGifDoc(duration: number, fps: number | null): GifDoc {
	return {
		duration,
		trim: { start: 0, end: duration },
		speed: 1,
		direction: 'forward',
		fps,
		picture: createImageDoc(),
		removed: [],
		skip: 1,
		fade: NO_FADE,
		bands: null,
	};
}

/** The source time of a frame as kept in `removed`. */
export function frameKey(source: number): number {
	return Math.round(source * 1000);
}

/** Whether every frame is still the source's own, pixel for pixel, as the GIF copy needs. */
export function framesUntouched(doc: GifDoc): boolean {
	const { picture } = doc;
	return (
		picture.crop === null &&
		picture.rotation === 0 &&
		!picture.flipX &&
		!picture.flipY &&
		!isAdjusted(picture.adjust) &&
		picture.overlays.length === 0 &&
		doc.removed.length === 0 &&
		doc.skip === 1 &&
		doc.fade.in === 0 &&
		doc.fade.out === 0 &&
		doc.bands === null
	);
}

/** How much of the fade colour covers the output at a time: 0 none, 1 all. */
export function fadeAmount(fade: Fade, time: number, length: number): number {
	const fadeIn = fade.in > 0 ? 1 - Math.min(1, time / fade.in) : 0;
	const fadeOut = fade.out > 0 ? 1 - Math.min(1, (length - time) / fade.out) : 0;
	return Math.max(0, Math.min(1, Math.max(fadeIn, fadeOut)));
}

/** Where the picture sits in the frame: the whole frame, and the picture's box inside it. */
export interface FrameLayout {
	width: number;
	height: number;
	content: Rect;
}

/**
 * The frame's size and where the picture goes: the crop, turned, then widened or heightened by
 * the bands to their shape, scaled to `width` (never enlarged). Video encoders need even sizes.
 */
export function frameLayout(doc: GifDoc, source: Size, width: number | null, even = false): FrameLayout {
	const crop = effectiveCrop(doc.picture, source);
	let natural: Size = { width: crop.width, height: crop.height };
	if (doc.bands) {
		const ratio = doc.bands.ratio;
		natural =
			crop.width / crop.height > ratio
				? { width: crop.width, height: crop.width / ratio }
				: { width: crop.height * ratio, height: crop.height };
	}
	const scale = Math.min(1, (width ?? natural.width) / natural.width);
	let outWidth = Math.max(1, Math.round(natural.width * scale));
	let outHeight = Math.max(1, Math.round(natural.height * scale));
	if (even) {
		outWidth = Math.max(2, outWidth - (outWidth % 2));
		outHeight = Math.max(2, outHeight - (outHeight % 2));
	}
	const k = outWidth / natural.width;
	const contentWidth = Math.min(outWidth, Math.round(crop.width * k));
	const contentHeight = Math.min(outHeight, Math.round(crop.height * k));
	return {
		width: outWidth,
		height: outHeight,
		content: {
			x: Math.round((outWidth - contentWidth) / 2),
			y: Math.round((outHeight - contentHeight) / 2),
			width: contentWidth,
			height: contentHeight,
		},
	};
}

export function setTrim(doc: GifDoc, trim: Range): GifDoc {
	const start = Math.min(Math.max(0, trim.start), doc.duration - MIN_LENGTH);
	const end = Math.min(doc.duration, Math.max(start + MIN_LENGTH, trim.end));
	return { ...doc, trim: { start, end } };
}

/** A frame of the output: which source moment it shows, and when and how long it plays. */
export interface OutputFrame {
	/** Source time shown, in seconds. */
	source: number;
	/** Output time at which it starts, in seconds. */
	start: number;
	duration: number;
}

/** Timing of a source made of frames (GIF, APNG, WebP): when each frame starts and how long it shows. */
export interface SourceTiming {
	start: number;
	duration: number;
}

/** The frames played forward over the trim, before direction is applied. */
function forwardFrames(doc: GifDoc, timing: readonly SourceTiming[] | null): { source: number; duration: number }[] {
	const { start, end } = doc.trim;
	if (doc.fps === null && timing) {
		// The source's own frames: each keeps its delay, shortened at the trim edges, then sped up.
		return timing
			.filter((frame) => frame.start + frame.duration > start && frame.start < end)
			.map((frame) => {
				const from = Math.max(frame.start, start);
				const to = Math.min(frame.start + frame.duration, end);
				return { source: from, duration: (to - from) / doc.speed };
			})
			.filter((frame) => frame.duration > 1e-6);
	}
	const fps = doc.fps ?? 20;
	const length = (end - start) / doc.speed;
	const count = Math.max(1, Math.round(length * fps));
	return Array.from({ length: count }, (_, k) => ({
		source: start + (k / fps) * doc.speed,
		duration: Math.min(1 / fps, length - k / fps),
	})).filter((frame) => frame.duration > 1e-6);
}

/**
 * The frames of the output, in order. Preview and export both play this list, so what is seen is
 * what is saved. Reverse plays the frames backwards; back-and-forth plays them forward then
 * backward, without repeating the frames at either end.
 */
export function outputFrames(doc: GifDoc, timing: readonly SourceTiming[] | null): OutputFrame[] {
	const removed = new Set(doc.removed);
	const kept = forwardFrames(doc, timing).filter((frame) => !removed.has(frameKey(frame.source)));
	// One frame in `skip`, lasting as long as the frames it stands for.
	const forward =
		doc.skip > 1
			? kept
					.filter((_, index) => index % doc.skip === 0)
					.map((frame, index) => ({
						source: frame.source,
						duration: kept
							.slice(index * doc.skip, (index + 1) * doc.skip)
							.reduce((sum, next) => sum + next.duration, 0),
					}))
			: kept;
	let ordered = forward;
	if (doc.direction === 'reverse') ordered = forward.toReversed();
	else if (doc.direction === 'pingpong') ordered = [...forward, ...forward.slice(1, -1).toReversed()];
	let clock = 0;
	return ordered.map((frame) => {
		const output = { source: frame.source, start: clock, duration: frame.duration };
		clock += frame.duration;
		return output;
	});
}

export function outputLength(frames: readonly OutputFrame[]): number {
	const last = frames.at(-1);
	return last ? last.start + last.duration : 0;
}

/** The output frame playing at an output time. */
export function frameAt(frames: readonly OutputFrame[], time: number): OutputFrame | null {
	let low = 0;
	let high = frames.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		const frame = frames[middle];
		if (!frame) break;
		if (time < frame.start) high = middle - 1;
		else if (time >= frame.start + frame.duration) low = middle + 1;
		else return frame;
	}
	return frames.at(time <= 0 ? 0 : -1) ?? null;
}
