/**
 * Tasks: an editor opened for one job, at an address of its own (`/tools/compress-video`). They
 * are the quick ways in from the home page and the pages search engines list. The addresses of
 * the first Vixely are kept.
 */
import type { MediaKind, ToolId } from '@/editors/registry';
import type { PresetId } from '@/editors/video/export';
import { m } from '@/paraglide/messages.js';

/** How the editor is set up once a file is open. */
export interface TaskIntent {
	/** Video: converted rather than copied, with a platform's settings. */
	encode?: boolean;
	preset?: PresetId;
	/** GIF: saved as a video. */
	animationVideo?: boolean;
}

export interface Task {
	slug: string;
	editor: MediaKind;
	tool?: ToolId;
	intent?: TaskIntent;
	title: () => string;
	description: () => string;
}

export const TASKS: Task[] = [
	{
		slug: 'compress-video',
		editor: 'video',
		tool: 'export',
		intent: { encode: true },
		title: () => m.tool_compress_video(),
		description: () => m.tool_compress_video_desc(),
	},
	{
		slug: 'compress-video-for-discord',
		editor: 'video',
		tool: 'export',
		intent: { encode: true, preset: 'discord' },
		title: () => m.tool_compress_video_discord(),
		description: () => m.tool_compress_video_discord_desc(),
	},
	{
		slug: 'trim-video',
		editor: 'video',
		tool: 'trim',
		title: () => m.tool_trim_video(),
		description: () => m.tool_trim_video_desc(),
	},
	{
		slug: 'convert-video',
		editor: 'video',
		tool: 'export',
		intent: { encode: true },
		title: () => m.tool_convert_video(),
		description: () => m.tool_convert_video_desc(),
	},
	{
		slug: 'burn-subtitles',
		editor: 'video',
		tool: 'export',
		intent: { encode: true },
		title: () => m.tool_burn_subtitles(),
		description: () => m.tool_burn_subtitles_desc(),
	},
	{
		slug: 'video-to-gif',
		editor: 'gif',
		tool: 'trim',
		title: () => m.tool_video_to_gif(),
		description: () => m.tool_video_to_gif_desc(),
	},
	{
		slug: 'gif-to-mp4',
		editor: 'gif',
		tool: 'export',
		intent: { animationVideo: true },
		title: () => m.tool_gif_to_mp4(),
		description: () => m.tool_gif_to_mp4_desc(),
	},
	{
		slug: 'optimize-gif',
		editor: 'gif',
		tool: 'export',
		title: () => m.tool_optimize_gif(),
		description: () => m.tool_optimize_gif_desc(),
	},
	{
		slug: 'resize-image',
		editor: 'image',
		tool: 'crop',
		title: () => m.tool_resize_image(),
		description: () => m.tool_resize_image_desc(),
	},
	{
		slug: 'compress-image',
		editor: 'image',
		tool: 'export',
		title: () => m.tool_compress_image(),
		description: () => m.tool_compress_image_desc(),
	},
	{
		slug: 'convert-image',
		editor: 'image',
		tool: 'export',
		title: () => m.tool_convert_image(),
		description: () => m.tool_convert_image_desc(),
	},
	{
		slug: 'trim-audio',
		editor: 'audio',
		tool: 'trim',
		title: () => m.tool_trim_audio(),
		description: () => m.tool_trim_audio_desc(),
	},
	{
		slug: 'normalize-audio',
		editor: 'audio',
		tool: 'volume',
		title: () => m.tool_normalize_audio(),
		description: () => m.tool_normalize_audio_desc(),
	},
	{
		slug: 'convert-audio',
		editor: 'audio',
		tool: 'export',
		title: () => m.tool_convert_audio(),
		description: () => m.tool_convert_audio_desc(),
	},
	{
		slug: 'extract-audio',
		editor: 'audio',
		tool: 'export',
		title: () => m.tool_extract_audio(),
		description: () => m.tool_extract_audio_desc(),
	},
	{
		slug: 'resync-subtitles',
		editor: 'subtitles',
		tool: 'timing',
		title: () => m.tool_resync_subtitles(),
		description: () => m.tool_resync_subtitles_desc(),
	},
	{
		slug: 'convert-subtitles',
		editor: 'subtitles',
		tool: 'export',
		title: () => m.tool_convert_subtitles(),
		description: () => m.tool_convert_subtitles_desc(),
	},
	{
		slug: 'extract-subtitles',
		editor: 'subtitles',
		title: () => m.tool_extract_subtitles(),
		description: () => m.tool_extract_subtitles_desc(),
	},
];

export function taskBySlug(slug: string): Task | undefined {
	return TASKS.find((task) => task.slug === slug);
}

let pending: TaskIntent | null = null;

/**
 * The intent of the task page on screen, set while it is shown: editors read it when they make
 * the export settings of a file opened there.
 */
export function setTaskIntent(intent: TaskIntent | null) {
	pending = intent;
}

export function peekTaskIntent(): TaskIntent | null {
	return pending;
}
