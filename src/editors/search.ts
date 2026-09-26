import type { ToolId } from './registry';

const TOOLS = new Set<string>([
	'info',
	'trim',
	'crop',
	'adjust',
	'presets',
	'text',
	'stickers',
	'frames',
	'volume',
	'audio',
	'subtitles',
	'speed',
	'lines',
	'timing',
	'export',
]);

function isToolId(value: unknown): value is ToolId {
	return typeof value === 'string' && TOOLS.has(value);
}

export interface EditorSearch {
	/** Tool to open first, used by the quick tasks on the home page. */
	tool?: ToolId;
}

export function validateEditorSearch(search: Record<string, unknown>): EditorSearch {
	return isToolId(search.tool) ? { tool: search.tool } : {};
}
