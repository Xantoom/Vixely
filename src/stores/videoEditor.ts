import { create } from "zustand";

export type VideoMode = "presets" | "color" | "trim" | "export";

export interface VideoFilters {
	brightness: number;
	contrast: number;
	saturation: number;
	hue: number;
}

export const DEFAULT_VIDEO_FILTERS: VideoFilters = {
	brightness: 0,
	contrast: 1,
	saturation: 1,
	hue: 0,
};

export interface VideoEditorState {
	mode: VideoMode;
	filters: VideoFilters;
	cropAspectRatio: string | null;

	setMode: (mode: VideoMode) => void;
	setFilter: <K extends keyof VideoFilters>(key: K, value: VideoFilters[K]) => void;
	resetFilters: () => void;
	setCropAspectRatio: (ratio: string | null) => void;

	/** CSS filter string for real-time video preview */
	cssFilter: () => string;
	/** FFmpeg -vf eq= args for export-time color correction */
	ffmpegFilterArgs: () => string[];
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
	mode: "presets",
	filters: { ...DEFAULT_VIDEO_FILTERS },
	cropAspectRatio: null,

	setMode: (mode) => set({ mode }),

	setFilter: (key, value) =>
		set((s) => ({ filters: { ...s.filters, [key]: value } })),

	resetFilters: () => set({ filters: { ...DEFAULT_VIDEO_FILTERS } }),

	setCropAspectRatio: (ratio) => set({ cropAspectRatio: ratio }),

	cssFilter: () => {
		const { brightness, contrast, saturation, hue } = get().filters;
		const parts: string[] = [];
		if (brightness !== 0) parts.push(`brightness(${1 + brightness})`);
		if (contrast !== 1) parts.push(`contrast(${contrast})`);
		if (saturation !== 1) parts.push(`saturate(${saturation})`);
		if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
		return parts.length > 0 ? parts.join(" ") : "none";
	},

	ffmpegFilterArgs: () => {
		const { brightness, contrast, saturation } = get().filters;
		const needsEq = brightness !== 0 || contrast !== 1 || saturation !== 1;
		if (!needsEq) return [];
		return [
			"-vf",
			`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
		];
	},
}));
