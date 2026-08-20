import type { AudioSegment, EqualizerBand } from "../document/types.ts";

/**
 * Segment arithmetic: what a document's cut list actually means in seconds.
 *
 * Pure, so the timeline UI, the export planner and the tests all agree by
 * construction rather than by three parallel implementations.
 */

export function segmentDuration(segment: AudioSegment): number {
	return Math.max(0, segment.endSec - segment.startSec);
}

export function totalDuration(segments: readonly AudioSegment[]): number {
	return segments.reduce((total, segment) => total + segmentDuration(segment), 0);
}

/** Where a segment starts on the output timeline, not on the source. */
export function outputOffset(segments: readonly AudioSegment[], index: number): number {
	return segments.slice(0, index).reduce((total, segment) => total + segmentDuration(segment), 0);
}

/** Maps an output timestamp back to the source, for the playhead. */
export function sourceTimeAt(
	segments: readonly AudioSegment[],
	outputSec: number,
): { readonly segment: AudioSegment; readonly sourceSec: number } | null {
	let elapsed = 0;
	for (const segment of segments) {
		const duration = segmentDuration(segment);
		if (outputSec < elapsed + duration) {
			return { segment, sourceSec: segment.startSec + (outputSec - elapsed) };
		}
		elapsed += duration;
	}
	return null;
}

/** Splits a segment in two at an output timestamp. Ignores a cut at an edge. */
export function splitAt(
	segments: readonly AudioSegment[],
	outputSec: number,
	newId: () => string,
): readonly AudioSegment[] {
	let elapsed = 0;
	const result: AudioSegment[] = [];

	for (const segment of segments) {
		const duration = segmentDuration(segment);
		const cutOffset = outputSec - elapsed;

		if (cutOffset > 0 && cutOffset < duration) {
			const cutPoint = segment.startSec + cutOffset;
			result.push(
				// The fade out belongs to the second half, the fade in to the first.
				{ ...segment, endSec: cutPoint, fadeOutSec: 0 },
				{ ...segment, id: newId(), startSec: cutPoint, fadeInSec: 0 },
			);
		} else {
			result.push(segment);
		}
		elapsed += duration;
	}

	return result;
}

export function removeSegment(
	segments: readonly AudioSegment[],
	id: string,
): readonly AudioSegment[] {
	return segments.filter((segment) => segment.id !== id);
}

export function moveSegment(
	segments: readonly AudioSegment[],
	from: number,
	to: number,
): readonly AudioSegment[] {
	if (from === to || from < 0 || from >= segments.length) return segments;
	const result = [...segments];
	const [moved] = result.splice(from, 1);
	if (moved === undefined) return segments;
	result.splice(Math.min(result.length, Math.max(0, to)), 0, moved);
	return result;
}

/** Gain envelope at an offset inside a segment, fades included. */
export function gainAt(segment: AudioSegment, offsetSec: number): number {
	const duration = segmentDuration(segment);
	if (duration <= 0) return 0;

	const base = 10 ** (segment.gainDb / 20);
	let envelope = 1;

	if (segment.fadeInSec > 0 && offsetSec < segment.fadeInSec) {
		envelope *= Math.max(0, offsetSec / segment.fadeInSec);
	}
	const fromEnd = duration - offsetSec;
	if (segment.fadeOutSec > 0 && fromEnd < segment.fadeOutSec) {
		envelope *= Math.max(0, fromEnd / segment.fadeOutSec);
	}

	return base * envelope;
}

/** Default eight-band equaliser, on a roughly logarithmic spacing. */
export function defaultEqualizer(makeId: (index: number) => string): readonly EqualizerBand[] {
	const frequencies = [60, 170, 350, 1000, 3500, 8000, 12_000, 16_000];
	return frequencies.map((frequency, index) => ({
		id: makeId(index),
		type:
			index === 0
				? ("lowshelf" as const)
				: index === frequencies.length - 1
					? ("highshelf" as const)
					: ("peaking" as const),
		frequency,
		gainDb: 0,
		q: 1,
		enabled: true,
	}));
}

export function equalizerIsNeutral(bands: readonly EqualizerBand[]): boolean {
	return bands.every((band) => !band.enabled || band.gainDb === 0);
}
