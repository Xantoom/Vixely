import { useCallback, useRef } from 'react';

/** Pointer travel, in pixels, that turns a press into a drag rather than a click. */
const THRESHOLD = 5;

/**
 * Lets a horizontal row be scrolled by grabbing it with the mouse, and by the wheel turned the
 * usual way. A drag doesn't click what it started on. Touch screens scroll it natively.
 */
export function useDragScroll<T extends HTMLElement>() {
	const cleanup = useRef<(() => void) | null>(null);
	return useCallback((element: T | null) => {
		cleanup.current?.();
		cleanup.current = null;
		if (!element) return;
		element.dataset.dragScroll = '';

		let start: { x: number; left: number; id: number } | null = null;
		let dragging = false;

		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse' || event.button !== 0) return;
			if (element.scrollWidth <= element.clientWidth) return;
			start = { x: event.clientX, left: element.scrollLeft, id: event.pointerId };
			dragging = false;
		};
		const onPointerMove = (event: PointerEvent) => {
			if (!start || event.pointerId !== start.id) return;
			const moved = event.clientX - start.x;
			if (!dragging) {
				if (Math.abs(moved) < THRESHOLD) return;
				dragging = true;
				element.setPointerCapture(event.pointerId);
				element.dataset.dragging = '';
			}
			element.scrollLeft = start.left - moved;
		};
		const onPointerUp = (event: PointerEvent) => {
			if (!start || event.pointerId !== start.id) return;
			start = null;
			if (!dragging) return;
			delete element.dataset.dragging;
			// The release after a drag would click what is under the pointer.
			const swallow = (click: MouseEvent) => {
				click.stopPropagation();
				click.preventDefault();
			};
			element.addEventListener('click', swallow, { capture: true, once: true });
			setTimeout(() => {
				element.removeEventListener('click', swallow, { capture: true });
			}, 0);
		};
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
			const room = element.scrollWidth - element.clientWidth;
			if (room <= 0) return;
			const next = Math.max(0, Math.min(room, element.scrollLeft + event.deltaY));
			if (next === element.scrollLeft) return;
			event.preventDefault();
			element.scrollLeft = next;
		};

		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerUp);
		element.addEventListener('pointercancel', onPointerUp);
		element.addEventListener('wheel', onWheel, { passive: false });
		cleanup.current = () => {
			element.removeEventListener('pointerdown', onPointerDown);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', onPointerUp);
			element.removeEventListener('pointercancel', onPointerUp);
			element.removeEventListener('wheel', onWheel);
		};
	}, []);
}
