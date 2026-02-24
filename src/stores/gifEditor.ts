import { create } from 'zustand';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { DEFAULT_FILTER_PARAMS, filtersAreDefault } from '@/modules/shared-core/types/filters.ts';

export type GifMode = 'settings' | 'crop' | 'resize' | 'rotate' | 'filters' | 'optimize' | 'export';

export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type CropAspectPreset = 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '2:1';

export type RotationAngle = 0 | 90 | 180 | 270;

export type FrameSkipMode = 'none' | 'every2nd' | 'every3rd' | 'every4th';

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

	resetAll: () => {
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
		});
	},

	hasFilterChanges: () => {
		return !filtersAreDefault(get().filters);
	},
}));
