import { create } from 'zustand';
import type { AdvancedVideoSettings } from '@/components/video/AdvancedSettings.tsx';

export type VideoMode = 'presets' | 'trim' | 'resize' | 'adjust' | 'export';

export type TrimInputMode = 'time' | 'frames';

export interface VideoFilters {
	brightness: number;
	contrast: number;
	saturation: number;
	hue: number;
}

export const DEFAULT_VIDEO_FILTERS: VideoFilters = { brightness: 0, contrast: 1, saturation: 1, hue: 0 };

export interface StreamInfo {
	index: number;
	type: 'video' | 'audio' | 'subtitle';
	codec: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	bitrate?: number;
}

export interface ProbeResult {
	duration: number;
	bitrate: number;
	format: string;
	streams: StreamInfo[];
}

export interface TrackSelection {
	audioEnabled: boolean;
	subtitleEnabled: boolean;
	audioTrackIndex: number;
	subtitleTrackIndex: number;
}

export interface ResizeSettings {
	width: number;
	height: number;
	originalWidth: number;
	originalHeight: number;
	scalePercent: number;
	lockAspect: boolean;
}

export const DEFAULT_RESIZE: ResizeSettings = {
	width: 0,
	height: 0,
	originalWidth: 0,
	originalHeight: 0,
	scalePercent: 100,
	lockAspect: true,
};

export const DEFAULT_TRACK_SELECTION: TrackSelection = {
	audioEnabled: true,
	subtitleEnabled: false,
	audioTrackIndex: 0,
	subtitleTrackIndex: 0,
};

export const DEFAULT_ADVANCED_SETTINGS: AdvancedVideoSettings = {
	codec: 'libx264',
	container: 'mp4',
	crf: 23,
	preset: 'veryfast',
	audioCodec: 'aac',
	audioBitrate: '96k',
};

export interface VideoEditorState {
	mode: VideoMode;
	filters: VideoFilters;
	cropAspectRatio: string | null;
	probeResult: ProbeResult | null;
	tracks: TrackSelection;
	resize: ResizeSettings;
	trimInputMode: TrimInputMode;
	advancedSettings: AdvancedVideoSettings;
	useCustomExport: boolean;

	setMode: (mode: VideoMode) => void;
	setFilter: <K extends keyof VideoFilters>(key: K, value: VideoFilters[K]) => void;
	resetFilters: () => void;
	setCropAspectRatio: (ratio: string | null) => void;
	setProbeResult: (result: ProbeResult | null) => void;
	setTracks: (tracks: Partial<TrackSelection>) => void;
	setResize: (resize: Partial<ResizeSettings>) => void;
	setTrimInputMode: (mode: TrimInputMode) => void;
	setAdvancedSettings: (settings: AdvancedVideoSettings) => void;
	setUseCustomExport: (v: boolean) => void;
	resetAll: () => void;

	cssFilter: () => string;
	ffmpegFilterArgs: () => string[];
	resizeFilterArgs: () => string[];
	trackArgs: () => string[];
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
	mode: 'presets',
	filters: { ...DEFAULT_VIDEO_FILTERS },
	cropAspectRatio: null,
	probeResult: null,
	tracks: { ...DEFAULT_TRACK_SELECTION },
	resize: { ...DEFAULT_RESIZE },
	trimInputMode: 'time',
	advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS },
	useCustomExport: false,

	setMode: (mode) => set({ mode }),

	setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),

	resetFilters: () => set({ filters: { ...DEFAULT_VIDEO_FILTERS } }),

	setCropAspectRatio: (ratio) => set({ cropAspectRatio: ratio }),

	setProbeResult: (result) => set({ probeResult: result }),

	setTracks: (partial) => set((s) => ({ tracks: { ...s.tracks, ...partial } })),

	setResize: (partial) =>
		set((s) => {
			const next = { ...s.resize, ...partial };
			if (next.lockAspect && next.originalWidth > 0 && next.originalHeight > 0) {
				const aspect = next.originalWidth / next.originalHeight;
				if ('width' in partial && partial.width !== undefined) {
					next.height = Math.round(next.width / aspect);
				} else if ('height' in partial && partial.height !== undefined) {
					next.width = Math.round(next.height * aspect);
				} else if ('scalePercent' in partial && partial.scalePercent !== undefined) {
					next.width = Math.round(next.originalWidth * (next.scalePercent / 100));
					next.height = Math.round(next.originalHeight * (next.scalePercent / 100));
				}
			}
			if (next.originalWidth > 0 && next.originalHeight > 0) {
				next.scalePercent = Math.round((next.width / next.originalWidth) * 100);
			}
			return { resize: next };
		}),

	setTrimInputMode: (mode) => set({ trimInputMode: mode }),

	setAdvancedSettings: (settings) => set({ advancedSettings: settings }),

	setUseCustomExport: (v) => set({ useCustomExport: v }),

	resetAll: () =>
		set({
			mode: 'presets',
			filters: { ...DEFAULT_VIDEO_FILTERS },
			cropAspectRatio: null,
			probeResult: null,
			tracks: { ...DEFAULT_TRACK_SELECTION },
			resize: { ...DEFAULT_RESIZE },
			trimInputMode: 'time',
			advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS },
			useCustomExport: false,
		}),

	cssFilter: () => {
		const { brightness, contrast, saturation, hue } = get().filters;
		const parts: string[] = [];
		if (brightness !== 0) parts.push(`brightness(${1 + brightness})`);
		if (contrast !== 1) parts.push(`contrast(${contrast})`);
		if (saturation !== 1) parts.push(`saturate(${saturation})`);
		if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
		return parts.length > 0 ? parts.join(' ') : 'none';
	},

	ffmpegFilterArgs: () => {
		const { brightness, contrast, saturation } = get().filters;
		const needsEq = brightness !== 0 || contrast !== 1 || saturation !== 1;
		if (!needsEq) return [];
		return [`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`];
	},

	resizeFilterArgs: () => {
		const { resize } = get();
		if (
			resize.width <= 0 ||
			resize.height <= 0 ||
			(resize.width === resize.originalWidth && resize.height === resize.originalHeight)
		) {
			return [];
		}
		return [`scale=${resize.width}:${resize.height}:flags=lanczos`];
	},

	trackArgs: () => {
		const { tracks, probeResult } = get();
		const args: string[] = [];

		if (!tracks.audioEnabled) {
			args.push('-an');
		} else if (probeResult) {
			const audioStreams = probeResult.streams.filter((s) => s.type === 'audio');
			if (audioStreams.length > 1) {
				const stream = audioStreams[tracks.audioTrackIndex];
				if (stream) args.push('-map', `0:${stream.index}`);
			}
		}

		if (!tracks.subtitleEnabled) {
			args.push('-sn');
		} else if (probeResult) {
			const subStreams = probeResult.streams.filter((s) => s.type === 'subtitle');
			if (subStreams.length > 1) {
				const stream = subStreams[tracks.subtitleTrackIndex];
				if (stream) args.push('-map', `0:${stream.index}`);
			}
		}

		return args;
	},
}));
