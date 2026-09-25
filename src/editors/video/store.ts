import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import { clampView, type Range } from '@/document/timemap';
import type { ImageDoc } from '../image/document';
import type { PictureEditing } from '../image/editing';
import type { AspectId } from '../image/store';
import { createVideoDoc, type VideoDoc } from './document';
import { settingsFromSource, type VideoCodecId, type VideoExportSettings, type VideoSource } from './export';

/** What the export starts from, read once per file. */
export interface ExportSource {
	owner: object;
	source: VideoSource;
	/** Codecs this browser encodes at the video's size. */
	encodable: VideoCodecId[];
}

interface VideoEditorState {
	/** The file the history belongs to. Another file starts a fresh history. */
	owner: object | null;
	history: History<VideoDoc>;
	/** Document before the gesture in progress, so a whole drag becomes one undo step. */
	gestureStart: VideoDoc | null;
	/** Passage selected on the timeline, in source seconds. Not part of the document. */
	selection: Range | null;
	/** Visible part of the timeline, in source seconds. */
	view: Range;
	/** Crop aspect constraint. A tool setting, not part of the document. */
	cropAspect: AspectId;
	exportSource: ExportSource | null;
	/** Starts from the source's own settings once it is read. */
	exportSettings: VideoExportSettings | null;

	load: (owner: object, duration: number) => void;
	apply: (change: (doc: VideoDoc) => VideoDoc) => void;
	preview: (change: (doc: VideoDoc) => VideoDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	setSelection: (selection: Range | null) => void;
	setView: (view: Range) => void;
	setCropAspect: (aspect: AspectId) => void;
	/** Takes the export settings from the source, once per file. */
	adoptSource: (source: ExportSource) => void;
	setExport: (settings: Partial<VideoExportSettings>) => void;
}

export const useVideoEditor = create<VideoEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createVideoDoc(0)),
	gestureStart: null,
	selection: null,
	view: { start: 0, end: 0 },
	cropAspect: 'free',
	exportSource: null,
	exportSettings: null,

	load(owner, duration) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(createVideoDoc(duration)),
			gestureStart: null,
			selection: null,
			view: { start: 0, end: duration },
			cropAspect: 'free',
			exportSource: null,
			exportSettings: null,
		});
	},

	adoptSource(exportSource) {
		if (get().exportSource?.owner === exportSource.owner) return;
		set({ exportSource, exportSettings: settingsFromSource(exportSource.source, exportSource.encodable) });
	},

	setExport(settings) {
		const current = get().exportSettings;
		if (current) set({ exportSettings: { ...current, ...settings } });
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

	setSelection(selection) {
		set({ selection });
	},

	setView(view) {
		set({ view: clampView(view, get().history.present.duration) });
	},

	setCropAspect(cropAspect) {
		set({ cropAspect });
	},
}));

export function useVideoDoc(): VideoDoc {
	return useVideoEditor((state) => state.history.present);
}

export function useVideoUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useVideoEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}

/** Changes the pictures only, through the video's history. */
const onPicture =
	(change: (picture: ImageDoc) => ImageDoc) =>
	(doc: VideoDoc): VideoDoc => ({ ...doc, picture: change(doc.picture) });

/** The video's pictures, for the crop and adjustment panels shared with the image editor. */
export function useVideoPictureEditing(size: { width: number; height: number }): PictureEditing {
	const doc = useVideoEditor((state) => state.history.present.picture);
	const apply = useVideoEditor((state) => state.apply);
	const preview = useVideoEditor((state) => state.preview);
	const settle = useVideoEditor((state) => state.settle);
	const aspect = useVideoEditor((state) => state.cropAspect);
	const setAspect = useVideoEditor((state) => state.setCropAspect);
	return {
		doc,
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
	};
}
