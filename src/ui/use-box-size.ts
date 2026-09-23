import { type RefObject, useLayoutEffect, useState } from 'react';

export interface BoxSize {
	width: number;
	height: number;
}

/** Size of an element's content box, kept up to date as the layout changes. */
export function useBoxSize(ref: RefObject<HTMLElement | null>): BoxSize {
	const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [ref]);
	return size;
}
