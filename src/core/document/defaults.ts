import type {
	AudioDocument,
	FilterParams,
	GifDocument,
	ImageDocument,
	SourceRef,
	SubtitleDocument,
	VideoDocument,
} from "./types.ts";

/** Neutral filter values. `isIdentity` against these drives the short-circuit pass. */
export const NEUTRAL_FILTERS: FilterParams = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	exposure: 0,
	temperature: 0,
	tint: 0,
	gamma: 1,
	highlights: 0,
	shadows: 0,
	vibrance: 0,
	hueRotate: 0,
	sharpen: 0,
	blur: 0,
	vignette: 0,
	grayscale: 0,
	sepia: 0,
	invert: 0,
	opacity: 1,
};

export const FILTER_KEYS = Object.keys(NEUTRAL_FILTERS) as ReadonlyArray<keyof FilterParams>;

/** Display range and step of every filter, shared by the UI and by validation. */
export const FILTER_RANGES: Readonly<
	Record<keyof FilterParams, { min: number; max: number; step: number }>
> = {
	brightness: { min: -1, max: 1, step: 0.01 },
	contrast: { min: -1, max: 1, step: 0.01 },
	saturation: { min: -1, max: 1, step: 0.01 },
	exposure: { min: -4, max: 4, step: 0.05 },
	temperature: { min: -1, max: 1, step: 0.01 },
	tint: { min: -1, max: 1, step: 0.01 },
	gamma: { min: 0.1, max: 4, step: 0.01 },
	highlights: { min: -1, max: 1, step: 0.01 },
	shadows: { min: -1, max: 1, step: 0.01 },
	vibrance: { min: -1, max: 1, step: 0.01 },
	hueRotate: { min: -180, max: 180, step: 1 },
	sharpen: { min: 0, max: 2, step: 0.01 },
	blur: { min: 0, max: 20, step: 0.1 },
	vignette: { min: 0, max: 1, step: 0.01 },
	grayscale: { min: 0, max: 1, step: 0.01 },
	sepia: { min: 0, max: 1, step: 0.01 },
	invert: { min: 0, max: 1, step: 0.01 },
	opacity: { min: 0, max: 1, step: 0.01 },
};

export function isIdentityFilters(filters: FilterParams): boolean {
	return FILTER_KEYS.every((key) => filters[key] === NEUTRAL_FILTERS[key]);
}

export function createImageDocument(
	source: SourceRef,
	width: number,
	height: number,
): ImageDocument {
	return {
		kind: "image",
		version: 1,
		source,
		sourceWidth: width,
		sourceHeight: height,
		crop: null,
		resize: null,
		rotation: 0,
		flipHorizontal: false,
		flipVertical: false,
		filters: NEUTRAL_FILTERS,
		textLayers: [],
		export: { format: "png", quality: 0.9, keepMetadata: false, maxDimension: null },
	};
}

export function createGifDocument(source: SourceRef, width: number, height: number): GifDocument {
	return {
		kind: "gif",
		version: 1,
		source,
		sourceWidth: width,
		sourceHeight: height,
		frames: [],
		crop: null,
		resize: null,
		rotation: 0,
		filters: NEUTRAL_FILTERS,
		textLayers: [],
		export: {
			format: "gif",
			paletteScope: "global",
			colors: 256,
			dither: "floyd-steinberg",
			loop: 0,
			quality: 0.9,
		},
	};
}

export function createAudioDocument(source: SourceRef, durationSec: number): AudioDocument {
	return {
		kind: "audio",
		version: 1,
		source,
		durationSec,
		selectedTrackId: 0,
		segments: [],
		equalizer: [],
		loudness: { enabled: false, targetLufs: -14, truePeakDb: -1 },
		export: { container: "mp4", codec: "aac", quality: 0.7, sampleRate: null, channels: null },
	};
}

export function createSubtitleDocument(source: SourceRef): SubtitleDocument {
	return {
		kind: "subtitles",
		version: 1,
		source,
		format: "srt",
		cues: [],
		styles: [],
		scriptInfo: {},
		timeOffsetMs: 0,
		export: { format: "srt" },
	};
}

export function createVideoDocument(
	source: SourceRef,
	durationSec: number,
	width: number,
	height: number,
): VideoDocument {
	return {
		kind: "video",
		version: 1,
		source,
		durationSec,
		sourceWidth: width,
		sourceHeight: height,
		trimStartSec: 0,
		trimEndSec: durationSec,
		crop: null,
		rotation: 0,
		filters: NEUTRAL_FILTERS,
		textLayers: [],
		videoTracks: [],
		audioTracks: [],
		subtitleTracks: [],
		export: {
			container: "mp4",
			codec: "avc",
			quality: 0.7,
			rateControl: "quality",
			targetBitrate: null,
			width: null,
			height: null,
			frameRate: null,
			keyframeIntervalSec: 2,
			subtitleMode: "embed",
			fastStart: true,
		},
	};
}
