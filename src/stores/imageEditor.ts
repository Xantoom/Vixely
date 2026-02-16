import { create } from 'zustand';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { DEFAULT_FILTER_PARAMS, filtersEqual, filtersAreDefault } from '@/modules/shared-core/types/filters.ts';

export type { FilterParams as Filters } from '@/modules/shared-core/types/filters.ts';
export { DEFAULT_FILTER_PARAMS as DEFAULT_FILTERS } from '@/modules/shared-core/types/filters.ts';

export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ViewTransform {
	panX: number;
	panY: number;
	zoom: number;
}

interface HistoryEntry {
	imageData: ImageData;
	filters: FilterParams;
}

export type ActiveTool = 'pointer' | 'crop';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

const MAX_HISTORY = 20;
const MAX_HISTORY_BYTES = 512 * 1024 * 1024;

function entryBytes(e: HistoryEntry): number {
	return e.imageData.data.byteLength;
}

function trimStack(stack: HistoryEntry[], limit: number, byteLimit: number): HistoryEntry[] {
	let s = stack.length > limit ? stack.slice(stack.length - limit) : stack;
	let total = 0;
	for (const e of s) total += entryBytes(e);
	while (s.length > 0 && total > byteLimit) {
		total -= entryBytes(s[0]!);
		s = s.slice(1);
	}
	return s;
}

export interface ImageEditorState {
	file: File | null;
	originalData: ImageData | null;
	/** The very first ImageData loaded — used by Reset All */
	initialData: ImageData | null;

	filters: FilterParams;
	view: ViewTransform;
	activeTool: ActiveTool;
	crop: CropRect | null;
	cropAspectRatio: number | null;
	resizeWidth: number | null;
	resizeHeight: number | null;
	resizeLockAspect: boolean;
	exportFormat: ExportFormat;
	exportQuality: number;
	showOriginal: boolean;
	compareMode: boolean;
	comparePosition: number;
	undoStack: HistoryEntry[];
	redoStack: HistoryEntry[];

	loadImage: (file: File, imageData: ImageData) => void;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
	commitFilters: () => void;
	applyFilterPreset: (preset: Partial<FilterParams>) => void;
	resetFilters: () => void;
	setView: (v: Partial<ViewTransform>) => void;
	zoomTo: (zoom: number, anchorX: number, anchorY: number) => void;
	fitToView: (containerW: number, containerH: number) => void;
	setActiveTool: (tool: ActiveTool) => void;
	setCrop: (rect: CropRect | null) => void;
	setCropAspectRatio: (ratio: number | null) => void;
	applyCrop: () => void;
	cancelCrop: () => void;
	setResizeWidth: (w: number | null) => void;
	setResizeHeight: (h: number | null) => void;
	setResizeLockAspect: (v: boolean) => void;
	applyResize: () => void;
	setExportFormat: (fmt: ExportFormat) => void;
	setExportQuality: (q: number) => void;
	setShowOriginal: (v: boolean) => void;
	setCompareMode: (v: boolean) => void;
	setComparePosition: (v: number) => void;
	undo: () => void;
	redo: () => void;
	resetAll: () => void;
	clearAll: () => void;
	isDirty: () => boolean;
}

