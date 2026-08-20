import type { AssStyle, SubtitleCue, SubtitleDocument, SubtitleFormat } from "~/core/document";
import type { Command } from "~/core/history";
import { shiftCues, sortCues } from "~/core/subtitles";

/** Cue editing goes through commands, so undo covers timing work too (I2). */

export function updateCue(id: string, patch: Partial<SubtitleCue>): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({
			...document,
			cues: document.cues.map((cue) => (cue.id === id ? { ...cue, ...patch } : cue)),
		}),
		mergeKey: `cue:${id}:${Object.keys(patch).join(",")}`,
	};
}

export function addCue(afterMs: number, makeId: () => string): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({
			...document,
			cues: sortCues([
				...document.cues,
				{
					id: makeId(),
					startMs: afterMs,
					endMs: afterMs + 2000,
					text: "",
					styleName: document.styles[0]?.name ?? null,
					layer: 0,
					marginLeft: null,
					marginRight: null,
					marginVertical: null,
					effect: null,
				},
			]),
		}),
	};
}

export function deleteCue(id: string): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({
			...document,
			cues: document.cues.filter((cue) => cue.id !== id),
		}),
	};
}

export function shiftAll(offsetMs: number): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({ ...document, cues: shiftCues(document.cues, offsetMs) }),
		mergeKey: "shift",
	};
}

export function updateStyle(name: string, patch: Partial<AssStyle>): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({
			...document,
			styles: document.styles.map((style) =>
				style.name === name ? { ...style, ...patch } : style,
			),
		}),
		mergeKey: `style:${name}:${Object.keys(patch).join(",")}`,
	};
}

export function updateScriptInfo(key: string, value: string): Command<SubtitleDocument> {
	return {
		label: { key: "command.editCue" },
		apply: (document) => ({
			...document,
			scriptInfo: { ...document.scriptInfo, [key]: value },
		}),
		mergeKey: `info:${key}`,
	};
}

export function setExportFormat(format: SubtitleFormat): Command<SubtitleDocument> {
	return {
		label: { key: "command.exportSettings" },
		apply: (document) => ({ ...document, export: { format } }),
	};
}
