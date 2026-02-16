import type { FilterPreset, GifPreset, ImagePreset, PresetConfig, VideoPreset } from '../presets.ts';
import bluesky from './bluesky.json';
import discord from './discord.json';
import filters from './filters.json';
import general from './general.json';
import tiktok from './tiktok.json';
import twitch from './twitch.json';
import twitter from './twitter.json';
import youtube from './youtube.json';

function mergeRecords<T>(...sources: Record<string, T>[]): Record<string, T> {
	const result: Record<string, T> = {};
	for (const src of sources) {
		for (const [k, v] of Object.entries(src)) {
			result[k] = v;
		}
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

type ParsedVideoCodec = NonNullable<VideoPreset['allowedVideoCodecs']>[number];
type ParsedVideoContainer = NonNullable<VideoPreset['allowedContainers']>[number];
type ParsedAudioCodec = NonNullable<VideoPreset['allowedAudioCodecs']>[number];

function isVideoCodec(value: string): value is ParsedVideoCodec {
	return value === 'libaom-av1' || value === 'libvpx-vp9' || value === 'libx265' || value === 'libx264';
}

function isVideoContainer(value: string): value is ParsedVideoContainer {
	return value === 'mp4' || value === 'mkv' || value === 'webm';
}

function isAudioCodec(value: string): value is ParsedAudioCodec {
	return value === 'aac' || value === 'libopus';
}

function parseVideoPreset(value: unknown): VideoPreset | null {
	if (!isRecord(value)) return null;
	const {
		name,
		description,
		maxSizeMB,
		format,
		ffmpegArgs,
		width,
		height,
		allowedVideoCodecs,
		allowedContainers,
		allowedAudioCodecs,
		recommendedAudioBitrateKbps,
	} = value;
	if (typeof name !== 'string' || typeof description !== 'string') return null;
	if (maxSizeMB !== null && typeof maxSizeMB !== 'number') return null;
	if (format !== 'mp4' && format !== 'webm' && format !== 'mkv') return null;
	if (!isStringArray(ffmpegArgs)) return null;
	if (width !== null && typeof width !== 'number') return null;
	if (height !== null && typeof height !== 'number') return null;
	if (allowedVideoCodecs != null && !isStringArray(allowedVideoCodecs)) return null;
	if (allowedContainers != null && !isStringArray(allowedContainers)) return null;
	if (allowedAudioCodecs != null && !isStringArray(allowedAudioCodecs)) return null;
	if (recommendedAudioBitrateKbps != null && typeof recommendedAudioBitrateKbps !== 'number') return null;
	const parsedAllowedVideoCodecs = allowedVideoCodecs?.filter((codec): codec is ParsedVideoCodec =>
		isVideoCodec(codec),
	);
	const parsedAllowedContainers = allowedContainers?.filter((container): container is ParsedVideoContainer =>
		isVideoContainer(container),
	);
	const parsedAllowedAudioCodecs = allowedAudioCodecs?.filter((codec): codec is ParsedAudioCodec =>
		isAudioCodec(codec),
	);
	return {
		name,
		description,
		maxSizeMB,
		format,
		ffmpegArgs,
		width,
		height,
		...(parsedAllowedVideoCodecs != null ? { allowedVideoCodecs: parsedAllowedVideoCodecs } : {}),
		...(parsedAllowedContainers != null ? { allowedContainers: parsedAllowedContainers } : {}),
		...(parsedAllowedAudioCodecs != null ? { allowedAudioCodecs: parsedAllowedAudioCodecs } : {}),
		...(recommendedAudioBitrateKbps != null ? { recommendedAudioBitrateKbps } : {}),
	};
}

function parseImagePreset(value: unknown): ImagePreset | null {
	if (!isRecord(value)) return null;
	const { name, description, width, height, format, exportFormat, exportQuality } = value;
	if (typeof name !== 'string' || typeof description !== 'string') return null;
	if (width !== null && typeof width !== 'number') return null;
	if (height !== null && typeof height !== 'number') return null;
	if (format !== 'png' && format !== 'jpeg' && format !== 'webp') return null;
	if (exportFormat != null && exportFormat !== 'png' && exportFormat !== 'jpeg' && exportFormat !== 'webp') {
		return null;
	}
	if (exportQuality != null && typeof exportQuality !== 'number') return null;
	return {
		name,
		description,
		width,
		height,
		format,
		...(exportFormat != null ? { exportFormat } : {}),
		...(exportQuality != null ? { exportQuality } : {}),
	};
}

function parseGifPreset(value: unknown): GifPreset | null {
	if (!isRecord(value)) return null;
	const { name, description, width, fps, maxDuration } = value;
	if (typeof name !== 'string' || typeof description !== 'string') return null;
	if (typeof width !== 'number' || typeof fps !== 'number') return null;
	if (maxDuration !== null && typeof maxDuration !== 'number') return null;
	return { name, description, width, fps, maxDuration };
}

function parseFilterPreset(value: unknown): FilterPreset | null {
	if (!isRecord(value)) return null;
	const {
		name,
		exposure,
		brightness,
		contrast,
		highlights,
		shadows,
		saturation,
		temperature,
		tint,
		hue,
		blur,
		sepia,
		vignette,
		grain,
	} = value;
	if (typeof name !== 'string') return null;
	if (
		typeof exposure !== 'number' ||
		typeof brightness !== 'number' ||
		typeof contrast !== 'number' ||
		typeof highlights !== 'number' ||
		typeof shadows !== 'number' ||
		typeof saturation !== 'number' ||
		typeof temperature !== 'number' ||
		typeof tint !== 'number' ||
		typeof hue !== 'number' ||
		typeof blur !== 'number' ||
		typeof sepia !== 'number' ||
		typeof vignette !== 'number' ||
		typeof grain !== 'number'
	) {
		return null;
	}
	return {
		name,
		exposure,
		brightness,
		contrast,
		highlights,
		shadows,
		saturation,
		temperature,
		tint,
		hue,
		blur,
		sepia,
		vignette,
		grain,
	};
}

function parseRecord<T>(value: unknown, parseItem: (entry: unknown) => T | null): Record<string, T> {
	if (!isRecord(value)) return {};
	const result: Record<string, T> = {};
	for (const [key, entry] of Object.entries(value)) {
		const parsed = parseItem(entry);
		if (parsed) result[key] = parsed;
	}
	return result;
}

function parseNetwork(value: unknown): {
	video: Record<string, VideoPreset>;
	image: Record<string, ImagePreset>;
	gif: Record<string, GifPreset>;
} {
	if (!isRecord(value)) {
		return { video: {}, image: {}, gif: {} };
	}
	return {
		video: parseRecord(value.video, parseVideoPreset),
		image: parseRecord(value.image, parseImagePreset),
		gif: parseRecord(value.gif, parseGifPreset),
	};
}

const networks = [discord, twitch, twitter, youtube, tiktok, bluesky, general].map(parseNetwork);

export const aggregatedPresets: PresetConfig = {
	video: mergeRecords(...networks.map((n) => n.video)),
	image: mergeRecords(...networks.map((n) => n.image)),
	gif: mergeRecords(...networks.map((n) => n.gif)),
	filters: parseRecord(filters, parseFilterPreset),
};
