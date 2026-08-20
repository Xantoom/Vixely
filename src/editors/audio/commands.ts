import type { Command } from "~/core/history";
import { defaultEqualizer, moveSegment, removeSegment, splitAt } from "~/core/audio";
import type { AudioDocument, AudioExportSpec, EqualizerBand } from "~/core/document";

/** Every audio edit is a command, so undo covers the editor completely (I2). */

export function splitAtTime(outputSec: number): Command<AudioDocument> {
	return {
		label: { key: "command.trim" },
		apply: (document) => ({
			...document,
			segments: splitAt(document.segments, outputSec, () => crypto.randomUUID()),
		}),
	};
}

export function deleteSegment(id: string): Command<AudioDocument> {
	return {
		label: { key: "command.trim" },
		apply: (document) => ({ ...document, segments: removeSegment(document.segments, id) }),
	};
}

export function reorderSegments(from: number, to: number): Command<AudioDocument> {
	return {
		label: { key: "command.reorderFrames" },
		apply: (document) => ({ ...document, segments: moveSegment(document.segments, from, to) }),
	};
}

export function setSegmentGain(id: string, gainDb: number): Command<AudioDocument> {
	return {
		label: { key: "command.filter", values: { name: "gain" } },
		apply: (document) => ({
			...document,
			segments: document.segments.map((segment) =>
				segment.id === id ? { ...segment, gainDb } : segment,
			),
		}),
		mergeKey: `gain:${id}`,
	};
}

export function setSegmentFade(
	id: string,
	edge: "in" | "out",
	seconds: number,
): Command<AudioDocument> {
	return {
		label: { key: "command.filter", values: { name: "fade" } },
		apply: (document) => ({
			...document,
			segments: document.segments.map((segment) =>
				segment.id === id
					? { ...segment, [edge === "in" ? "fadeInSec" : "fadeOutSec"]: seconds }
					: segment,
			),
		}),
		mergeKey: `fade:${id}:${edge}`,
	};
}

export function setEqualizerBand(id: string, gainDb: number): Command<AudioDocument> {
	return {
		label: { key: "command.filter", values: { name: "equalizer" } },
		apply: (document) => ({
			...document,
			equalizer: document.equalizer.map((band) => (band.id === id ? { ...band, gainDb } : band)),
		}),
		mergeKey: `eq:${id}`,
	};
}

export function resetEqualizer(): Command<AudioDocument> {
	return {
		label: { key: "action.reset" },
		apply: (document) => ({
			...document,
			equalizer: defaultEqualizer((index) => document.equalizer[index]?.id ?? `band-${index}`),
		}),
	};
}

export function setLoudness(patch: Partial<AudioDocument["loudness"]>): Command<AudioDocument> {
	return {
		label: { key: "command.filter", values: { name: "loudness" } },
		apply: (document) => ({ ...document, loudness: { ...document.loudness, ...patch } }),
		mergeKey: "loudness",
	};
}

export function setAudioExport(patch: Partial<AudioExportSpec>): Command<AudioDocument> {
	return {
		label: { key: "command.exportSettings" },
		apply: (document) => ({ ...document, export: { ...document.export, ...patch } }),
		mergeKey: "export",
	};
}

export function selectTrack(trackId: number): Command<AudioDocument> {
	return {
		label: { key: "command.trackChange" },
		apply: (document) => ({ ...document, selectedTrackId: trackId }),
	};
}

export function ensureEqualizer(document: AudioDocument): readonly EqualizerBand[] {
	return document.equalizer.length > 0
		? document.equalizer
		: defaultEqualizer((index) => `band-${index}`);
}
