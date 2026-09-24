import type { Range } from '@/document/timemap';
import type { Rect } from '@/editors/image/document';

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
	/** Part of the picture kept, in source pixels; null keeps everything. */
	crop: Rect | null;
}

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * Frame rates a GIF can hold. Delays are counted in hundredths of a second and browsers slow down
 * anything faster than 50 fps, so 50 is the ceiling.
 */
export const FRAME_RATES = [10, 12, 15, 20, 25, 30, 50];

/** Shortest animation kept, in seconds. */
export const MIN_LENGTH = 0.1;

export function createGifDoc(duration: number, fps: number | null): GifDoc {
	return { duration, trim: { start: 0, end: duration }, speed: 1, direction: 'forward', fps, crop: null };
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
	const forward = forwardFrames(doc, timing);
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
