import { type RefObject, useLayoutEffect, useState } from 'react';
import { isLayoutMoving, onLayoutSettled } from './layout-motion';

export interface BoxSize {
	width: number;
	height: number;
}

/**
 * Size of an element's content box, kept up to date as the layout changes. While the editor's
 * columns slide, the size waits for them to settle: a single update rather than one per frame.
 */
export function useBoxSize(ref: RefObject<HTMLElement | null>): BoxSize {
	const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		let latest: BoxSize | null = null;
		const apply = () => {
			const next = latest;
			if (!next) return;
			setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
		};
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			latest = { width: entry.contentRect.width, height: entry.contentRect.height };
			if (!isLayoutMoving()) apply();
		});
		observer.observe(element);
		const stop = onLayoutSettled(apply);
		return () => {
			observer.disconnect();
			stop();
		};
	}, [ref]);
	return size;
}
