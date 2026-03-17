import { aggregatedPresets as data } from './presets/index.ts';

// ── Types ──

export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type VideoCodec = 'libaom-av1' | 'libvpx-vp9' | 'libx265' | 'libx264';
export type AudioCodec = 'aac' | 'libopus';

export interface VideoPreset {
	name: string;
	description: string;
	maxSizeMB: number | null;
	maxDisplayWidth?: number;
	format: VideoContainer;
	ffmpegArgs: string[];
	width: number | null;
	height: number | null;
	allowedVideoCodecs?: VideoCodec[];
	allowedContainers?: VideoContainer[];
	allowedAudioCodecs?: AudioCodec[];
	recommendedAudioBitrateKbps?: number;
}

export interface ImagePreset {
	name: string;
	description: string;
	width: number | null;
	height: number | null;
	format: 'png' | 'webp' | 'jpeg';
	exportFormat?: 'png' | 'jpeg' | 'webp';
	exportQuality?: number;
}

export interface GifPreset {
	name: string;
	description: string;
	width: number;
	fps: number;
	maxDuration: number | null;
}

export interface FilterPreset {
	name: string;
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

export interface PresetConfig {
	video: Record<string, VideoPreset>;
	image: Record<string, ImagePreset>;
	gif: Record<string, GifPreset>;
	filters: Record<string, FilterPreset>;
}

// ── Data ──

export const presets: PresetConfig = data;

const videoPresets = presets.video;
const imagePresets = presets.image;
const gifPresets = presets.gif;
const filterPresets = presets.filters;

// ── Helpers ──

export function videoPresetEntries(): [string, VideoPreset][] {
	return Object.entries(videoPresets);
}

export function imagePresetEntries(): [string, ImagePreset][] {
	return Object.entries(imagePresets);
}

export function gifPresetEntries(): [string, GifPreset][] {
	return Object.entries(gifPresets);
}

export function filterPresetEntries(): [string, FilterPreset][] {
	return Object.entries(filterPresets);
}

interface BuildVideoArgsOptions {
	sourceSizeBytes?: number;
	inputWidth?: number;
	inputHeight?: number;
	inputFps?: number;
	includeAudio?: boolean;
	sourceAudioCodecs?: string[];
	sourceAudioMaxBitrateKbps?: number;
	sourceAudioTotalBitrateKbps?: number;
	sourceAudioTrackCount?: number;
}

interface BuildVideoArgsResult {
	args: string[];
	format: VideoContainer;
	selectedVideoCodec: VideoCodec;
	selectedAudioCodec: AudioCodec;
	recommendedAudioBitrateKbps: number;
	shouldReencodeAudio: boolean;
	maxSizeBytes: number | null;
	targetVideoBitrateKbps: number | null;
	selectedWidth: number | null;
	selectedHeight: number | null;
	fallbackWidth: number | null;
	fallbackHeight: number | null;
}

const VIDEO_CODEC_PRIORITY: VideoCodec[] = ['libaom-av1', 'libvpx-vp9', 'libx265', 'libx264'];
const AVAILABLE_VIDEO_CODECS: VideoCodec[] = ['libvpx-vp9', 'libx265', 'libx264'];
const VIDEO_CODEC_CONTAINER_SUPPORT: Record<VideoCodec, VideoContainer[]> = {
	'libaom-av1': ['mp4', 'mkv', 'webm'],
	'libvpx-vp9': ['webm'],
	libx265: ['mp4', 'mkv'],
	libx264: ['mp4', 'mkv'],
};
const VIDEO_CODEC_CONTAINER_PREFERENCE: Record<VideoCodec, VideoContainer[]> = {
	'libaom-av1': ['mp4', 'mkv', 'webm'],
	'libvpx-vp9': ['webm'],
	libx265: ['mp4', 'mkv'],
	libx264: ['mp4', 'mkv'],
};
const AUDIO_CODEC_CONTAINER_SUPPORT: Record<AudioCodec, VideoContainer[]> = {
	aac: ['mp4', 'mkv'],
	libopus: ['webm', 'mkv', 'mp4'],
};
const AUDIO_CODEC_CONTAINER_PREFERENCE: Record<VideoContainer, AudioCodec[]> = {
	mp4: ['aac', 'libopus'],
	mkv: ['aac', 'libopus'],
	webm: ['libopus', 'aac'],
};
const RATE_CONTROL_FLAGS = new Set(['-crf', '-qp', '-b:v', '-maxrate', '-bufsize', '-minrate', '-qmin', '-qmax']);
const VIDEO_CODEC_FLAGS = new Set(['-c:v', '-preset', '-tag:v', '-x265-params', '-cpu-used', '-row-mt']);

function unique<T>(values: T[]): T[] {
	return Array.from(new Set(values));
}

function isVideoCodec(value: string): value is VideoCodec {
	return value === 'libaom-av1' || value === 'libvpx-vp9' || value === 'libx265' || value === 'libx264';
}

function isVideoContainer(value: string): value is VideoContainer {
	return value === 'mp4' || value === 'mkv' || value === 'webm';
}

function isAudioCodec(value: string): value is AudioCodec {
	return value === 'aac' || value === 'libopus';
}

function containerPriorityFromPreferred(preferred: VideoContainer): VideoContainer[] {
	const defaultOrder: VideoContainer[] = ['mp4', 'mkv', 'webm'];
	return [preferred, ...defaultOrder.filter((entry) => entry !== preferred)];
}

function stripRateControlArgs(args: string[]): string[] {
	const stripped: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const token = args[i]!;
		if (RATE_CONTROL_FLAGS.has(token)) {
			i++;
			continue;
		}
		stripped.push(token);
	}
	return stripped;
}