function currentEntry(state: ImageEditorState): HistoryEntry | null {
	if (!state.originalData) return null;
	return { imageData: state.originalData, filters: { ...state.filters } };
}

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
	file: null,
	originalData: null,
	initialData: null,
	filters: { ...DEFAULT_FILTER_PARAMS },
	view: { panX: 0, panY: 0, zoom: 1 },
	activeTool: 'pointer',
	crop: null,
	cropAspectRatio: null,
	resizeWidth: null,
	resizeHeight: null,
	resizeLockAspect: true,
	exportFormat: 'png',
	exportQuality: 90,
	showOriginal: false,
	compareMode: false,
	comparePosition: 0.5,
	undoStack: [],
	redoStack: [],

	loadImage: (file, imageData) => {
		let fmt: ExportFormat = 'png';
		let quality = 100;
		if (file.type === 'image/jpeg') {
			fmt = 'jpeg';
			quality = 85;
		} else if (file.type === 'image/webp') {
			fmt = 'webp';
			quality = 80;
		}

		set({
			file,
			originalData: imageData,
			initialData: imageData,
			filters: { ...DEFAULT_FILTER_PARAMS },
			view: { panX: 0, panY: 0, zoom: 1 },
			activeTool: 'pointer',
			crop: null,
			cropAspectRatio: null,
			resizeWidth: imageData.width,
			resizeHeight: imageData.height,
			resizeLockAspect: true,
			exportFormat: fmt,
			exportQuality: quality,
			showOriginal: false,
			compareMode: false,
			comparePosition: 0.5,
			undoStack: [],
			redoStack: [],
		});
	},

	setFilter: (key, value) => {
		set((s) => ({ filters: { ...s.filters, [key]: value } }));
	},

	commitFilters: () => {
		const s = get();
		if (!s.originalData) return;
		const entry = currentEntry(s);
		set({
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	applyFilterPreset: (preset) => {
		const state = get();
		if (!state.originalData) return;
		const entry = currentEntry(state);
		const newFilters = { ...DEFAULT_FILTER_PARAMS, ...preset };
		set({
			filters: newFilters,
			undoStack: entry ? trimStack([...state.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : state.undoStack,
			redoStack: [],
		});
	},

	resetFilters: () => {
		const state = get();
		if (!state.originalData) return;
		const entry = currentEntry(state);
		set({
			filters: { ...DEFAULT_FILTER_PARAMS },
			undoStack: entry ? trimStack([...state.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : state.undoStack,
			redoStack: [],
		});
	},

	setView: (v) => {
		set((s) => ({ view: { ...s.view, ...v } }));
	},

	zoomTo: (zoom, anchorX, anchorY) => {
		const s = get();
		const ratio = zoom / s.view.zoom;
		set({
			view: {
				panX: anchorX - (anchorX - s.view.panX) * ratio,
				panY: anchorY - (anchorY - s.view.panY) * ratio,
				zoom,
			},
		});
	},

	fitToView: (containerW, containerH) => {
		const s = get();
		const img = s.originalData;
		if (!img) return;
		const zoom = Math.min((containerW - 48) / img.width, (containerH - 48) / img.height, 1);
		set({ view: { panX: (containerW - img.width * zoom) / 2, panY: (containerH - img.height * zoom) / 2, zoom } });
	},

	setActiveTool: (tool) => {
		set({ activeTool: tool, crop: tool === 'pointer' ? null : get().crop });
	},
	setCrop: (rect) => {
		set({ crop: rect });
	},
	setCropAspectRatio: (ratio) => {
		set({ cropAspectRatio: ratio });
	},

	applyCrop: () => {
		const s = get();
		if (!s.originalData || !s.crop) return;

		const entry = currentEntry(s);

		// For crop, we need to render current filters to get the filtered result,
		// then crop. Since WebGL is the renderer, we bake the original + crop.
		const source = s.originalData;
		const { x, y, width, height } = s.crop;
		const cx = Math.max(0, Math.round(x));
		const cy = Math.max(0, Math.round(y));
		const cw = Math.min(Math.round(width), source.width - cx);
		const ch = Math.min(Math.round(height), source.height - cy);
		if (cw <= 0 || ch <= 0) return;

		const canvas = document.createElement('canvas');
		canvas.width = cw;
		canvas.height = ch;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

		const tmpCanvas = document.createElement('canvas');
		tmpCanvas.width = source.width;
		tmpCanvas.height = source.height;
		const tmpCtx = tmpCanvas.getContext('2d')!;
		tmpCtx.putImageData(source, 0, 0);
		ctx.drawImage(tmpCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

		const croppedData = ctx.getImageData(0, 0, cw, ch);

		set({
			originalData: croppedData,
			filters: { ...DEFAULT_FILTER_PARAMS },
			crop: null,
			activeTool: 'pointer',
			resizeWidth: cw,
			resizeHeight: ch,
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	cancelCrop: () => {
		set({ crop: null, activeTool: 'pointer' });
	},

	setResizeWidth: (w) => {
		const s = get();
		if (w === null) {
			set({ resizeWidth: null });
			return;
		}
		if (s.resizeLockAspect && s.originalData) {
			const aspect = s.originalData.width / s.originalData.height;
			set({ resizeWidth: w, resizeHeight: Math.round(w / aspect) });
		} else {
			set({ resizeWidth: w });
		}
	},

	setResizeHeight: (h) => {
		const s = get();
		if (h === null) {
			set({ resizeHeight: null });
			return;
		}
		if (s.resizeLockAspect && s.originalData) {
			const aspect = s.originalData.width / s.originalData.height;
			set({ resizeHeight: h, resizeWidth: Math.round(h * aspect) });
		} else {
			set({ resizeHeight: h });
		}
	},

	setResizeLockAspect: (v) => {
		set({ resizeLockAspect: v });
	},

	applyResize: () => {
		const s = get();
		if (!s.originalData || !s.resizeWidth || !s.resizeHeight) return;
		const w = Math.max(1, Math.min(8192, s.resizeWidth));
		const h = Math.max(1, Math.min(8192, s.resizeHeight));
		if (w === s.originalData.width && h === s.originalData.height) return;

		const entry = currentEntry(s);

		const source = s.originalData;
		const srcCanvas = document.createElement('canvas');
		srcCanvas.width = source.width;
		srcCanvas.height = source.height;
		const srcCtx = srcCanvas.getContext('2d')!;
		srcCtx.putImageData(source, 0, 0);

		const dstCanvas = document.createElement('canvas');
		dstCanvas.width = w;
		dstCanvas.height = h;
		const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
		dstCtx.drawImage(srcCanvas, 0, 0, w, h);

		const resizedData = dstCtx.getImageData(0, 0, w, h);

		set({
			originalData: resizedData,
			filters: { ...DEFAULT_FILTER_PARAMS },
			resizeWidth: w,
			resizeHeight: h,
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	setExportFormat: (fmt) => {
		const quality = fmt === 'png' ? 100 : fmt === 'jpeg' ? 85 : 80;
		set({ exportFormat: fmt, exportQuality: quality });
	},
	setExportQuality: (q) => {
		set({ exportQuality: q });
	},
	setShowOriginal: (v) => {
		set({ showOriginal: v });
	},
	setCompareMode: (v) => {
		set({ compareMode: v });
	},
	setComparePosition: (v) => {
		set({ comparePosition: v });
	},

	undo: () => {
		const s = get();
		if (s.undoStack.length === 0) return;
		const entry = currentEntry(s);
		const prev = s.undoStack[s.undoStack.length - 1]!;
		set({
			originalData: prev.imageData,
			filters: { ...prev.filters },
			resizeWidth: prev.imageData.width,
			resizeHeight: prev.imageData.height,
			undoStack: s.undoStack.slice(0, -1),
			redoStack: entry ? [...s.redoStack, entry] : s.redoStack,
		});
	},

	redo: () => {
		const s = get();
		if (s.redoStack.length === 0) return;
		const entry = currentEntry(s);
		const next = s.redoStack[s.redoStack.length - 1]!;
		set({
			originalData: next.imageData,
			filters: { ...next.filters },
			resizeWidth: next.imageData.width,
			resizeHeight: next.imageData.height,
			undoStack: entry ? [...s.undoStack, entry] : s.undoStack,
			redoStack: s.redoStack.slice(0, -1),
		});
	},

	resetAll: () => {
		const s = get();
		if (!s.initialData) return;
		set({
			originalData: s.initialData,
			filters: { ...DEFAULT_FILTER_PARAMS },
			view: { panX: 0, panY: 0, zoom: 1 },
			activeTool: 'pointer',
			crop: null,
			cropAspectRatio: null,
			resizeWidth: s.initialData.width,
			resizeHeight: s.initialData.height,
			resizeLockAspect: true,
			exportFormat: 'png',
			exportQuality: 90,
			showOriginal: false,
			compareMode: false,
			comparePosition: 0.5,
			undoStack: [],
			redoStack: [],
		});
	},

	clearAll: () => {
		set({
			file: null,
			originalData: null,
			initialData: null,
			filters: { ...DEFAULT_FILTER_PARAMS },
			view: { panX: 0, panY: 0, zoom: 1 },
			activeTool: 'pointer',
			crop: null,
			cropAspectRatio: null,
			resizeWidth: null,
			resizeHeight: null,
			resizeLockAspect: true,
			exportFormat: 'png',
			exportQuality: 90,
			showOriginal: false,
			compareMode: false,
			comparePosition: 0.5,
			undoStack: [],
			redoStack: [],
		});
	},

	isDirty: () => {
		const s = get();
		if (!s.originalData || !s.initialData) return false;
		return s.originalData !== s.initialData || !filtersAreDefault(s.filters);
	},
}));
