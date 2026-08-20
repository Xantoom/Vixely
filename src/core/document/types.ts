/**
 * Document models (D4).
 *
 * A document describes *an edit*, never the media itself. It is a plain JSON
 * value: no class, no closure, no Map/Set/Blob/VideoFrame. Source media is
 * referenced by id; the bytes live in core/resources.
 */

export type SourceRef = {
	readonly id: string;
	readonly name: string;
	readonly byteLength: number;
	readonly mimeType: string;
};

export type Rotation = 0 | 90 | 180 | 270;

export type CropRegion = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type ResampleAlgorithm = "nearest" | "bilinear" | "bicubic" | "lanczos";

export type ResizeSpec = {
	readonly width: number;
	readonly height: number;
	readonly algorithm: ResampleAlgorithm;
};

/**
 * One unified filter shape shared by every editor. Values are neutral at their
 * defaults, which is what lets the render graph short-circuit to a copy pass.
 */
export type FilterParams = {
	readonly brightness: number;
	readonly contrast: number;
	readonly saturation: number;
	readonly exposure: number;
	readonly temperature: number;
	readonly tint: number;
	readonly gamma: number;
	readonly highlights: number;
	readonly shadows: number;
	readonly vibrance: number;
	readonly hueRotate: number;
	readonly sharpen: number;
	readonly blur: number;
	readonly vignette: number;
	readonly grayscale: number;
	readonly sepia: number;
	readonly invert: number;
	readonly opacity: number;
};

export type TextAlign = "left" | "center" | "right";

export type TextLayer = {
	readonly id: string;
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly fontWeight: number;
	readonly italic: boolean;
	readonly color: string;
	readonly align: TextAlign;
	readonly rotation: number;
	readonly opacity: number;
	readonly strokeColor: string | null;
	readonly strokeWidth: number;
	readonly shadowColor: string | null;
	readonly shadowBlur: number;
	readonly shadowOffsetX: number;
	readonly shadowOffsetY: number;
	readonly backgroundColor: string | null;
	readonly letterSpacing: number;
	readonly lineHeight: number;
};

export type ImageFormat = "png" | "jpeg" | "webp" | "avif";

export type ImageExportSpec = {
	readonly format: ImageFormat;
	readonly quality: number;
	readonly keepMetadata: boolean;
	readonly maxDimension: number | null;
};

export type ImageDocument = {
	readonly kind: "image";
	readonly version: 1;
	readonly source: SourceRef;
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly crop: CropRegion | null;
	readonly resize: ResizeSpec | null;
	readonly rotation: Rotation;
	readonly flipHorizontal: boolean;
	readonly flipVertical: boolean;
	readonly filters: FilterParams;
	readonly textLayers: readonly TextLayer[];
	readonly export: ImageExportSpec;
};

export type GifFrame = {
	readonly id: string;
	readonly sourceIndex: number;
	readonly delayMs: number;
};

export type GifDither = "none" | "floyd-steinberg" | "bayer";

export type GifExportSpec = {
	readonly format: "gif" | "webp" | "apng" | "mp4" | "webm";
	readonly paletteScope: "global" | "per-frame";
	readonly colors: number;
	readonly dither: GifDither;
	readonly loop: number;
	readonly quality: number;
};

export type GifDocument = {
	readonly kind: "gif";
	readonly version: 1;
	readonly source: SourceRef;
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly frames: readonly GifFrame[];
	readonly crop: CropRegion | null;
	readonly resize: ResizeSpec | null;
	readonly rotation: Rotation;
	readonly filters: FilterParams;
	readonly textLayers: readonly TextLayer[];
	readonly export: GifExportSpec;
};

export type AudioCodec =
	| "aac"
	| "opus"
	| "mp3"
	| "vorbis"
	| "flac"
	| "ac3"
	| "eac3"
	| "dts"
	| "pcm-s16"
	| "pcm-s24"
	| "pcm-f32";

export type AudioSegment = {
	readonly id: string;
	readonly sourceId: string;
	readonly startSec: number;
	readonly endSec: number;
	readonly gainDb: number;
	readonly fadeInSec: number;
	readonly fadeOutSec: number;
};

