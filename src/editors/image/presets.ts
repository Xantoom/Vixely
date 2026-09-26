import { m } from '@/paraglide/messages.js';
import type { ImageFormat } from './store';

export interface ImagePreset {
	id: string;
	/** The picture's use, after the platform's name. */
	label: () => string;
	width: number;
	height: number;
	format: ImageFormat;
	quality: number;
}

export interface PresetGroup {
	/** A platform's own name, or a generic heading. */
	title: () => string;
	presets: ImagePreset[];
}

const photo = (id: string, label: () => string, width: number, height: number, quality = 85): ImagePreset => ({
	id,
	label,
	width,
	height,
	format: 'jpeg',
	quality,
});

/** Small pictures shown over any background: PNG keeps their edges and transparency. */
const sharp = (id: string, label: () => string, width: number, height: number): ImagePreset => ({
	id,
	label,
	width,
	height,
	format: 'png',
	quality: 100,
});

/** Sizes each platform asks for, as they publish them. */
export const PRESET_GROUPS: PresetGroup[] = [
	{
		title: () => 'Instagram',
		presets: [
			photo('instagram-square', () => m.preset_square_post(), 1080, 1080),
			photo('instagram-portrait', () => m.preset_portrait_post(), 1080, 1350),
			photo('instagram-story', () => m.preset_story(), 1080, 1920),
			photo('instagram-profile', () => m.preset_profile(), 320, 320, 90),
		],
	},
	{
		title: () => 'YouTube',
		presets: [
			photo('youtube-thumbnail', () => m.preset_thumbnail(), 1280, 720, 90),
			photo('youtube-banner', () => m.preset_banner(), 2560, 1440),
			photo('youtube-profile', () => m.preset_profile(), 800, 800, 90),
		],
	},
	{
		title: () => 'TikTok',
		presets: [
			photo('tiktok-cover', () => m.preset_cover(), 1080, 1920),
			photo('tiktok-profile', () => m.preset_profile(), 200, 200, 90),
		],
	},
	{
		title: () => 'X',
		presets: [
			photo('x-post', () => m.preset_post(), 1200, 675),
			photo('x-header', () => m.preset_header(), 1500, 500),
			photo('x-profile', () => m.preset_profile(), 400, 400, 90),
		],
	},
	{
		title: () => 'Facebook',
		presets: [
			photo('facebook-post', () => m.preset_post(), 1200, 630),
			photo('facebook-cover', () => m.preset_cover(), 851, 315),
			photo('facebook-profile', () => m.preset_profile(), 320, 320, 90),
		],
	},
	{
		title: () => 'Bluesky',
		presets: [
			photo('bluesky-post', () => m.preset_post(), 2000, 1125, 80),
			photo('bluesky-banner', () => m.preset_banner(), 3000, 1000, 78),
			photo('bluesky-avatar', () => m.preset_profile(), 1000, 1000, 80),
		],
	},
	{
		title: () => 'LinkedIn',
		presets: [
			photo('linkedin-post', () => m.preset_post(), 1200, 627),
			photo('linkedin-banner', () => m.preset_banner(), 1584, 396),
		],
	},
	{ title: () => 'Pinterest', presets: [photo('pinterest-pin', () => m.preset_pin(), 1000, 1500)] },
	{
		title: () => 'Discord',
		presets: [
			sharp('discord-avatar', () => m.preset_profile(), 128, 128),
			sharp('discord-emoji', () => m.preset_emoji(), 128, 128),
			photo('discord-banner', () => m.preset_banner(), 960, 540),
			photo('discord-splash', () => m.preset_splash(), 1920, 1080),
		],
	},
	{
		title: () => 'Twitch',
		presets: [
			sharp('twitch-emote', () => m.preset_emote(), 112, 112),
			sharp('twitch-panel', () => m.preset_panel(), 320, 160),
			photo('twitch-banner', () => m.preset_banner(), 1200, 480),
			photo('twitch-offline', () => m.preset_offline(), 1920, 1080),
		],
	},
	{
		title: () => m.preset_group_web(),
		presets: [
			photo('web-link', () => m.preset_link_preview(), 1200, 630),
			{
				id: 'web-favicon',
				label: () => m.preset_favicon(),
				width: 256,
				height: 256,
				format: 'ico',
				quality: 100,
			},
		],
	},
	{
		title: () => m.preset_group_wallpaper(),
		presets: [
			photo('wallpaper-hd', () => 'Full HD', 1920, 1080, 92),
			photo('wallpaper-qhd', () => 'QHD', 2560, 1440, 92),
			photo('wallpaper-4k', () => '4K', 3840, 2160, 92),
			photo('wallpaper-phone', () => m.preset_phone(), 1290, 2796, 92),
		],
	},
];

export function findPreset(id: string | null): ImagePreset | null {
	if (!id) return null;
	for (const group of PRESET_GROUPS) {
		const preset = group.presets.find((candidate) => candidate.id === id);
		if (preset) return preset;
	}
	return null;
}

/** The platform a preset belongs to, for its full name. */
export function presetGroupTitle(id: string): string {
	return PRESET_GROUPS.find((group) => group.presets.some((preset) => preset.id === id))?.title() ?? '';
}
