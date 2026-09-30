import { useEffect, useRef, useState } from 'react';

/**
 * Which ends of a scrolling row or column have more beyond them, to fade those edges: the cue that
 * the tools go on past the screen.
 */
export function useOverflowEdges<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [edges, setEdges] = useState({ start: false, end: false });
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const across = element.scrollWidth > element.clientWidth + 1;
			const position = across ? element.scrollLeft : element.scrollTop;
			const room = across
				? element.scrollWidth - element.clientWidth
				: element.scrollHeight - element.clientHeight;
			setEdges({ start: room > 1 && position > 1, end: room > 1 && position < room - 1 });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		element.addEventListener('scroll', measure, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener('scroll', measure);
		};
	}, []);
	return { ref, edges };
}

/** A mask fading the edges that have more beyond them, for a row (`x`) or a column (`y`). */
export function fadeMask(edges: { start: boolean; end: boolean }, axis: 'x' | 'y'): string {
	const end = (more: boolean) => (more ? 'transparent' : '#000');
	return `linear-gradient(${axis === 'x' ? 90 : 180}deg, ${end(edges.start)}, #000 2.5rem, #000 calc(100% - 2.5rem), ${end(edges.end)})`;
}
