import { create } from 'zustand';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { DEFAULT_FILTER_PARAMS, filtersAreDefault } from '@/modules/shared-core/types/filters.ts';
import { withUpdatedKey } from '@/stores/storeHelpers.ts';

export type VideoMode = 'presets' | 'trim' | 'resize' | 'adjust' | 'export';

export type VideoRateControlMode = 'crf' | 'bitrate' | 'qp';

export interface AdvancedVideoSettings {
	codec: string;
	container: string;
	rateControl: VideoRateControlMode;
	crf: number;
	targetBitrateKbps: number;
	qp: number;
	preset: string;
	audioCodec: string;
	audioBitrate: string;
}

export type TrimInputMode = 'time' | 'frames';

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
	title?: string;
	bitrate?: number;
	isDefault?: boolean;
	isForced?: boolean;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface ProbeMediaTags {
	title?: string;
	artist?: string;
	album?: string;
	comment?: string;
	description?: string;
	date?: string;
	encoder?: string;
	genre?: string;
	copyright?: string;
	language?: string;
}

export interface ProbeCoverArt {
	mimeType: string;
	dataUrl: string;
	description?: string;
	size: number;
}

export interface ProbeResult {
	duration: number;
	bitrate: number;
	format: string;
	streams: StreamInfo[];
	tags?: ProbeMediaTags;
	coverArt?: ProbeCoverArt;
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
	cropOffsetX: number;
	cropOffsetY: number;
}

export const DEFAULT_RESIZE: ResizeSettings = {
	width: 0,
	height: 0,
	originalWidth: 0,
	originalHeight: 0,
	scalePercent: 100,
	lockAspect: false,
	cropOffsetX: 0,
	cropOffsetY: 0,
};

export type VideoRotation = 0 | 90 | 180 | 270;

export interface VideoTransform {
	rotate: VideoRotation;
	flipH: boolean;
	flipV: boolean;
}

export const DEFAULT_TRANSFORM: VideoTransform = { rotate: 0, flipH: false, flipV: false };

export const DEFAULT_TRACK_SELECTION: TrackSelection = {
	audioEnabled: true,
	subtitleEnabled: false,
	audioTrackIndex: 0,
	subtitleTrackIndex: 0,
};

export const DEFAULT_ADVANCED_SETTINGS: AdvancedVideoSettings = {
	codec: 'libx264',
	container: 'mp4',
	rateControl: 'crf',
	crf: 23,
	targetBitrateKbps: 2500,
	qp: 28,
	preset: 'veryfast',
	audioCodec: 'aac',
	audioBitrate: '96k',
};

function splitMediaStreamsByType(streams: StreamInfo[]): { audio: StreamInfo[]; subtitle: StreamInfo[] } {
	const audio: StreamInfo[] = [];
	const subtitle: StreamInfo[] = [];
	for (const stream of streams) {
		if (stream.type === 'audio') {
			audio.push(stream);
		} else if (stream.type === 'subtitle') {
			subtitle.push(stream);
		}
	}
	return { audio, subtitle };
}

export interface VideoEditorState {
	mode: VideoMode;
	filters: FilterParams;
	cropAspectRatio: string | null;
	probeResult: ProbeResult | null;
	tracks: TrackSelection;
	resize: ResizeSettings;
	trimInputMode: TrimInputMode;
	advancedSettings: AdvancedVideoSettings;
	comparePosition: number;
	transform: VideoTransform;

	setMode: (mode: VideoMode) => void;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
	resetFilters: () => void;
	hasFilterChanges: () => boolean;
	setCropAspectRatio: (ratio: string | null) => void;
	setProbeResult: (result: ProbeResult | null) => void;
	setTracks: (tracks: Partial<TrackSelection>) => void;
	setResize: (resize: Partial<ResizeSettings>) => void;
	setTrimInputMode: (mode: TrimInputMode) => void;
	setAdvancedSettings: (settings: AdvancedVideoSettings) => void;
	setComparePosition: (position: number) => void;
	setTransform: (transform: Partial<VideoTransform>) => void;
	resetTransform: () => void;
	resetAll: () => void;

