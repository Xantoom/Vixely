import { create } from 'zustand';
import { peekTaskIntent } from '@/app/tasks';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import { clampView, type Range } from '@/document/timemap';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { usePlayback } from '@/media/playback';
import type { ImageDoc } from '../image/document';
import { overlayEditing, type PictureEditing } from '../image/editing';
import type { AspectId } from '../image/store';
import { createVideoDoc, type VideoDoc } from './document';
import {
	presetSettings,
	settingsFromSource,
	type VideoCodecId,
	type VideoExportSettings,
	type VideoSource,
} from './export';

/** What the export starts from, read once per file. */
export interface ExportSource {
	owner: object;
	source: VideoSource;
	/** Codecs this browser encodes at the video's size. */
	encodable: VideoCodecId[];
	/** Shorter side of the upright pictures, which presets bring down. */
	shortSide: number;
}

/** The settings a video starts from: the source's, or those of the task page it was opened from. */
function startingSettings({ source, encodable, shortSide }: ExportSource): VideoExportSettings {
	const settings = settingsFromSource(source, encodable);
	const intent = peekTaskIntent();
	if (intent?.preset) return { ...settings, ...presetSettings(intent.preset, source, encodable, shortSide) };
	return intent?.encode ? { ...settings, mode: 'encode' } : settings;
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
	/** Source ranges an export as it is will really hold, once widened to key frames. */
	copied: Range[] | null;

	/** The batch the export settings belong to: they stay while going through its files. */
	batchKey: object | null;

	load: (owner: object, duration: number, batchKey?: object | null) => void;
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
	setCopied: (copied: Range[] | null) => void;
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
	copied: null,
	batchKey: null,

	load(owner, duration, batchKey = null) {
		if (get().owner === owner) return;
		const sameBatch = batchKey !== null && get().batchKey === batchKey;
		set({
			batchKey,
			owner,
			history: createHistory(createVideoDoc(duration)),
			gestureStart: null,
			selection: null,
			view: { start: 0, end: duration },
			cropAspect: 'free',
			exportSource: null,
			exportSettings: sameBatch ? get().exportSettings : null,
			copied: null,
		});
	},

	adoptSource(exportSource) {
		if (get().exportSource?.owner === exportSource.owner) return;
		set({ exportSource, exportSettings: get().exportSettings ?? startingSettings(exportSource) });
	},

	setCopied(copied) {
		set({ copied });
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
export function useVideoPictureEditing(
	size: { width: number; height: number },
	still: ImageBitmap | null,
): PictureEditing {
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
		still,
	};
}

/** Text and stickers over the video: each shows all along or for a part of it. */
export function videoOverlayEditing(picture: PictureEditing, duration: number): OverlayEditing {
	return { ...overlayEditing(picture), timing: { duration, playhead: () => usePlayback.getState().time } };
}
