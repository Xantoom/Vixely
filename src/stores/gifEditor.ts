import { create } from 'zustand';

export type GifMode = 'settings' | 'resize' | 'export';

export interface GifEditorState {
	mode: GifMode;
	speed: number;
	reverse: boolean;
	colorReduction: number;

	setMode: (mode: GifMode) => void;
	setSpeed: (speed: number) => void;
	setReverse: (reverse: boolean) => void;
	setColorReduction: (colors: number) => void;
	resetAll: () => void;
}

export const useGifEditorStore = create<GifEditorState>((set) => ({
	mode: 'settings',
	speed: 1,
	reverse: false,
	colorReduction: 256,

	setMode: (mode) => set({ mode }),
	setSpeed: (speed) => set({ speed }),
	setReverse: (reverse) => set({ reverse }),
	setColorReduction: (colorReduction) => set({ colorReduction }),

	resetAll: () => set({ mode: 'settings', speed: 1, reverse: false, colorReduction: 256 }),
}));
