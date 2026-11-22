import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * What every floating list or panel opened from a button shares: open and shut, placed before it
 * paints (hidden until then), shut by a press elsewhere, and following its button when the window
 * is resized or the page scrolls (not when it scrolls itself). It takes the colour of the editor its
 * button sits in, being drawn outside it.
 *
 * `locate` places the popover against its button; it is read when placing, so it may change.
 */
export function usePopover<P>(locate: (button: HTMLButtonElement, popover: HTMLDivElement) => P) {
	const [open, setOpen] = useState(false);
	const [place, setPlace] = useState<P | null>(null);
	const [media, setMedia] = useState<string | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const locateRef = useRef(locate);
	locateRef.current = locate;

	const show = useCallback(() => {
		setMedia(buttonRef.current?.closest('[data-media]')?.getAttribute('data-media') ?? null);
		setOpen(true);
	}, []);

	const close = useCallback((focus: boolean) => {
		setOpen(false);
		setPlace(null);
		if (focus) buttonRef.current?.focus();
	}, []);

	const reposition = useCallback(() => {
		const button = buttonRef.current;
		const popover = popoverRef.current;
		if (button && popover) setPlace(locateRef.current(button, popover));
	}, []);

	// Measured before painting, so it never shows in the wrong place first.
	useLayoutEffect(() => {
		if (open) reposition();
	}, [open, reposition]);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const { target } = event;
			if (!(target instanceof Node)) return;
			if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			close(false);
		};
		const onScroll = (event: Event) => {
			if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
			reposition();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', onScroll, true);
		};
	}, [open, close, reposition]);

	return { open, place, media, buttonRef, popoverRef, show, close, reposition };
}