function stripVideoCodecArgs(args: string[]): string[] {
	const stripped: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const token = args[i]!;
		if (VIDEO_CODEC_FLAGS.has(token)) {
			i++;
			continue;
		}
		stripped.push(token);
	}
	return stripped;
}

function findArgValue(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1) return null;
	return args[idx + 1] ?? null;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function computeTargetVideoBitrateKbps(
	maxSizeMB: number,
	clipDurationSec: number,
	plannedAudioBitrateKbps: number,
): number {
	const clipSec = Math.max(clipDurationSec, 0.5);
	const safetyMargin = clipSec < 5 ? 0.85 : 0.9;
	const targetTotalBytes = maxSizeMB * 1024 * 1024 * safetyMargin;
	const audioBytes = (plannedAudioBitrateKbps * 1000 * clipSec) / 8;
	const muxOverheadBytes = targetTotalBytes * 0.02;
	const availableVideoBytes = targetTotalBytes - audioBytes - muxOverheadBytes;
	const targetVideoKbps = Math.floor((availableVideoBytes * 8) / (clipSec * 1000));
	return Math.max(64, targetVideoKbps);
}

// ── Resolution optimization ──

const RESOLUTION_STEPS = [
	{ w: 3840, h: 2160 },
	{ w: 2560, h: 1440 },
	{ w: 1920, h: 1080 },
	{ w: 1600, h: 900 },
	{ w: 1280, h: 720 },
	{ w: 960, h: 540 },
	{ w: 854, h: 480 },
	{ w: 640, h: 360 },
];

const MIN_BPP_BY_CODEC: Record<string, number> = {
	libx264: 0.04,
	libx265: 0.025,
	'libvpx-vp9': 0.02,
	'libaom-av1': 0.018,
};

const DEFAULT_MIN_FLOOR_WIDTH = 360;

function computeBpp(bitrateKbps: number, width: number, height: number, fps: number): number {
	return (bitrateKbps * 1000) / (width * height * fps);
}

/**
 * Iterate RESOLUTION_STEPS yielding aspect-ratio-corrected, even-dimension candidates
 * strictly smaller than the given bounds and not below the floor width.
 */
