/**
 * What a wheel turn means over a zoomable area: the wheel zooms, as in image and video editors;
 * Shift + wheel and sideways scrolling (a trackpad's) move along instead. A trackpad pinch arrives
 * as Ctrl + wheel, and zooms too.
 */
export function wheelIntent(
	event: WheelEvent | { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
): 'zoom' | 'pan' {
	if (event.ctrlKey || event.metaKey) return 'zoom';
	if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 'pan';
	return 'zoom';
}

/** How far a panning wheel turn moves, whichever way it was turned. */
export function panDelta(event: { deltaX: number; deltaY: number }): number {
	return Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
}
