import { aggregatedPresets as data } from "./presets/index.ts";

// ── Types ──

export interface VideoPreset {
	name: string;
	description: string;
	maxSizeMB: number | null;
	format: "mp4" | "webm";
	ffmpegArgs: string[];
	width: number | null;
	height: number | null;
}

export interface ImagePreset {
	name: string;
	description: string;
	width: number | null;
	height: number | null;
	format: "png" | "webp" | "jpeg";
	exportFormat?: "png" | "jpeg" | "webp";
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

export const presets: PresetConfig = data as PresetConfig;

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

/**
 * Build FFmpeg args for a video preset with size-constrained encoding.
 * Calculates target bitrate from maxSizeMB and clip duration.
 */
export function buildVideoArgs(
	presetKey: string,
	clipDuration: number,
): { args: string[]; format: string } {
	const preset = videoPresets[presetKey];
	if (!preset) throw new Error(`Unknown video preset: ${presetKey}`);

	const args: string[] = [];

	// Scale filter if dimensions specified
	if (preset.width != null && preset.height != null) {
		args.push(
			"-vf",
			`scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
		);
	}

	// Size-constrained encoding
	if (preset.maxSizeMB != null) {
		const targetBitrate = Math.floor(
			(preset.maxSizeMB * 8 * 1024) / Math.max(clipDuration, 0.5),
		);
		args.push(
			...preset.ffmpegArgs,
			"-b:v", `${targetBitrate}k`,
			"-maxrate", `${targetBitrate}k`,
			"-bufsize", `${targetBitrate * 2}k`,
		);
	} else {
		args.push(...preset.ffmpegArgs);
	}

	return { args, format: preset.format };
}

// ── Accepted File Types ──

export const VIDEO_ACCEPT = ".mp4,.webm,.mov,.mkv,.avi,.m4v,.ts,.flv";
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.bmp,.tiff,.avif";
export const GIF_ACCEPT = `${VIDEO_ACCEPT},.gif`;
export const ALL_MEDIA_ACCEPT = `${VIDEO_ACCEPT},${IMAGE_ACCEPT},.gif`;
