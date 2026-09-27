import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { layerOf } from './layer';

/** Wait before the first tooltip; once one shows, the next ones follow at once. */
const DELAY = 450;
const WARM = 400;
const EDGE = 8;
const GAP = 8;

interface Tip {
	text: string;
	target: Element;
}

/** The element a tooltip belongs to, its native `title` moved into `data-tip` on the way. */
function tipTarget(node: EventTarget | null): Element | null {
	if (!(node instanceof Element)) return null;
	const target = node.closest('[data-tip], [title]');
	if (!target || target instanceof SVGTitleElement) return null;
	const title = target.getAttribute('title');
	if (title !== null) {
		// The browser's own tooltip would show too, unstyled: the text moves to the app's.
		if (title) target.setAttribute('data-tip', title);
		target.removeAttribute('title');
	}
	return target.getAttribute('data-tip') ? target : null;
}

/**
 * The app's tooltips, in place of the browser's: any element with a `title` or `data-tip` gets one
 * on hover (mouse only) and on keyboard focus, above it, or below when there is no room.
 */
export function Tooltips() {
	const [tip, setTip] = useState<Tip | null>(null);
	const [place, setPlace] = useState<{ left: number; top: number; below: boolean } | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const timer = useRef(0);
	const lastShown = useRef(0);
	/** The element a tooltip is shown or about to show for. */
	const shownFor = useRef<Element | null>(null);

	useEffect(() => {
		const hide = () => {
			window.clearTimeout(timer.current);
			shownFor.current = null;
			setTip((current) => {
				if (current) lastShown.current = performance.now();
				return null;
			});
		};
		const show = (target: Element) => {
			window.clearTimeout(timer.current);
			shownFor.current = target;
			const open = () => {
				const text = target.getAttribute('data-tip');
				if (text && target.isConnected) setTip({ text, target });
			};
			if (performance.now() - lastShown.current < WARM) open();
			else timer.current = window.setTimeout(open, DELAY);
		};
		const onOver = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse') return;
			const target = tipTarget(event.target);
			if (!target) {
				hide();
				return;
			}
			if (shownFor.current !== target) show(target);
		};
		const onFocus = (event: FocusEvent) => {
			const target = tipTarget(event.target);
			if (target && target instanceof HTMLElement && target.matches(':focus-visible')) show(target);
			else hide();
		};
		document.addEventListener('pointerover', onOver);
		document.addEventListener('pointerdown', hide, true);
		document.addEventListener('focusin', onFocus);
		document.addEventListener('focusout', hide);
		document.addEventListener('keydown', hide, true);
		window.addEventListener('scroll', hide, true);
		window.addEventListener('blur', hide);
		return () => {
			document.removeEventListener('pointerover', onOver);
			document.removeEventListener('pointerdown', hide, true);
			document.removeEventListener('focusin', onFocus);
			document.removeEventListener('focusout', hide);
			document.removeEventListener('keydown', hide, true);
			window.removeEventListener('scroll', hide, true);
			window.removeEventListener('blur', hide);
			window.clearTimeout(timer.current);
		};
	}, []);

	// Leaving the page's elements (to the window's edge) hides it too.
	useEffect(() => {
		if (!tip) return;
		const onOut = (event: PointerEvent) => {
			if (
				!event.relatedTarget ||
				!(event.relatedTarget instanceof Node) ||
				!tip.target.contains(event.relatedTarget)
			) {
				if (event.target instanceof Node && tip.target.contains(event.target)) {
					lastShown.current = performance.now();
					shownFor.current = null;
					setTip(null);
				}
			}
		};
		document.addEventListener('pointerout', onOut);
		return () => {
			document.removeEventListener('pointerout', onOut);
		};
	}, [tip]);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!tip || !element) {
			setPlace(null);
			return;
		}
		const box = tip.target.getBoundingClientRect();
		const { width, height } = element.getBoundingClientRect();
		const below = box.top - GAP - height < EDGE;
		const left = Math.max(EDGE, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - EDGE - width));
		setPlace({ left, top: below ? box.bottom + GAP : box.top - GAP - height, below });
	}, [tip]);

	if (!tip) return null;
	return createPortal(
		<div
			ref={ref}
			role="tooltip"
			data-below={place?.below ?? false}
			className="tooltip-in bg-ink text-bg text-caption pointer-events-none fixed z-[60] max-w-72 rounded-xs px-2.5 py-1.5 font-medium shadow-[0_8px_24px_-8px_rgb(0_0_0/0.4)]"
			style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }}
		>
			{tip.text}
		</div>,
		layerOf(tip.target),
	);
}