function* candidateResolutions(
	belowWidth: number,
	belowHeight: number,
	aspectRatio: number,
	maxDisplayWidth: number | undefined,
): Generator<{ width: number; height: number }> {
	const floorWidth = maxDisplayWidth ?? DEFAULT_MIN_FLOOR_WIDTH;
	const isPortrait = belowHeight > belowWidth;

	for (const step of RESOLUTION_STEPS) {
		const stepW = isPortrait ? Math.round(step.h * aspectRatio) : step.w;
		const stepH = isPortrait ? step.h : Math.round(step.w / aspectRatio);

		// Don't upscale
		if (stepW >= belowWidth || stepH >= belowHeight) continue;

		// Don't go below platform display floor
		const shortSide = Math.min(stepW, stepH);
		if (shortSide < floorWidth && floorWidth < Math.min(belowWidth, belowHeight)) continue;

		const finalW = Math.max(2, Math.round(stepW / 2) * 2);
		const finalH = Math.max(2, Math.round(stepH / 2) * 2);
		yield { width: finalW, height: finalH };
	}
}

/**
 * Select the optimal resolution for a given bitrate budget.
 * Starts from the source resolution and steps down only if the
 * bits-per-pixel-per-frame would be too low for acceptable quality.
 * Never descends below maxDisplayWidth (platform display floor).
 * Never upscales.
 * Returns null if source resolution is already optimal.
 */
function selectOptimalResolution(
	targetBitrateKbps: number,
	inputWidth: number,
	inputHeight: number,
	fps: number,
	codec: VideoCodec,
	maxDisplayWidth: number | undefined,
): { width: number; height: number } | null {
	const minBpp = MIN_BPP_BY_CODEC[codec] ?? 0.04;
	const safeFps = clamp(fps || 30, 12, 120);
	const aspectRatio = inputWidth / inputHeight;

	// Check if source resolution already has sufficient bpp
	const sourceBpp = computeBpp(targetBitrateKbps, inputWidth, inputHeight, safeFps);
	if (sourceBpp >= minBpp) return null;

	for (const candidate of candidateResolutions(inputWidth, inputHeight, aspectRatio, maxDisplayWidth)) {
		const bpp = computeBpp(targetBitrateKbps, candidate.width, candidate.height, safeFps);
		if (bpp >= minBpp) return candidate;
	}

	// Couldn't find a step with enough bpp — use the floor resolution
	const floorWidth = maxDisplayWidth ?? DEFAULT_MIN_FLOOR_WIDTH;
	const isPortrait = inputHeight > inputWidth;
	const floorW = isPortrait ? Math.round(floorWidth * aspectRatio) : floorWidth;
	const floorH = isPortrait ? floorWidth : Math.round(floorWidth / aspectRatio);
	const finalFloorW = Math.max(2, Math.round(floorW / 2) * 2);
	const finalFloorH = Math.max(2, Math.round(floorH / 2) * 2);

	// Don't upscale
	if (finalFloorW >= inputWidth && finalFloorH >= inputHeight) return null;

	return { width: finalFloorW, height: finalFloorH };
}

/**
 * Find the next resolution step below the current one for retry fallback.
 */
function computeFallbackResolution(
	currentWidth: number,
	currentHeight: number,
	aspectRatio: number,
	maxDisplayWidth: number | undefined,
): { width: number; height: number } | null {
	for (const candidate of candidateResolutions(currentWidth, currentHeight, aspectRatio, maxDisplayWidth)) {
		return candidate;
	}
	return null;
}

function normalizeAllowedVideoCodecs(preset: VideoPreset): VideoCodec[] {
	const declared = (preset.allowedVideoCodecs ?? []).filter((codec): codec is VideoCodec => isVideoCodec(codec));
	const requested = declared.length > 0 ? unique(declared) : [...VIDEO_CODEC_PRIORITY];
	const available = requested.filter((codec) => AVAILABLE_VIDEO_CODECS.includes(codec));
	if (available.length > 0) return available;
	return [...AVAILABLE_VIDEO_CODECS];
}

function normalizeAllowedContainers(preset: VideoPreset): VideoContainer[] {
	const declared = (preset.allowedContainers ?? []).filter((container): container is VideoContainer =>
		isVideoContainer(container),
	);
	if (declared.length > 0) return unique(declared);
	return containerPriorityFromPreferred(preset.format);
}

function normalizeAllowedAudioCodecs(preset: VideoPreset): AudioCodec[] {
	const declared = (preset.allowedAudioCodecs ?? []).filter((codec): codec is AudioCodec => isAudioCodec(codec));
	if (declared.length > 0) return unique(declared);
	if (preset.format === 'webm') return ['libopus'];
	return ['aac', 'libopus'];
}

