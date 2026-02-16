import { aggregatedPresets as data } from './presets/index.ts';

// ── Types ──

export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type VideoCodec = 'libaom-av1' | 'libvpx-vp9' | 'libx265' | 'libx264';
export type AudioCodec = 'aac' | 'libopus';

export interface VideoPreset {
	name: string;
	description: string;
	maxSizeMB: number | null;
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

export const videoPresets = presets.video;
export const imagePresets = presets.image;
export const gifPresets = presets.gif;
export const filterPresets = presets.filters;

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

function estimateCrfFromBudget(
	codec: string,
	videoBitrateKbps: number,
	width: number,
	height: number,
	fps: number,
): number {
	const pixels = Math.max(1, width * height);
	const safeFps = clamp(fps || 30, 12, 120);
	const bpppf = (videoBitrateKbps * 1000) / (pixels * safeFps);
	const normalized = Math.max(1e-5, bpppf);

	if (codec === 'libx265') {
		const crf = 27 - 5.9 * Math.log2(normalized / 0.08);
		return Math.round(clamp(crf, 18, 42));
	}
	if (codec === 'libvpx-vp9') {
		const crf = 35 - 6.2 * Math.log2(normalized / 0.08);
		return Math.round(clamp(crf, 20, 54));
	}
	if (codec === 'libaom-av1') {
		const crf = 38 - 6.6 * Math.log2(normalized / 0.08);
		return Math.round(clamp(crf, 22, 56));
	}

	const crf = 23 - 5.7 * Math.log2(normalized / 0.08);
	return Math.round(clamp(crf, 16, 40));
}

function defaultCrfForCodec(codec: VideoCodec): number {
	switch (codec) {
		case 'libaom-av1':
			return 34;
		case 'libvpx-vp9':
			return 35;
		case 'libx265':
			return 28;
		case 'libx264':
			return 23;
	}
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
 * Build FFmpeg args for a video preset with size-constrained encoding.
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

	// Scale filter if dimensions specified
	if (preset.width != null && preset.height != null) {
		args.push(
			'-vf',
			`scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
		);
	}

	const cleanedPresetArgs = stripRateControlArgs(stripVideoCodecArgs(basePresetArgs));
	args.push(...buildVideoCodecArgs(selectedVideoCodec, selectedContainer, basePresetArgs), ...cleanedPresetArgs);

	const shouldApplyQualityBudget = (() => {
		if (preset.maxSizeMB == null) return false;
		if (options.sourceSizeBytes == null) return true;
		return options.sourceSizeBytes > preset.maxSizeMB * 1024 * 1024;
	})();

	if (preset.maxSizeMB != null && shouldApplyQualityBudget) {
		const clipSec = Math.max(clipDuration, 0.5);
		const targetTotalBytes = preset.maxSizeMB * 1024 * 1024 * 0.93;
		const audioBytes = (plannedAudioBitrateKbps * 1000 * clipSec) / 8;
		const muxOverheadBytes = targetTotalBytes * 0.02;
		const targetVideoBits = Math.max(64_000, (targetTotalBytes - audioBytes - muxOverheadBytes) * 8);
		const targetVideoKbps = Math.max(64, Math.floor(targetVideoBits / clipSec / 1000));
		const width = preset.width ?? Math.max(16, options.inputWidth ?? 1280);
		const height = preset.height ?? Math.max(16, options.inputHeight ?? 720);
		const fps = options.inputFps ?? 30;
		const estimatedCrf = estimateCrfFromBudget(selectedVideoCodec, targetVideoKbps, width, height, fps);
		const estimatedQp = clamp(Math.round(estimatedCrf + (selectedVideoCodec === 'libx265' ? 2 : 0)), 0, 51);
		if (selectedVideoCodec === 'libx264' || selectedVideoCodec === 'libx265') {
			args.push('-qp', String(estimatedQp));
		} else {
			args.push('-crf', String(estimatedCrf));
			if (selectedVideoCodec === 'libvpx-vp9' || selectedVideoCodec === 'libaom-av1') {
				args.push('-b:v', '0');
			}
		}
		args.push('-maxrate', `${targetVideoKbps}k`, '-bufsize', `${Math.max(targetVideoKbps * 2, 256)}k`);
	} else {
		const legacyCodec = findArgValue(basePresetArgs, '-c:v');
		const legacyCrf = findArgValue(basePresetArgs, '-crf');
		const legacyQp = findArgValue(basePresetArgs, '-qp');
		if (legacyQp && (selectedVideoCodec === 'libx264' || selectedVideoCodec === 'libx265')) {
			args.push('-qp', legacyQp);
		} else {
			const useLegacyCrf = legacyCrf != null && legacyCodec != null && legacyCodec === selectedVideoCodec;
			const crfValue = useLegacyCrf ? Number(legacyCrf) : defaultCrfForCodec(selectedVideoCodec);
			args.push(
				'-crf',
				String(Number.isFinite(crfValue) ? Math.round(crfValue) : defaultCrfForCodec(selectedVideoCodec)),
			);
			if (selectedVideoCodec === 'libvpx-vp9' || selectedVideoCodec === 'libaom-av1') {
				args.push('-b:v', '0');
			}
		}
	}

	return {
		args,
		format: selectedContainer,
		selectedVideoCodec,
		selectedAudioCodec,
		recommendedAudioBitrateKbps,
		shouldReencodeAudio,
	};
}

// ── Accepted File Types ──

export const VIDEO_ACCEPT = '.mp4,.webm,.mov,.mkv,.avi,.m4v,.ts,.flv';
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff,.avif';
export const GIF_ACCEPT = `${VIDEO_ACCEPT},.gif`;
export const ALL_MEDIA_ACCEPT = `${VIDEO_ACCEPT},${IMAGE_ACCEPT},.gif`;
