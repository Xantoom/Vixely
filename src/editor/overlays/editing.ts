import { create } from 'zustand';
import type { Overlay, ShapeOverlay, TextOverlay } from './model';

/** Text and stickers of a picture, and how to change them through its history. */
export interface OverlayEditing {
	overlays: Overlay[];
	/** Applies a change as one undo step. */
	apply: (change: (overlays: Overlay[]) => Overlay[]) => void;
	/** Changes them during a gesture, without undo steps. */
	preview: (change: (overlays: Overlay[]) => Overlay[]) => void;
	/** Ends the gesture: everything since it started becomes one undo step. */
	settle: () => void;
	/** Over a video: overlays can show for a part of it only. */
	timing?: OverlayTiming;
}

export interface OverlayTiming {
	/** Length of the source, in seconds. */
	duration: number;
	/** Where playback is, in seconds of the source; read when asked, not at every frame. */
	playhead: () => number;
}

type Placement = Partial<Pick<Overlay, 'x' | 'y' | 'size' | 'rotation' | 'opacity' | 'span'>>;

/** Moves, sizes or turns one overlay of the list. */
export function placeOverlay(id: string, change: Placement) {
	return (overlays: Overlay[]): Overlay[] =>
		overlays.map((overlay) => (overlay.id === id ? { ...overlay, ...change } : overlay));
}

/** Changes the text and style of one text overlay. */
export function updateText(id: string, change: Partial<Omit<TextOverlay, 'id' | 'kind'>>) {
	return (overlays: Overlay[]): Overlay[] =>
		overlays.map((overlay) => (overlay.id === id && overlay.kind === 'text' ? { ...overlay, ...change } : overlay));
}

/** Changes the colour and look of one shape. */
export function updateShape(id: string, change: Partial<Omit<ShapeOverlay, 'id' | 'kind'>>) {
	return (overlays: Overlay[]): Overlay[] =>
		overlays.map((overlay) =>
			overlay.id === id && overlay.kind === 'shape' ? { ...overlay, ...change } : overlay,
		);
}

interface Selection {
	selected: string | null;
	select: (id: string | null) => void;
}

/** The overlay being worked on, shared by the picture and the panels. */
export const useOverlaySelection = create<Selection>()((set) => ({
	selected: null,
	select: (selected) => {
		set({ selected });
	},
}));