function selectVideoCodec(allowedCodecs: VideoCodec[], allowedContainers: VideoContainer[]): VideoCodec {
	const viableByPriority = VIDEO_CODEC_PRIORITY.find(
		(codec) =>
			allowedCodecs.includes(codec) &&
			VIDEO_CODEC_CONTAINER_SUPPORT[codec].some((container) => allowedContainers.includes(container)),
	);
	if (viableByPriority) return viableByPriority;
	for (const codec of allowedCodecs) {
		if (VIDEO_CODEC_CONTAINER_SUPPORT[codec].some((container) => allowedContainers.includes(container))) {
			return codec;
		}
	}
	return 'libx264';
}

function selectContainer(codec: VideoCodec, allowedContainers: VideoContainer[]): VideoContainer {
	const supported = VIDEO_CODEC_CONTAINER_SUPPORT[codec];
	for (const allowed of allowedContainers) {
		if (supported.includes(allowed)) return allowed;
	}
	for (const preferred of VIDEO_CODEC_CONTAINER_PREFERENCE[codec]) {
		if (allowedContainers.includes(preferred) && supported.includes(preferred)) return preferred;
	}
	return supported[0] ?? 'mp4';
}

function selectAudioCodec(container: VideoContainer, allowedCodecs: AudioCodec[]): AudioCodec {
	const preferred = AUDIO_CODEC_CONTAINER_PREFERENCE[container];
	for (const codec of preferred) {
		if (allowedCodecs.includes(codec) && AUDIO_CODEC_CONTAINER_SUPPORT[codec].includes(container)) return codec;
	}
	for (const codec of allowedCodecs) {
		if (AUDIO_CODEC_CONTAINER_SUPPORT[codec].includes(container)) return codec;
	}
	return container === 'webm' ? 'libopus' : 'aac';
}

function buildVideoCodecArgs(codec: VideoCodec, container: VideoContainer, basePresetArgs: string[]): string[] {
	const args: string[] = ['-c:v', codec];
	const legacyPreset = findArgValue(basePresetArgs, '-preset') ?? 'fast';
	if (codec === 'libx264' || codec === 'libx265') {
		args.push('-preset', legacyPreset);
	}
	if (codec === 'libx265') {
		args.push('-pix_fmt', 'yuv420p');
		if (container === 'mp4') args.push('-tag:v', 'hvc1');
	}
	if (codec === 'libaom-av1') {
		args.push('-cpu-used', '4', '-row-mt', '1');
	}
	return args;
}

/**
 * Build codec/container preset args for size-constrained encoding.
 * If maxSizeMB is set and source is larger than the cap, compute a trim-aware
 * size budget and estimate a quality target (CRF/QP) for the selected output.
 */
