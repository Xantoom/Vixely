import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import type { AspectId } from '@/editors/image/store';
import { createGifDoc, type GifDoc } from './document';

export interface GifExportSettings {
	/** Output width in pixels; null keeps the cropped width. The height follows. */
	width: number | null;
	/** 0 loops forever, −1 plays once, n plays n + 1 times. */
	repeat: number;
	/** gifski quality, 1 to 100. */
	quality: number;
	/** Lossy compression strength, 0 (none) to 100: smaller files, a little grain. */
	compression: number;
}

interface GifEditorState {
	owner: object | null;
	history: History<GifDoc>;
	gestureStart: GifDoc | null;
	/** Output time of the frame shown, in seconds. */
	playhead: number;
	playing: boolean;
	cropAspect: AspectId;
	exportSettings: GifExportSettings;

	load: (owner: object, doc: GifDoc, width: number | null) => void;
	apply: (change: (doc: GifDoc) => GifDoc) => void;
	preview: (change: (doc: GifDoc) => GifDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	setPlayhead: (time: number) => void;
	setPlaying: (playing: boolean) => void;
	setCropAspect: (aspect: AspectId) => void;
	setExport: (settings: Partial<GifExportSettings>) => void;
}

function defaultExport(width: number | null): GifExportSettings {
	return { width, repeat: 0, quality: 90, compression: 0 };
}

export const useGifEditor = create<GifEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createGifDoc(0, null)),
	gestureStart: null,
	playhead: 0,
	playing: false,
	cropAspect: 'free',
	exportSettings: defaultExport(null),

	load(owner, doc, width) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(doc),
			gestureStart: null,
			playhead: 0,
			playing: false,
			cropAspect: 'free',
			exportSettings: defaultExport(width),
		});
	},

	apply(change) {
		const { history } = get();
		set({ history: commit(history, change(history.present)), gestureStart: null });
	},

	preview(change) {
		const { history, gestureStart } = get();
		set({ history: replace(history, change(history.present)), gestureStart: gestureStart ?? history.present });
	},

	settle() {
		const { history, gestureStart } = get();
		if (!gestureStart) return;
		set({ history: commit(replace(history, gestureStart), history.present), gestureStart: null });
	},

	undo() {
		get().settle();
		set({ history: undo(get().history) });
	},

	redo() {
		get().settle();
		set({ history: redo(get().history) });
	},

	setPlayhead(playhead) {
		set({ playhead });
	},

	setPlaying(playing) {
		set({ playing });
	},

	setCropAspect(cropAspect) {
		set({ cropAspect });
	},

	setExport(settings) {
		set({ exportSettings: { ...get().exportSettings, ...settings } });
	},
}));

export function useGifDoc(): GifDoc {
	return useGifEditor((state) => state.history.present);
}

export function useGifUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useGifEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}
