import type { Command } from "~/core/history";
import { NEUTRAL_FILTERS } from "~/core/document";
import type {
	CropRegion,
	FilterParams,
	ImageDocument,
	ImageExportSpec,
	ResizeSpec,
	Rotation,
	TextLayer,
} from "~/core/document";

/**
 * Every edit is a command. They live outside the component so they are unit
 * testable and so the history stays the only way a document changes.
 */
export function setFilter(name: keyof FilterParams, value: number): Command<ImageDocument> {
	return {
		label: { key: "command.filter", values: { name: `filter.${name}` } },
		apply: (document) => ({ ...document, filters: { ...document.filters, [name]: value } }),
		// A dragged slider collapses into one entry per filter.
		mergeKey: `filter:${name}`,
	};
}

export function resetFilters(): Command<ImageDocument> {
	return {
		label: { key: "action.reset" },
		apply: (document) => ({ ...document, filters: NEUTRAL_FILTERS }),
	};
}

export function setCrop(crop: CropRegion | null): Command<ImageDocument> {
	return {
		label: { key: "command.crop" },
		apply: (document) => ({ ...document, crop }),
		mergeKey: "crop",
	};
}

export function setResize(resize: ResizeSpec | null): Command<ImageDocument> {
	return {
		label: { key: "command.resize" },
		apply: (document) => ({ ...document, resize }),
		mergeKey: "resize",
	};
}

export function rotate(delta: 90 | -90): Command<ImageDocument> {
	return {
		label: { key: "command.rotate" },
		apply: (document) => ({
			...document,
			rotation: ((document.rotation + delta + 360) % 360) as Rotation,
		}),
	};
}

export function flip(axis: "horizontal" | "vertical"): Command<ImageDocument> {
	return {
		label: { key: "command.flip" },
		apply: (document) =>
			axis === "horizontal"
				? { ...document, flipHorizontal: !document.flipHorizontal }
				: { ...document, flipVertical: !document.flipVertical },
	};
}

export function addTextLayer(layer: TextLayer): Command<ImageDocument> {
	return {
		label: { key: "command.addText" },
		apply: (document) => ({ ...document, textLayers: [...document.textLayers, layer] }),
	};
}

export function updateTextLayer(id: string, patch: Partial<TextLayer>): Command<ImageDocument> {
	return {
		label: { key: "command.editText" },
		apply: (document) => ({
			...document,
			textLayers: document.textLayers.map((layer) =>
				layer.id === id ? { ...layer, ...patch } : layer,
			),
		}),
		mergeKey: `text:${id}`,
	};
}

export function removeTextLayer(id: string): Command<ImageDocument> {
	return {
		label: { key: "command.removeText" },
		apply: (document) => ({
			...document,
			textLayers: document.textLayers.filter((layer) => layer.id !== id),
		}),
	};
}

export function setExport(patch: Partial<ImageExportSpec>): Command<ImageDocument> {
	return {
		label: { key: "command.exportSettings" },
		apply: (document) => ({ ...document, export: { ...document.export, ...patch } }),
		mergeKey: "export",
	};
}
