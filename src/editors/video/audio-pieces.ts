/**
 * Sound taken apart and put back on the edited time: a decoded sample is clipped to the source
 * ranges kept, each piece moved to where its range lands in the output, and its level changed.
 */
import { AudioSample } from 'mediabunny';
import type { Range } from '@/document/timemap';

/** A source range and how far it moves to land in the output, in seconds. */
export interface Placed {
	range: Range;
	shift: number;
}

/** Ranges laid back to back from the start of the output. */
export function placeRanges(ranges: readonly Range[]): Placed[] {
	const placed: Placed[] = [];
	let at = 0;
	for (const range of ranges) {
		placed.push({ range, shift: at - range.start });
		at += range.end - range.start;
	}
	return placed;
}

/** The whole source, where it is. */
export const WHOLE: readonly Placed[] = [
	{ range: { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY }, shift: 0 },
];

/** Linear factor of a change in decibels. */
export function gainOf(decibels: number): number {
	return 10 ** (decibels / 20);
}

/**
 * The pieces of a sample that fall in the placed ranges, moved to their output times, their level
 * multiplied by `gain`. `offset` turns the sample's timestamps into source seconds.
 */
export function placeAudio(
	sample: AudioSample,
	placed: readonly Placed[],
	offset: number,
	gain: number,
): AudioSample[] {
	const start = sample.timestamp + offset;
	const end = start + sample.duration;
	const pieces: AudioSample[] = [];
	for (const { range, shift } of placed) {
		const from = Math.max(start, range.start);
		const to = Math.min(end, range.end);
		if (to <= from) continue;
		if (from === start && to === end && gain === 1) {
			const whole = sample.clone();
			whole.setTimestamp(from + shift);
			pieces.push(whole);
			continue;
		}
		const frameOffset = Math.round((from - start) * sample.sampleRate);
		const frameCount = Math.min(sample.numberOfFrames - frameOffset, Math.round((to - from) * sample.sampleRate));
		if (frameCount <= 0) continue;
		const channels = sample.numberOfChannels;
		const data = new Float32Array(frameCount * channels);
		for (let plane = 0; plane < channels; plane++) {
			sample.copyTo(data.subarray(plane * frameCount, (plane + 1) * frameCount), {
				planeIndex: plane,
				format: 'f32-planar',
				frameOffset,
				frameCount,
			});
		}
		if (gain !== 1) {
			for (let index = 0; index < data.length; index++) {
				data[index] = Math.max(-1, Math.min(1, (data[index] ?? 0) * gain));
			}
		}
		pieces.push(
			new AudioSample({
				data,
				format: 'f32-planar',
				numberOfChannels: channels,
				sampleRate: sample.sampleRate,
				timestamp: from + shift,
			}),
		);
	}
	return pieces;
}
