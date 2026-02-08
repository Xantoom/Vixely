import type { VideoPreset, ImagePreset, GifPreset, FilterPreset, PresetConfig } from "../presets.ts";

import discord from "./discord.json";
import twitch from "./twitch.json";
import twitter from "./twitter.json";
import youtube from "./youtube.json";
import tiktok from "./tiktok.json";
import bluesky from "./bluesky.json";
import general from "./general.json";
import filters from "./filters.json";

// ── Merge helpers ──

function mergeRecords<T>(...sources: Record<string, T>[]): Record<string, T> {
	const result: Record<string, T> = {};
	for (const src of sources) {
		for (const [k, v] of Object.entries(src)) {
			result[k] = v;
		}
	}
	return result;
}

// ── Aggregated presets ──

const networks = [discord, twitch, twitter, youtube, tiktok, bluesky, general] as {
	video: Record<string, VideoPreset>;
	image: Record<string, ImagePreset>;
	gif: Record<string, GifPreset>;
}[];

export const aggregatedPresets: PresetConfig = {
	video: mergeRecords(...networks.map((n) => n.video)),
	image: mergeRecords(...networks.map((n) => n.image)),
	gif: mergeRecords(...networks.map((n) => n.gif)),
	filters: filters as Record<string, FilterPreset>,
};
