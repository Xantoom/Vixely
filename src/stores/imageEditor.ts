import { create } from "zustand";

/* ── Types ── */

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

export interface Filters {
	exposure: number;
	brightness: number;
	contrast: number;
	highlights: number;
	shadows: number;
	saturation: number;
	temperature: number;
	tint: number;
	hue: number;
	blur: number;
	sepia: number;
	vignette: number;
	grain: number;
}

export const DEFAULT_FILTERS: Filters = {
	exposure: 1,
	brightness: 0,
	contrast: 1,
	highlights: 0,
	shadows: 0,
	saturation: 1,
	temperature: 0,
	tint: 0,
	hue: 0,
	blur: 0,
	sepia: 0,
	vignette: 0,
	grain: 0,
};

interface HistoryEntry {
	imageData: ImageData;
	filters: Filters;
}

export type ActiveTool = "pointer" | "crop";

type ProcessFn = (data: ImageData, filters: Filters) => Promise<ImageData>;

export type ExportFormat = "png" | "jpeg" | "webp";

const MAX_HISTORY = 20;
const MAX_HISTORY_BYTES = 512 * 1024 * 1024; // 512 MB

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

function filtersEqual(a: Filters, b: Filters): boolean {
	return (
		a.exposure === b.exposure &&
		a.brightness === b.brightness &&
		a.contrast === b.contrast &&
		a.highlights === b.highlights &&
		a.shadows === b.shadows &&
		a.saturation === b.saturation &&
		a.temperature === b.temperature &&
		a.tint === b.tint &&
		a.hue === b.hue &&
		a.blur === b.blur &&
		a.sepia === b.sepia &&
		a.vignette === b.vignette &&
		a.grain === b.grain
	);
}

/** Check if filters are all at default (no processing needed) */
function filtersAreDefault(f: Filters): boolean {
	return filtersEqual(f, DEFAULT_FILTERS);
}

/* ── Store ── */

export interface ImageEditorState {
	// Source
	file: File | null;
	originalData: ImageData | null;
	filteredData: ImageData | null;
	/** The very first ImageData loaded — used by Reset All */
	initialData: ImageData | null;

	// Filters
	filters: Filters;
	/** Committed filter values (last WASM run) */
	committedFilters: Filters;
	isDraggingSlider: boolean;
	/** True while the worker is processing filters */
	isProcessing: boolean;

	// View
	view: ViewTransform;

	// Tools
	activeTool: ActiveTool;
	crop: CropRect | null;
	cropAspectRatio: number | null;

	// Resize
	resizeWidth: number | null;
	resizeHeight: number | null;
	resizeLockAspect: boolean;

	// Export
	exportFormat: ExportFormat;
	exportQuality: number;
	showOriginal: boolean;

	// Compare
	compareMode: boolean;
	comparePosition: number;

	// History
	undoStack: HistoryEntry[];
	redoStack: HistoryEntry[];

	// Actions
	loadImage: (file: File, imageData: ImageData) => void;
	setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
	setSliderDragging: (v: boolean) => void;
	commitFilters: (processFn: ProcessFn) => Promise<void>;
	applyFilterPreset: (preset: Partial<Filters>, processFn: ProcessFn) => Promise<void>;
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
	undo: (processFn: ProcessFn) => Promise<void>;
	redo: (processFn: ProcessFn) => Promise<void>;
	resetAll: () => void;
	clearAll: () => void;
	isDirty: () => boolean;
}

async function makeFilteredData(orig: ImageData, filters: Filters, processFn: ProcessFn): Promise<ImageData> {
	if (filtersAreDefault(filters)) return orig;
	return processFn(orig, filters);
}