export type EqualizerBand = {
	readonly id: string;
	readonly type: "lowshelf" | "peaking" | "highshelf" | "lowpass" | "highpass" | "notch";
	readonly frequency: number;
	readonly gainDb: number;
	readonly q: number;
	readonly enabled: boolean;
};

export type LoudnessTarget = {
	readonly enabled: boolean;
	readonly targetLufs: number;
	readonly truePeakDb: number;
};

export type AudioExportSpec = {
	readonly container: "mp4" | "mkv" | "webm" | "ogg" | "mp3" | "wav" | "flac" | "aac";
	readonly codec: AudioCodec;
	readonly quality: number;
	readonly sampleRate: number | null;
	readonly channels: number | null;
};

export type AudioDocument = {
	readonly kind: "audio";
	readonly version: 1;
	readonly source: SourceRef;
	readonly durationSec: number;
	readonly selectedTrackId: number;
	readonly segments: readonly AudioSegment[];
	readonly equalizer: readonly EqualizerBand[];
	readonly loudness: LoudnessTarget;
	readonly export: AudioExportSpec;
};

export type SubtitleFormat = "srt" | "vtt" | "ass" | "pgs";

export type SubtitleCue = {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly text: string;
	readonly styleName: string | null;
	readonly layer: number;
	readonly marginLeft: number | null;
	readonly marginRight: number | null;
	readonly marginVertical: number | null;
	readonly effect: string | null;
};

export type AssStyle = {
	readonly name: string;
	readonly fontName: string;
	readonly fontSize: number;
	readonly primaryColour: string;
	readonly secondaryColour: string;
	readonly outlineColour: string;
	readonly backColour: string;
	readonly bold: boolean;
	readonly italic: boolean;
	readonly underline: boolean;
	readonly strikeOut: boolean;
	readonly scaleX: number;
	readonly scaleY: number;
	readonly spacing: number;
	readonly angle: number;
	readonly borderStyle: number;
	readonly outline: number;
	readonly shadow: number;
	readonly alignment: number;
	readonly marginL: number;
	readonly marginR: number;
	readonly marginV: number;
	readonly encoding: number;
};

export type SubtitleDocument = {
	readonly kind: "subtitles";
	readonly version: 1;
	readonly source: SourceRef;
	readonly format: SubtitleFormat;
	readonly cues: readonly SubtitleCue[];
	readonly styles: readonly AssStyle[];
	readonly scriptInfo: Readonly<Record<string, string>>;
	readonly timeOffsetMs: number;
	readonly export: { readonly format: SubtitleFormat };
};

export type VideoCodec = "avc" | "hevc" | "vp8" | "vp9" | "av1" | "prores";

export type TrackSelection = {
	readonly trackId: number;
	readonly enabled: boolean;
	readonly label: string | null;
	readonly language: string | null;
	readonly action: "copy" | "reencode" | "drop";
};

export type VideoExportSpec = {
	readonly container: "mp4" | "mkv" | "webm" | "mov";
	readonly codec: VideoCodec;
	readonly quality: number;
	readonly rateControl: "quality" | "target-bitrate";
	readonly targetBitrate: number | null;
	readonly width: number | null;
	readonly height: number | null;
	readonly frameRate: number | null;
	readonly keyframeIntervalSec: number;
	readonly subtitleMode: "embed" | "burn-in" | "sidecar" | "none";
	readonly fastStart: boolean;
};

export type VideoDocument = {
	readonly kind: "video";
	readonly version: 1;
	readonly source: SourceRef;
	readonly durationSec: number;
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly trimStartSec: number;
	readonly trimEndSec: number;
	readonly crop: CropRegion | null;
	readonly rotation: Rotation;
	readonly filters: FilterParams;
	readonly textLayers: readonly TextLayer[];
	readonly videoTracks: readonly TrackSelection[];
	readonly audioTracks: readonly TrackSelection[];
	readonly subtitleTracks: readonly TrackSelection[];
	readonly export: VideoExportSpec;
};

export type AnyDocument =
	| ImageDocument
	| GifDocument
	| AudioDocument
	| SubtitleDocument
	| VideoDocument;

export type DocumentKind = AnyDocument["kind"];
