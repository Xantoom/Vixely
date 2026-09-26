import { m } from '@/paraglide/messages.js';
import type { AnimationFormat } from './store';

export interface GifPreset {
	id: string;
	/** The platform's own name. */
	platform: string;
	label: () => string;
	/** Width of the frame, in pixels. */
	width: number;
	/** Cropped to a square from the middle, as emotes and stickers are. */
	square: boolean;
	format: AnimationFormat;
	/** Largest file the platform accepts, in bytes, or null. */
	maxBytes: number | null;
	/** Frame rate for pictures made from a video; animations keep their own frames. */
	fps: number;
}

/** What platforms accept for animated pictures, as they publish it. */
export const GIF_PRESETS: GifPreset[] = [
	{
		id: 'discord-emoji',
		platform: 'Discord',
		label: () => m.preset_emoji(),
		width: 128,
		square: true,
		format: 'gif',
		maxBytes: 256_000,
		fps: 20,
	},
	{
		id: 'discord-sticker',
		platform: 'Discord',
		label: () => m.preset_sticker(),
		width: 320,
		square: true,
		format: 'apng',
		maxBytes: 512_000,
		fps: 20,
	},
	{
		id: 'twitch-emote',
		platform: 'Twitch',
		label: () => m.preset_emote(),
		width: 112,
		square: true,
		format: 'gif',
		maxBytes: 1_000_000,
		fps: 20,
	},
	{
		id: 'slack-emoji',
		platform: 'Slack',
		label: () => m.preset_emoji(),
		width: 128,
		square: true,
		format: 'gif',
		maxBytes: 128_000,
		fps: 15,
	},
	{
		id: 'x-gif',
		platform: 'X',
		label: () => m.preset_post(),
		width: 480,
		square: false,
		format: 'gif',
		maxBytes: 15_000_000,
		fps: 15,
	},
	{
		id: 'tiktok-gif',
		platform: 'TikTok',
		label: () => m.preset_comment(),
		width: 540,
		square: false,
		format: 'gif',
		maxBytes: 5_000_000,
		fps: 15,
	},
	{
		id: 'reaction',
		platform: '',
		label: () => m.preset_reaction(),
		width: 480,
		square: false,
		format: 'gif',
		maxBytes: 5_000_000,
		fps: 15,
	},
	{
		id: 'small',
		platform: '',
		label: () => m.preset_small(),
		width: 320,
		square: false,
		format: 'gif',
		maxBytes: 2_000_000,
		fps: 12,
	},
];