function currentEntry(state: ImageEditorState): HistoryEntry | null {
	if (!state.originalData) return null;
	return {
		imageData: state.originalData,
		filters: { ...state.committedFilters },
	};
}

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
	// Source
	file: null,
	originalData: null,
	filteredData: null,
	initialData: null,

	// Filters
	filters: { ...DEFAULT_FILTERS },
	committedFilters: { ...DEFAULT_FILTERS },
	isDraggingSlider: false,
	isProcessing: false,

	// View
	view: { panX: 0, panY: 0, zoom: 1 },

	// Tools
	activeTool: "pointer",
	crop: null,
	cropAspectRatio: null,

	// Resize
	resizeWidth: null,
	resizeHeight: null,
	resizeLockAspect: true,

	// Export
	exportFormat: "png",
	exportQuality: 90,
	showOriginal: false,

	// Compare
	compareMode: false,
	comparePosition: 0.5,

	// History
	undoStack: [],
	redoStack: [],

	/* ── Actions ── */

	loadImage: (file, imageData) => {
		// Detect format from file MIME type
		let fmt: ExportFormat = "png";
		let quality = 100;
		if (file.type === "image/jpeg") { fmt = "jpeg"; quality = 85; }
		else if (file.type === "image/webp") { fmt = "webp"; quality = 80; }

		set({
			file,
			originalData: imageData,
			filteredData: imageData,
			initialData: imageData,
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			isDraggingSlider: false,
			isProcessing: false,
			view: { panX: 0, panY: 0, zoom: 1 },
			activeTool: "pointer",
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

	setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
	setSliderDragging: (v) => set({ isDraggingSlider: v }),

	commitFilters: async (processFn) => {
		const s = get();
		if (!s.originalData) return;
		if (filtersEqual(s.filters, s.committedFilters)) {
			set({ isDraggingSlider: false });
			return;
		}
		const entry = currentEntry(s);
		set({ isDraggingSlider: false, isProcessing: true });
		const filtered = await makeFilteredData(s.originalData, s.filters, processFn);
		set({
			filteredData: filtered,
			committedFilters: { ...s.filters },
			isProcessing: false,
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	applyFilterPreset: async (preset, processFn) => {
		const state = get();
		if (!state.originalData) return;
		const entry = currentEntry(state);
		const newFilters = { ...DEFAULT_FILTERS, ...preset };
		set({ filters: newFilters, isProcessing: true });
		const filtered = await makeFilteredData(state.originalData, newFilters, processFn);
		set({
			committedFilters: { ...newFilters },
			filteredData: filtered,
			isDraggingSlider: false,
			isProcessing: false,
			undoStack: entry ? trimStack([...state.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : state.undoStack,
			redoStack: [],
		});
	},

	resetFilters: () => {
		const state = get();
		if (!state.originalData) return;
		const entry = currentEntry(state);
		set({
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			filteredData: state.originalData,
			isDraggingSlider: false,
			undoStack: entry ? trimStack([...state.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : state.undoStack,
			redoStack: [],
		});
	},

	setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),

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
		set({
			view: {
				panX: (containerW - img.width * zoom) / 2,
				panY: (containerH - img.height * zoom) / 2,
				zoom,
			},
		});
	},

	setActiveTool: (tool) => set({ activeTool: tool, crop: tool === "pointer" ? null : get().crop }),
	setCrop: (rect) => set({ crop: rect }),
	setCropAspectRatio: (ratio) => set({ cropAspectRatio: ratio }),

	applyCrop: () => {
		const s = get();
		if (!s.originalData || !s.crop) return;

		const entry = currentEntry(s);

		// Bake current filters into image, then crop
		const source = s.filteredData ?? s.originalData;
		const { x, y, width, height } = s.crop;
		const cx = Math.max(0, Math.round(x));
		const cy = Math.max(0, Math.round(y));
		const cw = Math.min(Math.round(width), source.width - cx);
		const ch = Math.min(Math.round(height), source.height - cy);
		if (cw <= 0 || ch <= 0) return;

		const canvas = document.createElement("canvas");
		canvas.width = cw;
		canvas.height = ch;
		const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

		// Put source data then extract the cropped region
		const tmpCanvas = document.createElement("canvas");
		tmpCanvas.width = source.width;
		tmpCanvas.height = source.height;
		const tmpCtx = tmpCanvas.getContext("2d")!;
		tmpCtx.putImageData(source, 0, 0);
		ctx.drawImage(tmpCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

		const croppedData = ctx.getImageData(0, 0, cw, ch);

		set({
			originalData: croppedData,
			filteredData: croppedData,
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			crop: null,
			activeTool: "pointer",
			resizeWidth: cw,
			resizeHeight: ch,
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	cancelCrop: () => set({ crop: null, activeTool: "pointer" }),

	setResizeWidth: (w) => {
		const s = get();
		if (w === null) { set({ resizeWidth: null }); return; }
		if (s.resizeLockAspect && s.originalData) {
			const aspect = s.originalData.width / s.originalData.height;
			set({ resizeWidth: w, resizeHeight: Math.round(w / aspect) });
		} else {
			set({ resizeWidth: w });
		}
	},

	setResizeHeight: (h) => {
		const s = get();
		if (h === null) { set({ resizeHeight: null }); return; }
		if (s.resizeLockAspect && s.originalData) {
			const aspect = s.originalData.width / s.originalData.height;
			set({ resizeHeight: h, resizeWidth: Math.round(h * aspect) });
		} else {
			set({ resizeHeight: h });
		}
	},

	setResizeLockAspect: (v) => set({ resizeLockAspect: v }),

	applyResize: () => {
		const s = get();
		if (!s.originalData || !s.resizeWidth || !s.resizeHeight) return;
		const w = Math.max(1, Math.min(8192, s.resizeWidth));
		const h = Math.max(1, Math.min(8192, s.resizeHeight));
		if (w === s.originalData.width && h === s.originalData.height) return;

		const entry = currentEntry(s);

		// Bake filters then resize
		const source = s.filteredData ?? s.originalData;
		const srcCanvas = document.createElement("canvas");
		srcCanvas.width = source.width;
		srcCanvas.height = source.height;
		const srcCtx = srcCanvas.getContext("2d")!;
		srcCtx.putImageData(source, 0, 0);

		const dstCanvas = document.createElement("canvas");
		dstCanvas.width = w;
		dstCanvas.height = h;
		const dstCtx = dstCanvas.getContext("2d", { willReadFrequently: true })!;
		dstCtx.drawImage(srcCanvas, 0, 0, w, h);

		const resizedData = dstCtx.getImageData(0, 0, w, h);

		set({
			originalData: resizedData,
			filteredData: resizedData,
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			resizeWidth: w,
			resizeHeight: h,
			undoStack: entry ? trimStack([...s.undoStack, entry], MAX_HISTORY, MAX_HISTORY_BYTES) : s.undoStack,
			redoStack: [],
		});
	},

	setExportFormat: (fmt) => {
		const quality = fmt === "png" ? 100 : fmt === "jpeg" ? 85 : 80;
		set({ exportFormat: fmt, exportQuality: quality });
	},
	setExportQuality: (q) => set({ exportQuality: q }),
	setShowOriginal: (v) => set({ showOriginal: v }),
	setCompareMode: (v) => set({ compareMode: v }),
	setComparePosition: (v) => set({ comparePosition: v }),

	undo: async (processFn) => {
		const s = get();
		if (s.undoStack.length === 0) return;
		const entry = currentEntry(s);
		const prev = s.undoStack[s.undoStack.length - 1]!;
		set({ isProcessing: true });
		const filtered = await makeFilteredData(prev.imageData, prev.filters, processFn);
		set({
			originalData: prev.imageData,
			filteredData: filtered,
			filters: { ...prev.filters },
			committedFilters: { ...prev.filters },
			resizeWidth: prev.imageData.width,
			resizeHeight: prev.imageData.height,
			isProcessing: false,
			undoStack: s.undoStack.slice(0, -1),
			redoStack: entry ? [...s.redoStack, entry] : s.redoStack,
		});
	},

	redo: async (processFn) => {
		const s = get();
		if (s.redoStack.length === 0) return;
		const entry = currentEntry(s);
		const next = s.redoStack[s.redoStack.length - 1]!;
		set({ isProcessing: true });
		const filtered = await makeFilteredData(next.imageData, next.filters, processFn);
		set({
			originalData: next.imageData,
			filteredData: filtered,
			filters: { ...next.filters },
			committedFilters: { ...next.filters },
			resizeWidth: next.imageData.width,
			resizeHeight: next.imageData.height,
			isProcessing: false,
			undoStack: entry ? [...s.undoStack, entry] : s.undoStack,
			redoStack: s.redoStack.slice(0, -1),
		});
	},

	resetAll: () => {
		const s = get();
		if (!s.initialData) return;
		set({
			originalData: s.initialData,
			filteredData: s.initialData,
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			isDraggingSlider: false,
			isProcessing: false,
			activeTool: "pointer",
			crop: null,
			cropAspectRatio: null,
			resizeWidth: s.initialData.width,
			resizeHeight: s.initialData.height,
			resizeLockAspect: true,
			exportFormat: "png",
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
			filteredData: null,
			initialData: null,
			filters: { ...DEFAULT_FILTERS },
			committedFilters: { ...DEFAULT_FILTERS },
			isDraggingSlider: false,
			isProcessing: false,
			view: { panX: 0, panY: 0, zoom: 1 },
			activeTool: "pointer",
			crop: null,
			cropAspectRatio: null,
			resizeWidth: null,
			resizeHeight: null,
			resizeLockAspect: true,
			exportFormat: "png",
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
		return s.originalData !== s.initialData || !filtersEqual(s.committedFilters, DEFAULT_FILTERS);
	},
}));