export function buildVideoArgs(
	presetKey: string,
	clipDuration: number,
	options: BuildVideoArgsOptions = {},
): BuildVideoArgsResult {
	const preset = videoPresets[presetKey];
	if (!preset) throw new Error(`Unknown video preset: ${presetKey}`);

	const args: string[] = [];
	const basePresetArgs = [...preset.ffmpegArgs];
	const allowedVideoCodecs = normalizeAllowedVideoCodecs(preset);
	const allowedContainers = normalizeAllowedContainers(preset);
	const selectedVideoCodec = selectVideoCodec(allowedVideoCodecs, allowedContainers);
	const selectedContainer = selectContainer(selectedVideoCodec, allowedContainers);
	const allowedAudioCodecs = normalizeAllowedAudioCodecs(preset);
	const selectedAudioCodec = selectAudioCodec(selectedContainer, allowedAudioCodecs);
	const recommendedAudioBitrateKbps = clamp(
		Math.round(preset.recommendedAudioBitrateKbps ?? (selectedContainer === 'webm' ? 96 : 128)),
		48,
		512,
	);
	const sourceAudioCodecs = (options.sourceAudioCodecs ?? []).filter((codec) => codec.length > 0);
	const sourceAudioCompatible = sourceAudioCodecs.every(
		(codec) => isAudioCodec(codec) && allowedAudioCodecs.includes(codec),
	);
	const sourceAudioMaxBitrateKbps = Math.max(0, Math.round(options.sourceAudioMaxBitrateKbps ?? 0));
	const sourceAudioTotalBitrateKbps = Math.max(
		sourceAudioMaxBitrateKbps,
		Math.round(options.sourceAudioTotalBitrateKbps ?? sourceAudioMaxBitrateKbps),
	);
	const sourceAudioTrackCount = Math.max(1, Math.round(options.sourceAudioTrackCount ?? 1));
	const includeAudio = options.includeAudio ?? false;
	const shouldReencodeAudio =
		includeAudio && (!sourceAudioCompatible || sourceAudioMaxBitrateKbps > recommendedAudioBitrateKbps);
	const plannedAudioBitrateKbps = includeAudio
		? shouldReencodeAudio
			? recommendedAudioBitrateKbps * sourceAudioTrackCount
			: Math.max(sourceAudioTotalBitrateKbps, recommendedAudioBitrateKbps)
		: 0;

	const cleanedPresetArgs = stripRateControlArgs(stripVideoCodecArgs(basePresetArgs));
	args.push(...buildVideoCodecArgs(selectedVideoCodec, selectedContainer, basePresetArgs), ...cleanedPresetArgs);

	// Size-constrained encoding: use ABR bitrate (-b:v) which is the only
	// rate control mechanism actually supported by the Mediabunny worker.
	// Also selects an optimal resolution to maximize quality within the budget.
	let maxSizeBytes: number | null = null;
	let targetVideoBitrateKbps: number | null = null;
	let selectedWidth: number | null = null;
	let selectedHeight: number | null = null;
	let fallbackWidth: number | null = null;
	let fallbackHeight: number | null = null;

	if (preset.width != null && preset.height != null) {
		// Preset has fixed target dimensions — use them as-is
		selectedWidth = preset.width;
		selectedHeight = preset.height;
		args.push(
			'-vf',
			`scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
		);
	}

	if (preset.maxSizeMB != null) {
		maxSizeBytes = preset.maxSizeMB * 1024 * 1024;
		const videoBitrateKbps = computeTargetVideoBitrateKbps(preset.maxSizeMB, clipDuration, plannedAudioBitrateKbps);
		targetVideoBitrateKbps = videoBitrateKbps;

		// Auto-select resolution if no fixed dimensions and source info available
		if (preset.width == null && preset.height == null && options.inputWidth && options.inputHeight) {
			const optimal = selectOptimalResolution(
				videoBitrateKbps,
				options.inputWidth,
				options.inputHeight,
				options.inputFps ?? 30,
				selectedVideoCodec,
				preset.maxDisplayWidth,
			);
			if (optimal) {
				selectedWidth = optimal.width;
				selectedHeight = optimal.height;
				args.push('-vf', `scale=${optimal.width}:${optimal.height}:force_original_aspect_ratio=decrease`);
			}

			// Compute a fallback resolution (one step below selected) for retry
			const currentW = selectedWidth ?? options.inputWidth;
			const currentH = selectedHeight ?? options.inputHeight;
			const fallback = computeFallbackResolution(
				currentW,
				currentH,
				options.inputWidth / options.inputHeight,
				preset.maxDisplayWidth,
			);
			if (fallback) {
				fallbackWidth = fallback.width;
				fallbackHeight = fallback.height;
			}
		}

		args.push('-b:v', `${videoBitrateKbps * 1000}`);
	}

	return {
		args,
		format: selectedContainer,
		selectedVideoCodec,
		selectedAudioCodec,
		recommendedAudioBitrateKbps,
		shouldReencodeAudio,
		maxSizeBytes,
		targetVideoBitrateKbps,
		selectedWidth,
		selectedHeight,
		fallbackWidth,
		fallbackHeight,
	};
}

// ── Accepted File Types ──

export const VIDEO_ACCEPT = '.mp4,.webm,.mov,.mkv,.avi,.m4v,.ts,.flv';
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff,.avif';
export const GIF_ACCEPT = '.gif';
