import { create } from 'zustand';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { DEFAULT_FILTER_PARAMS, filtersAreDefault } from '@/modules/shared-core/types/filters.ts';

export type GifMode = 'settings' | 'crop' | 'resize' | 'rotate' | 'filters' | 'optimize' | 'frames' | 'text' | 'export';

export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type CropAspectPreset = 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '2:1';

export type RotationAngle = 0 | 90 | 180 | 270;

export type FrameSkipMode = 'none' | 'every2nd' | 'every3rd' | 'every4th';

export interface ExtractedFrame {
	index: number;
	url: string;
	width: number;
	height: number;
	timeMs: number;
	delayCentiseconds: number;
	selected: boolean;
}

export interface TextOverlay {
	id: string;
	text: string;
	x: number;
	y: number;
	fontSize: number;
	fontFamily: string;
	color: string;
	outlineColor: string;
	outlineWidth: number;
	opacity: number;
}

export interface GifEditorState {
	mode: GifMode;
	speed: number;
	reverse: boolean;
	colorReduction: number;
	loopCount: number;

	// Crop
	crop: CropRect | null;
	cropAspect: CropAspectPreset;

	// Rotate/Flip
	rotation: RotationAngle;
	flipH: boolean;
	flipV: boolean;

	// Filters
	filters: FilterParams;

	// Optimize
	compressionSpeed: number;
	frameSkip: FrameSkipMode;
	dithering: boolean;

	// Frames
	extractedFrames: ExtractedFrame[];
	selectedFrameIndex: number | null;

	// Text overlays
	textOverlays: TextOverlay[];
	activeOverlayId: string | null;

	// Actions
	setMode: (mode: GifMode) => void;
	setSpeed: (speed: number) => void;
	setReverse: (reverse: boolean) => void;
	setColorReduction: (colors: number) => void;
	setLoopCount: (count: number) => void;
	setCrop: (crop: CropRect | null) => void;
	setCropAspect: (aspect: CropAspectPreset) => void;
	setRotation: (angle: RotationAngle) => void;
	setFlipH: (flip: boolean) => void;
	setFlipV: (flip: boolean) => void;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
	resetFilters: () => void;
	setCompressionSpeed: (speed: number) => void;
	setFrameSkip: (skip: FrameSkipMode) => void;
	setDithering: (dithering: boolean) => void;

	// Frame actions
	setExtractedFrames: (frames: ExtractedFrame[]) => void;
	clearExtractedFrames: () => void;
	setSelectedFrameIndex: (index: number | null) => void;
	toggleFrameSelected: (index: number) => void;
	selectAllFrames: () => void;
	deselectAllFrames: () => void;
	deleteSelectedFrames: () => void;
	setFrameDelay: (index: number, delayCentiseconds: number) => void;
	reorderFrame: (fromIndex: number, toIndex: number) => void;

	// Text overlay actions
	addTextOverlay: (overlay: TextOverlay) => void;
	updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
	removeTextOverlay: (id: string) => void;
	setActiveOverlayId: (id: string | null) => void;

	resetAll: () => void;
	hasFilterChanges: () => boolean;
}

export const CROP_ASPECT_RATIOS: Record<CropAspectPreset, number | null> = {
	free: null,
	'1:1': 1,
	'4:3': 4 / 3,
	'16:9': 16 / 9,
	'3:2': 3 / 2,
	'2:1': 2,
};