	encoderFilterArgs: () => string[];
	resizeFilterArgs: () => string[];
	trackArgs: () => string[];
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
	mode: 'presets',
	filters: { ...DEFAULT_FILTER_PARAMS },
	cropAspectRatio: null,
	probeResult: null,
	tracks: { ...DEFAULT_TRACK_SELECTION },
	resize: { ...DEFAULT_RESIZE },
	trimInputMode: 'time',
	advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS },
	comparePosition: 0.5,
	transform: { ...DEFAULT_TRANSFORM },

	setMode: (mode) => {
		set({ mode });
	},

	setFilter: (key, value) => {
		set((s) => ({ filters: withUpdatedKey(s.filters, key, value) }));
	},

	resetFilters: () => {
		set({ filters: { ...DEFAULT_FILTER_PARAMS } });
	},

	hasFilterChanges: () => {
		return !filtersAreDefault(get().filters);
	},

	setCropAspectRatio: (ratio) => {
		set({ cropAspectRatio: ratio });
	},

	setProbeResult: (result) => {
		set({ probeResult: result });
	},

	setTracks: (partial) => {
		set((s) => ({ tracks: { ...s.tracks, ...partial } }));
	},

	setResize: (partial) => {
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
				next.width = Math.min(next.originalWidth, Math.max(1, next.width));
				next.height = Math.min(next.originalHeight, Math.max(1, next.height));
				next.scalePercent = Math.round((next.width / next.originalWidth) * 100);
				const maxOffsetX = (next.originalWidth - next.width) / 2;
				const maxOffsetY = (next.originalHeight - next.height) / 2;
				next.cropOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, next.cropOffsetX ?? 0));
				next.cropOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, next.cropOffsetY ?? 0));
			}
			return { resize: next };
		});
	},

	setTrimInputMode: (mode) => {
		set({ trimInputMode: mode });
	},

	setAdvancedSettings: (settings) => {
		set({ advancedSettings: settings });
	},

	setComparePosition: (position) => {
		set({ comparePosition: position });
	},

	setTransform: (partial) => {
		set((s) => ({ transform: { ...s.transform, ...partial } }));
	},

	resetTransform: () => {
		set({ transform: { ...DEFAULT_TRANSFORM } });
	},

	resetAll: () => {
		set({
			mode: 'presets',
			filters: { ...DEFAULT_FILTER_PARAMS },
			cropAspectRatio: null,
			probeResult: null,
			tracks: { ...DEFAULT_TRACK_SELECTION },
			resize: { ...DEFAULT_RESIZE },
			trimInputMode: 'time',
			advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS },
			comparePosition: 0.5,
			transform: { ...DEFAULT_TRANSFORM },
		});
	},

	encoderFilterArgs: () => {
		const f = get().filters;
		const parts: string[] = [];

		// eq filter: brightness, contrast, saturation
		const needsEq = f.brightness !== 0 || f.contrast !== 1 || f.saturation !== 1;
		if (needsEq) {
			parts.push(`eq=brightness=${f.brightness}:contrast=${f.contrast}:saturation=${f.saturation}`);
		}

		// hue filter (not supported by eq)
		if (f.hue !== 0) {
			parts.push(`hue=h=${f.hue}`);
		}

		// colortemperature filter
		if (f.temperature !== 0) {
			// Map -1..1 range to 1000..13000K (6500K = neutral)
			const kelvin = Math.round(6500 + f.temperature * 3500);
			parts.push(`colortemperature=temperature=${kelvin}`);
		}

		// colorbalance for tint (green-magenta shift)
		if (f.tint !== 0) {
			const val = f.tint.toFixed(2);
			parts.push(`colorbalance=rs=${val}:gs=-${val}:bs=${val}:rm=${val}:gm=-${val}:bm=${val}`);
		}

		// exposure via curves (approximate EV stops)
		if (f.exposure !== 1) {
			const factor = f.exposure;
			parts.push(`curves=all='0/0 ${(0.5 / factor).toFixed(3)}/0.5 ${(1 / factor).toFixed(3)}/1'`);
		}

		// highlights/shadows via curves
		if (f.highlights !== 0 || f.shadows !== 0) {
			const sP = Math.max(0, Math.min(1, 0.25 + f.shadows * 0.15));
			const hP = Math.max(0, Math.min(1, 0.75 + f.highlights * 0.15));
			parts.push(`curves=all='0/${sP.toFixed(3)} 0.5/0.5 1/${hP.toFixed(3)}'`);
		}

		// sepia (colorchannelmixer)
		if (f.sepia > 0) {
			const s = f.sepia;
			const inv = 1 - s;
			parts.push(
				`colorchannelmixer=${(inv + s * 0.393).toFixed(3)}:${(s * 0.769).toFixed(3)}:${(s * 0.189).toFixed(3)}:0:${(s * 0.349).toFixed(3)}:${(inv + s * 0.686).toFixed(3)}:${(s * 0.168).toFixed(3)}:0:${(s * 0.272).toFixed(3)}:${(s * 0.534).toFixed(3)}:${(inv + s * 0.131).toFixed(3)}:0`,
			);
		}

		// blur (boxblur)
		if (f.blur > 0) {
			const r = Math.round(f.blur);
			parts.push(`boxblur=${r}:${r}`);
		}

		// vignette
		if (f.vignette > 0) {
			const angle = (f.vignette * Math.PI) / 4;
			parts.push(`vignette=angle=${angle.toFixed(3)}`);
		}

		// grain (noise)
		if (f.grain > 0) {
			const strength = Math.round(f.grain);
			parts.push(`noise=alls=${strength}:allf=t`);
		}

		// rotation / flip (emitted using a compact filter-chain syntax the worker parses and
		// routes through Mediabunny's native `rotate` option and the flip process callback)
		const { transform } = get();
		if (transform.rotate === 90) parts.push('transpose=1');
		else if (transform.rotate === 180) parts.push('transpose=1,transpose=1');
		else if (transform.rotate === 270) parts.push('transpose=2');
		if (transform.flipH) parts.push('hflip');
		if (transform.flipV) parts.push('vflip');

		return parts;
	},

	resizeFilterArgs: () => {
		const { resize } = get();
		if (resize.width <= 0 || resize.height <= 0 || resize.originalWidth <= 0 || resize.originalHeight <= 0) {
			return [];
		}
		const sameSize = resize.width === resize.originalWidth && resize.height === resize.originalHeight;
		const noOffset = (resize.cropOffsetX ?? 0) === 0 && (resize.cropOffsetY ?? 0) === 0;
		if (sameSize && noOffset) return [];
		const cx = Math.round((resize.originalWidth - resize.width) / 2 + (resize.cropOffsetX ?? 0));
		const cy = Math.round((resize.originalHeight - resize.height) / 2 + (resize.cropOffsetY ?? 0));
		return [`crop=${resize.width}:${resize.height}:${cx}:${cy}`];
	},

	trackArgs: () => {
		const { tracks, probeResult } = get();
		const args: string[] = [];
		const streamsByType = probeResult ? splitMediaStreamsByType(probeResult.streams) : null;

		if (!tracks.audioEnabled) {
			args.push('-an');
		} else if (streamsByType) {
			const audioStreams = streamsByType.audio;
			if (audioStreams.length > 1) {
				const stream = audioStreams[tracks.audioTrackIndex];
				if (stream) args.push('-map', `0:${stream.index}`);
			}
		}

		if (!tracks.subtitleEnabled) {
			args.push('-sn');
		} else if (streamsByType) {
			const subStreams = streamsByType.subtitle;
			if (subStreams.length > 1) {
				const stream = subStreams[tracks.subtitleTrackIndex];
				if (stream) args.push('-map', `0:${stream.index}`);
			}
		}

		return args;
	},
}));
