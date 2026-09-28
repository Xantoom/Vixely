import { m } from '@/paraglide/messages.js';

export type MediaKind = 'video' | 'image' | 'gif' | 'audio' | 'subtitles';

/** `export` opens from the app bar rather than the tool rail. */
export type ToolId =
	| 'info'
	| 'trim'
	| 'crop'
	| 'resize'
	| 'adjust'
	| 'presets'
	| 'layers'
	| 'frames'
	| 'volume'
	| 'sound'
	| 'translate'
	| 'ocr'
	| 'audio'
	| 'subtitles'
	| 'speed'
	| 'lines'
	| 'timing'
	| 'find'
	| 'styles'
	| 'export';

export interface EditorDefinition {
	kind: MediaKind;
	path: `/${MediaKind}`;
	label: () => string;
	/** The editor's page title. */
	page: () => string;
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
		page: () => m.editor_page_video(),
		tools: ['info', 'presets', 'trim', 'speed', 'crop', 'adjust', 'layers', 'audio', 'subtitles'],
		timed: true,
	},
	image: {
		kind: 'image',
		path: '/image',
		label: () => m.media_image(),
		page: () => m.editor_page_image(),
		tools: ['info', 'crop', 'resize', 'adjust', 'layers'],
		timed: false,
	},
	gif: {
		kind: 'gif',
		path: '/gif',
		label: () => m.media_gif(),
		page: () => m.editor_page_gif(),
		tools: ['info', 'presets', 'trim', 'crop', 'resize', 'adjust', 'layers', 'speed', 'frames'],
		timed: true,
	},
	audio: {
		kind: 'audio',
		path: '/audio',
		label: () => m.media_audio(),
		page: () => m.editor_page_audio(),
		tools: ['info', 'trim', 'volume', 'speed', 'sound'],
		timed: true,
	},
	subtitles: {
		kind: 'subtitles',
		path: '/subtitles',
		label: () => m.media_subtitles(),
		page: () => m.editor_page_subtitles(),
		tools: ['info', 'timing', 'ocr', 'translate'],
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
	resize: () => m.tool_resize(),
	presets: () => m.tool_presets(),
	layers: () => m.tool_layers(),
	frames: () => m.tool_frames(),
	volume: () => m.tool_volume(),
	sound: () => m.tool_sound(),
	translate: () => m.tool_translate(),
	ocr: () => m.tool_ocr(),
	audio: () => m.tool_audio(),
	subtitles: () => m.tool_subtitles(),
	speed: () => m.tool_speed(),
	lines: () => m.tool_lines(),
	timing: () => m.tool_timing(),
	find: () => m.tool_find(),
	styles: () => m.tool_styles(),
	export: () => m.export(),
};
