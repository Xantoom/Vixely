import { create } from 'zustand';
import { isSessionOwner, registerRestorable, takeRestore } from '@/app/resume';
import { peekTaskIntent } from '@/app/tasks';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import type { ImageDoc, Size } from '@/editors/image/document';
import type { PictureEditing } from '@/editors/image/editing';
import type { AspectId } from '@/editors/image/store';
import { createGifDoc, type GifDoc } from './document';

/** GIF through gifski, lossless APNG, animated WebP, a short video (MP4 or WebM), or PNG frames. */
export type AnimationFormat = 'gif' | 'apng' | 'webp' | 'video' | 'frames';

export interface GifExportSettings {
	/**
	 * `copy` keeps the GIF's own frames: only cut and loop change, nothing is re-encoded. Possible
	 * for GIF sources when the frames themselves are untouched.
	 */
	mode: 'copy' | 'encode';
	format: AnimationFormat;
	/** Output width in pixels; null keeps the cropped width. The height follows. */
	width: number | null;
	/** 0 loops forever, −1 plays once, n plays n + 1 times. */
	repeat: number;
	/** Quality, 1 to 100: gifski's for GIF, the encoder's for WebP and video. APNG is lossless. */
	quality: number;
	/** Lossy compression strength, 0 (none) to 100: smaller files, a little grain. */
	compression: number;
	/** Largest file allowed, in bytes; null for no limit. The width shrinks until it fits. */
	maxBytes: number | null;
	/** GIF only: dithering blends colours the palette lacks; off keeps flat colours. */
	dither: boolean;
	/** Video only: keeps transparency, as a VP9 WebM. */
	alpha: boolean;
	/** The preset last chosen, while its settings are unchanged. */
	preset: string | null;
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

	load: (owner: object, doc: GifDoc, width: number | null, copyable: boolean) => void;
	/** Shows another file of a batch: a fresh document, the same export settings. */
	retarget: (doc: GifDoc) => void;
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

function defaultExport(width: number | null, copyable: boolean): GifExportSettings {
	// Opened from "GIF to MP4": saved as a video.
	const video = peekTaskIntent()?.animationVideo === true;
	return {
		mode: copyable && !video ? 'copy' : 'encode',
		format: video ? 'video' : 'gif',
		width,
		repeat: 0,
		quality: 90,
		compression: 0,
		maxBytes: null,
		dither: true,
		alpha: false,
		preset: null,
	};
}

export const useGifEditor = create<GifEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createGifDoc(0, null)),
	gestureStart: null,
	playhead: 0,
	playing: false,
	cropAspect: 'free',
	exportSettings: defaultExport(null, false),

	load(owner, doc, width, copyable) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(doc),
			gestureStart: null,
			playhead: 0,
			playing: false,
			cropAspect: 'free',
			exportSettings: defaultExport(width, copyable),
		});
		const kept = takeRestore<GifKept>('gif');
		if (kept) set(kept);
	},

	retarget(doc) {
		set({ history: createHistory(doc), gestureStart: null, playhead: 0, playing: false });
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
		// A change by hand means the settings are no longer the preset's.
		set({ exportSettings: { ...get().exportSettings, preset: null, ...settings } });
	},
}));

/** What a closed tab keeps of the animation being edited. */
interface GifKept {
	history: History<GifDoc>;
	cropAspect: AspectId;
	exportSettings: GifExportSettings;
}

registerRestorable('gif', {
	snapshot: () => {
		const { owner, history, cropAspect, exportSettings } = useGifEditor.getState();
		if (!isSessionOwner(owner) || !(canUndo(history) || canRedo(history))) return null;
		return { history, cropAspect, exportSettings } satisfies GifKept;
	},
	subscribe: useGifEditor.subscribe,
});

export function useGifDoc(): GifDoc {
	return useGifEditor((state) => state.history.present);
}

export function useGifUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useGifEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}

/** Changes the pictures only, through the animation's history. */
const onPicture =
	(change: (picture: ImageDoc) => ImageDoc) =>
	(doc: GifDoc): GifDoc => ({ ...doc, picture: change(doc.picture) });

/** Every frame's picture, for the crop, adjustment, text and sticker panels shared with images. */
export function useGifPictureEditing(size: Size, still: ImageBitmap | null): PictureEditing {
	const picture = useGifEditor((state) => state.history.present.picture);
	const apply = useGifEditor((state) => state.apply);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const aspect = useGifEditor((state) => state.cropAspect);
	const setAspect = useGifEditor((state) => state.setCropAspect);
	return {
		doc: picture,
		size,
		apply: (change) => {
			apply(onPicture(change));
		},
		preview: (change) => {
			preview(onPicture(change));
		},
		settle,
		aspect,
		setAspect,
		still,
	};
}
