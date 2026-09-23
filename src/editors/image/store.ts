import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import { adaptDoc, createImageDoc, type ImageDoc, orientedSize, type Size } from './document';

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl';

export type AspectId = 'free' | 'original' | '1:1' | '4:5' | '5:4' | '3:2' | '2:3' | '16:9' | '9:16';

export const ASPECTS: AspectId[] = ['free', 'original', '1:1', '4:5', '3:2', '16:9', '9:16'];

/** Width over height for an aspect, or null when free. `original` follows the oriented image. */
export function cropRatio(aspect: AspectId, bounds: Size): number | null {
	if (aspect === 'free') return null;
	if (aspect === 'original') return bounds.width / bounds.height;
	const [w = 1, h = 1] = aspect.split(':').map(Number);
	return w / h;
}

/** The same aspect after a quarter turn: 16:9 becomes 9:16. Aspects without a mirror become free. */
export function turnedAspect(aspect: AspectId): AspectId {
	if (aspect === 'free' || aspect === 'original' || aspect === '1:1') return aspect;
	const [w, h] = aspect.split(':');
	return ASPECTS.find((candidate) => candidate === `${h}:${w}`) ?? 'free';
}

export interface ExportSettings {
	format: ImageFormat;
	/** 1 to 100, for lossy formats. */
	quality: number;
	/** Longest side of the output, in pixels. Null keeps the cropped size. */
	longestSide: number | null;
	/** PNG only: reduce to a palette of 256 colours, much smaller and hard to tell apart. */
	pngLossy: boolean;
	/** AVIF only: `best` spends much longer searching for a smaller file. */
	avifEffort: 'fast' | 'best';
	/** EXIF kept in the export. `private` keeps camera details but never the location. */
	metadata: 'none' | 'private' | 'all';
}

interface ImageEditorState {
	/** What the history belongs to: a file, or a whole batch. Anything else starts a fresh history. */
	owner: object | null;
	history: History<ImageDoc>;
	/** Document before the gesture in progress, so a whole drag becomes one undo step. */
	gestureStart: ImageDoc | null;
	/** Crop aspect constraint. A tool setting, not part of the document. */
	cropAspect: AspectId;
	exportSettings: ExportSettings;

	load: (owner: object) => void;
	/** Carries the edits over to another image of a batch, of a different size. */
	retarget: (from: Size, to: Size) => void;
	/** Applies a change as one undo step. */
	apply: (change: (doc: ImageDoc) => ImageDoc) => void;
	/** Updates the document during a gesture without creating undo steps. */
	preview: (change: (doc: ImageDoc) => ImageDoc) => void;
	/** Ends the gesture: everything since it started becomes one undo step. */
	settle: () => void;
	undo: () => void;
	redo: () => void;
	setCropAspect: (aspect: AspectId) => void;
	setExport: (settings: Partial<ExportSettings>) => void;
}

const DEFAULT_EXPORT: ExportSettings = {
	format: 'jpeg',
	quality: 85,
	longestSide: null,
	pngLossy: false,
	avifEffort: 'fast',
	metadata: 'private',
};

export const useImageEditor = create<ImageEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createImageDoc()),
	gestureStart: null,
	cropAspect: 'free',
	exportSettings: DEFAULT_EXPORT,

	load(owner) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(createImageDoc()),
			gestureStart: null,
			cropAspect: 'free',
			exportSettings: DEFAULT_EXPORT,
		});
	},

	retarget(from, to) {
		const { history, cropAspect } = get();
		const ratio = cropRatio(cropAspect, orientedSize(from, history.present.rotation));
		// Past states hold coordinates of the previous image: the history starts again from here.
		set({ history: createHistory(adaptDoc(history.present, from, to, ratio)), gestureStart: null });
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

	setCropAspect(cropAspect) {
		set({ cropAspect });
	},

	setExport(settings) {
		set({ exportSettings: { ...get().exportSettings, ...settings } });
	},
}));

export function useImageDoc(): ImageDoc {
	return useImageEditor((state) => state.history.present);
}

export function useUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useImageEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}
