/** Room kept between a floating list and the edges of the window. */
const EDGE = 8;
const GAP = 4;

export interface Place {
	top: number;
	left: number;
	minWidth: number;
	maxHeight: number;
	/** Opens downwards: the list grows from its top edge, otherwise from its bottom one. */
	down: boolean;
}

/**
 * Where a list opened from a button goes: under the button when it fits, above it otherwise,
 * whichever side has more room when neither does. Its left edge sits on the button's, or its right
 * edge on the button's with `align: 'end'`, moved back inside the window when it would leave it.
 */
export function placeList(
	button: DOMRect,
	list: { width: number; height: number },
	align: 'start' | 'end' = 'start',
): Place {
	const below = window.innerHeight - button.bottom - GAP - EDGE;
	const above = button.top - GAP - EDGE;
	const down = list.height <= below || below >= above;
	const maxHeight = Math.max(120, down ? below : above);
	const height = Math.min(list.height, maxHeight);
	const width = Math.max(list.width, button.width);
	const wanted = align === 'end' ? button.right - width : button.left;
	const left = Math.max(EDGE, Math.min(wanted, window.innerWidth - EDGE - width));
	return {
		top: down ? button.bottom + GAP : button.top - GAP - height,
		left,
		minWidth: button.width,
		maxHeight,
		down,
	};
}
