import { m } from '@/paraglide/messages.js';

export type MediaKind = 'video' | 'image' | 'gif' | 'audio' | 'subtitles';

/** `export` opens from the app bar rather than the tool rail. */
export type ToolId =
	| 'info'
	| 'trim'
	| 'crop'
	| 'adjust'
	| 'volume'
	| 'audio'
	| 'subtitles'
	| 'speed'
	| 'lines'
	| 'timing'
	| 'export';

export interface EditorDefinition {
	kind: MediaKind;
	path: `/${MediaKind}`;
	label: () => string;
	/** Tools shown in the rail, in order. `info` is always first. */
	tools: ToolId[];
	/** Whether the media has a time dimension, which brings the transport and the timeline. */
	timed: boolean;
}

export const EDITORS: Record<MediaKind, EditorDefinition> = {
	video: {
		kind: 'video',
		path: '/video',
		label: () => m.media_video(),
		tools: ['info', 'trim', 'crop', 'adjust', 'audio', 'subtitles'],
		timed: true,
	},
	image: {
		kind: 'image',
		path: '/image',
		label: () => m.media_image(),
		tools: ['info', 'crop', 'adjust'],
		timed: false,
	},
	gif: {
		kind: 'gif',
		path: '/gif',
		label: () => m.media_gif(),
		tools: ['info', 'trim', 'crop', 'speed'],
		timed: true,
	},
	audio: {
		kind: 'audio',
		path: '/audio',
		label: () => m.media_audio(),
		tools: ['info', 'trim', 'volume'],
		timed: true,
	},
	subtitles: {
		kind: 'subtitles',
		path: '/subtitles',
		label: () => m.media_subtitles(),
		tools: ['info', 'lines', 'timing'],
		timed: true,
	},
};

export const EDITOR_ORDER: MediaKind[] = ['video', 'image', 'gif', 'audio', 'subtitles'];

export function isMediaKind(value: string): value is MediaKind {
	return Object.hasOwn(EDITORS, value);
}

export const TOOL_LABELS: Record<ToolId, () => string> = {
	info: () => m.tool_info(),
	trim: () => m.tool_trim(),
	crop: () => m.tool_crop(),
	adjust: () => m.tool_adjust(),
	volume: () => m.tool_volume(),
	audio: () => m.tool_audio(),
	subtitles: () => m.tool_subtitles(),
	speed: () => m.tool_speed(),
	lines: () => m.tool_lines(),
	timing: () => m.tool_timing(),
	export: () => m.export(),
};
