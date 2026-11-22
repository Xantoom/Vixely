import { useEffect, useLayoutEffect, useState } from 'react';
import { EDITOR_ORDER, type MediaKind } from '@/editors/registry';

/** The editor on screen, and the one just left, to tell where the next one comes from. */
let shown: MediaKind | null = null;
let left: { kind: MediaKind; at: number } | null = null;

/** Milliseconds within which an editor opened still counts as coming from the one just left. */
const RECENT = 1000;

/**
 * The editor this one replaces, when another editor was on screen: the bar's highlight slides
 * from its tab and the editor comes in from that side. Null when opened from any other page.
 */
export function useEditorEntrance(kind: MediaKind): MediaKind | null {
	// Read while rendering: the editor left is still on screen then, or has just gone.
	const [from] = useState(() => {
		const previous = shown ?? (left && performance.now() - left.at < RECENT ? left.kind : null);
		return previous === kind ? null : previous;
	});
	useLayoutEffect(() => {
		shown = kind;
		return () => {
			if (shown === kind) shown = null;
			left = { kind, at: performance.now() };
		};
	}, [kind]);
	// Once in, a later remount of this editor (another tool from a link) comes in quietly.
	useEffect(() => {
		left = null;
	}, []);
	return from;
}

/** 1 when the editor came from one on its left in the bar, -1 from its right. */
export function entranceSide(from: MediaKind, to: MediaKind): 1 | -1 {
	return EDITOR_ORDER.indexOf(to) > EDITOR_ORDER.indexOf(from) ? 1 : -1;
}

/**
 * False for the first two frames when `wait` is set: what is costly to open (a video's pictures,
 * WebGL) waits until the editor has shown and its entrance has started, so it doesn't hold it up.
 */
export function useShownOnce(wait: boolean): boolean {
	const [shownOnce, setShownOnce] = useState(!wait);
	useEffect(() => {
		if (shownOnce) return;
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				setShownOnce(true);
			});
		});
		return () => {
			cancelAnimationFrame(frame);
		};
	}, [shownOnce]);
	return shownOnce;
}
