import type { Command } from "~/core/history";
import type {
	CropRegion,
	FilterParams,
	GifDocument,
	GifExportSpec,
	GifFrame,
	ResizeSpec,
	Rotation,
} from "~/core/document";
import { NEUTRAL_FILTERS } from "~/core/document";

/** Frame-level edits are commands too, so undo covers reordering (I2). */

export function removeFrames(ids: readonly string[]): Command<GifDocument> {
	const set = new Set(ids);
	return {
		label: { key: "command.removeFrame" },
		apply: (document) => ({
			...document,
			frames: document.frames.filter((frame) => !set.has(frame.id)),
		}),
	};
}

export function moveFrame(from: number, to: number): Command<GifDocument> {
	return {
		label: { key: "command.reorderFrames" },
		apply: (document) => {
			if (from === to || from < 0 || from >= document.frames.length) return document;
			const frames = [...document.frames];
			const [moved] = frames.splice(from, 1);
			if (moved === undefined) return document;
			frames.splice(Math.min(frames.length, Math.max(0, to)), 0, moved);
			return { ...document, frames };
		},
	};
}

export function reverseFrames(): Command<GifDocument> {
	return {
		label: { key: "command.reorderFrames" },
		apply: (document) => ({ ...document, frames: document.frames.toReversed() }),
	};
}

export function setFrameDelay(ids: readonly string[], delayMs: number): Command<GifDocument> {
	const set = new Set(ids);
	return {
		label: { key: "command.frameDelay" },
		apply: (document) => ({
			...document,
			frames: document.frames.map((frame) => (set.has(frame.id) ? { ...frame, delayMs } : frame)),
		}),
		mergeKey: `delay:${[...set].join(",")}`,
	};
}

/** Applies one delay to every frame, which is how a speed change is expressed. */
export function setAllDelays(delayMs: number): Command<GifDocument> {
	return {
		label: { key: "command.frameDelay" },
		apply: (document) => ({
			...document,
			frames: document.frames.map((frame) => ({ ...frame, delayMs })),
		}),
		mergeKey: "delay:all",
	};
}

export function scaleDelays(factor: number): Command<GifDocument> {
	return {
		label: { key: "command.frameDelay" },
		apply: (document) => ({
			...document,
			frames: document.frames.map((frame) => ({
				...frame,
				delayMs: Math.max(10, Math.round(frame.delayMs * factor)),
			})),
		}),
		mergeKey: "delay:scale",
	};
}

export function setGifFilter(name: keyof FilterParams, value: number): Command<GifDocument> {
	return {
		label: { key: "command.filter", values: { name: `filter.${name}` } },
		apply: (document) => ({ ...document, filters: { ...document.filters, [name]: value } }),
		mergeKey: `filter:${name}`,
	};
}

export function resetGifFilters(): Command<GifDocument> {
	return {
		label: { key: "action.reset" },
		apply: (document) => ({ ...document, filters: NEUTRAL_FILTERS }),
	};
}

export function setGifCrop(crop: CropRegion | null): Command<GifDocument> {
	return {
		label: { key: "command.crop" },
		apply: (document) => ({ ...document, crop }),
		mergeKey: "crop",
	};
}

export function setGifResize(resize: ResizeSpec | null): Command<GifDocument> {
	return {
		label: { key: "command.resize" },
		apply: (document) => ({ ...document, resize }),
		mergeKey: "resize",
	};
}

export function rotateGif(delta: 90 | -90): Command<GifDocument> {
	return {
		label: { key: "command.rotate" },
		apply: (document) => ({
			...document,
			rotation: ((document.rotation + delta + 360) % 360) as Rotation,
		}),
	};
}

export function setGifExport(patch: Partial<GifExportSpec>): Command<GifDocument> {
	return {
		label: { key: "command.exportSettings" },
		apply: (document) => ({ ...document, export: { ...document.export, ...patch } }),
		mergeKey: "export",
	};
}

/** Total playback time, which is what the timeline shows. */
export function totalDurationMs(frames: readonly GifFrame[]): number {
	return frames.reduce((total, frame) => total + frame.delayMs, 0);
}
