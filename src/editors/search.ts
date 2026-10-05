import type { ToolId } from './registry';

const TOOLS = new Set<string>([
	'info',
	'trim',
	'crop',
	'resize',
	'adjust',
	'presets',
	'layers',
	'frames',
	'volume',
	'sound',
	'translate',
	'ocr',
	'tracks',
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

/** Tools merged into others: links to them open the one they joined. */
const MERGED: Partial<Record<string, ToolId>> = { speed: 'trim', volume: 'sound' };

export function validateEditorSearch(search: Record<string, unknown>): EditorSearch {
	const tool = typeof search.tool === 'string' ? (MERGED[search.tool] ?? search.tool) : search.tool;
	return isToolId(tool) ? { tool } : {};
}
