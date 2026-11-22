import type { Range } from '@/document/timemap';

/** Position of a time across the visible part of a timeline, as a CSS percentage. */
export function percent(time: number, view: Range): string {
	return `${((time - view.start) / (view.end - view.start)) * 100}%`;
}

/** Source time under a pointer, within the source. */
export function timeAt(element: HTMLElement, clientX: number, view: Range, duration: number): number {
	const rect = element.getBoundingClientRect();
	const x = (clientX - rect.left) / rect.width;
	return Math.min(duration, Math.max(0, view.start + x * (view.end - view.start)));
}

/** The view zoomed by `factor` (below 1 zooms in) around a time that stays in place. */
export function zoomView(view: Range, factor: number, anchor: number): Range {
	return { start: anchor - (anchor - view.start) * factor, end: anchor + (view.end - anchor) * factor };
}

/** Left and width of a range within the view, clipped to it, for an absolutely placed box. */
export function rangeBox(range: Range, view: Range): { left: string; width: string } {
	return {
		left: percent(Math.max(range.start, view.start), view),
		width: `${((Math.min(range.end, view.end) - Math.max(range.start, view.start)) / (view.end - view.start)) * 100}%`,
	};
}

export function isVisible(range: Range, view: Range): boolean {
	return range.end > view.start && range.start < view.end;
}