export const useGifEditorStore = create<GifEditorState>((set, get) => ({
	mode: 'settings',
	speed: 1,
	reverse: false,
	colorReduction: 256,
	loopCount: 0,

	crop: null,
	cropAspect: 'free',

	rotation: 0,
	flipH: false,
	flipV: false,

	filters: { ...DEFAULT_FILTER_PARAMS },

	compressionSpeed: 10,
	frameSkip: 'none',
	dithering: true,

	extractedFrames: [],
	selectedFrameIndex: null,

	textOverlays: [],
	activeOverlayId: null,

	setMode: (mode) => {
		set({ mode });
	},
	setSpeed: (speed) => {
		set({ speed });
	},
	setReverse: (reverse) => {
		set({ reverse });
	},
	setColorReduction: (colorReduction) => {
		set({ colorReduction });
	},
	setLoopCount: (loopCount) => {
		set({ loopCount });
	},
	setCrop: (crop) => {
		set({ crop });
	},
	setCropAspect: (cropAspect) => {
		set({ cropAspect });
	},
	setRotation: (rotation) => {
		set({ rotation });
	},
	setFlipH: (flipH) => {
		set({ flipH });
	},
	setFlipV: (flipV) => {
		set({ flipV });
	},
	setFilter: (key, value) => {
		set((s) => ({ filters: { ...s.filters, [key]: value } }));
	},
	resetFilters: () => {
		set({ filters: { ...DEFAULT_FILTER_PARAMS } });
	},
	setCompressionSpeed: (compressionSpeed) => {
		set({ compressionSpeed });
	},
	setFrameSkip: (frameSkip) => {
		set({ frameSkip });
	},
	setDithering: (dithering) => {
		set({ dithering });
	},

	// Frame actions
	setExtractedFrames: (extractedFrames) => {
		set({ extractedFrames, selectedFrameIndex: null });
	},
	clearExtractedFrames: () => {
		const { extractedFrames } = get();
		for (const frame of extractedFrames) {
			URL.revokeObjectURL(frame.url);
		}
		set({ extractedFrames: [], selectedFrameIndex: null });
	},
	setSelectedFrameIndex: (selectedFrameIndex) => {
		set({ selectedFrameIndex });
	},
	toggleFrameSelected: (index) => {
		set((s) => ({
			extractedFrames: s.extractedFrames.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f)),
		}));
	},
	selectAllFrames: () => {
		set((s) => ({ extractedFrames: s.extractedFrames.map((f) => ({ ...f, selected: true })) }));
	},
	deselectAllFrames: () => {
		set((s) => ({ extractedFrames: s.extractedFrames.map((f) => ({ ...f, selected: false })) }));
	},
	deleteSelectedFrames: () => {
		const { extractedFrames } = get();
		const toRemove = extractedFrames.filter((f) => f.selected);
		for (const frame of toRemove) {
			URL.revokeObjectURL(frame.url);
		}
		set((s) => ({
			extractedFrames: s.extractedFrames.filter((f) => !f.selected).map((f, i) => ({ ...f, index: i })),
			selectedFrameIndex: null,
		}));
	},
	setFrameDelay: (index, delayCentiseconds) => {
		set((s) => ({
			extractedFrames: s.extractedFrames.map((f, i) => (i === index ? { ...f, delayCentiseconds } : f)),
		}));
	},
	reorderFrame: (fromIndex, toIndex) => {
		set((s) => {
			const frames = [...s.extractedFrames];
			const [moved] = frames.splice(fromIndex, 1);
			if (!moved) return {};
			frames.splice(toIndex, 0, moved);
			return { extractedFrames: frames.map((f, i) => ({ ...f, index: i })) };
		});
	},

	// Text overlay actions
	addTextOverlay: (overlay) => {
		set((s) => ({ textOverlays: [...s.textOverlays, overlay], activeOverlayId: overlay.id }));
	},
	updateTextOverlay: (id, updates) => {
		set((s) => ({ textOverlays: s.textOverlays.map((o) => (o.id === id ? { ...o, ...updates } : o)) }));
	},
	removeTextOverlay: (id) => {
		set((s) => ({
			textOverlays: s.textOverlays.filter((o) => o.id !== id),
			activeOverlayId: s.activeOverlayId === id ? null : s.activeOverlayId,
		}));
	},
	setActiveOverlayId: (activeOverlayId) => {
		set({ activeOverlayId });
	},

	resetAll: () => {
		const { extractedFrames } = get();
		for (const frame of extractedFrames) {
			URL.revokeObjectURL(frame.url);
		}
		set({
			mode: 'settings',
			speed: 1,
			reverse: false,
			colorReduction: 256,
			loopCount: 0,
			crop: null,
			cropAspect: 'free',
			rotation: 0,
			flipH: false,
			flipV: false,
			filters: { ...DEFAULT_FILTER_PARAMS },
			compressionSpeed: 10,
			frameSkip: 'none',
			dithering: true,
			extractedFrames: [],
			selectedFrameIndex: null,
			textOverlays: [],
			activeOverlayId: null,
		});
	},

	hasFilterChanges: () => {
		return !filtersAreDefault(get().filters);
	},
}));
