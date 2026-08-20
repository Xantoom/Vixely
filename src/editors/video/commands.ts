import type { Command } from "~/core/history";
import type {
	CropRegion,
	FilterParams,
	Rotation,
	TrackSelection,
	VideoDocument,
	VideoExportSpec,
} from "~/core/document";
import { NEUTRAL_FILTERS } from "~/core/document";

/** Video edits are commands, so undo covers trimming and track changes (I2). */

export function setVideoFilter(name: keyof FilterParams, value: number): Command<VideoDocument> {
	return {
		label: { key: "command.filter", values: { name: `filter.${name}` } },
		apply: (document) => ({ ...document, filters: { ...document.filters, [name]: value } }),
		mergeKey: `filter:${name}`,
	};
}

export function resetVideoFilters(): Command<VideoDocument> {
	return {
		label: { key: "action.reset" },
		apply: (document) => ({ ...document, filters: NEUTRAL_FILTERS }),
	};
}

export function setTrim(startSec: number, endSec: number): Command<VideoDocument> {
	return {
		label: { key: "command.trim" },
		apply: (document) => ({
			...document,
			// Clamped against each other so a drag cannot invert the range.
			trimStartSec: Math.max(0, Math.min(startSec, endSec - 0.001)),
			trimEndSec: Math.min(document.durationSec, Math.max(endSec, startSec + 0.001)),
		}),
		mergeKey: "trim",
	};
}

export function setVideoCrop(crop: CropRegion | null): Command<VideoDocument> {
	return {
		label: { key: "command.crop" },
		apply: (document) => ({ ...document, crop }),
		mergeKey: "crop",
	};
}

export function rotateVideo(delta: 90 | -90): Command<VideoDocument> {
	return {
		label: { key: "command.rotate" },
		apply: (document) => ({
			...document,
			rotation: ((document.rotation + delta + 360) % 360) as Rotation,
		}),
	};
}

export type TrackKind = "videoTracks" | "audioTracks" | "subtitleTracks";

export function setTrackAction(
	kind: TrackKind,
	trackId: number,
	action: TrackSelection["action"],
): Command<VideoDocument> {
	return {
		label: { key: "command.trackChange" },
		apply: (document) => ({
			...document,
			[kind]: document[kind].map((track) =>
				track.trackId === trackId ? { ...track, action } : track,
			),
		}),
	};
}

export function toggleTrack(kind: TrackKind, trackId: number): Command<VideoDocument> {
	return {
		label: { key: "command.trackChange" },
		apply: (document) => ({
			...document,
			[kind]: document[kind].map((track) =>
				track.trackId === trackId ? { ...track, enabled: !track.enabled } : track,
			),
		}),
	};
}

export function addSubtitleTrack(track: TrackSelection): Command<VideoDocument> {
	return {
		label: { key: "command.trackChange" },
		apply: (document) => ({
			...document,
			subtitleTracks: [...document.subtitleTracks, track],
		}),
	};
}

export function removeSubtitleTrack(trackId: number): Command<VideoDocument> {
	return {
		label: { key: "command.trackChange" },
		apply: (document) => ({
			...document,
			subtitleTracks: document.subtitleTracks.filter((track) => track.trackId !== trackId),
		}),
	};
}

export function setVideoExport(patch: Partial<VideoExportSpec>): Command<VideoDocument> {
	return {
		label: { key: "command.exportSettings" },
		apply: (document) => ({ ...document, export: { ...document.export, ...patch } }),
		mergeKey: "export",
	};
}
