import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import { clampView, type Range } from '@/document/timemap';
import type { SubtitleDoc, SubtitleFormat } from './document';
import type { EncodingId } from './formats/encoding';

export interface SubtitleExportSettings {
	format: SubtitleFormat;
}

/** What the editor first shows of a long file: about a minute, enough to read cue by cue. */
const FIRST_VIEW = 60;

interface SubtitleEditorState {
	owner: object | null;
	history: History<SubtitleDoc>;
	gestureStart: SubtitleDoc | null;
	/** Character set the file was read with. */
	encoding: EncodingId;
	/** Selected cues. The last one clicked is `active`, the one the editor panel shows. */
	selection: ReadonlySet<number>;
	active: number | null;
	/** Seconds. */
	playhead: number;
	playing: boolean;
	/** Visible part of the timeline, in seconds. */
	view: Range;
	/** Length of the timeline in seconds: the preview media, or the last cue with some room. */
	length: number;
	exportSettings: SubtitleExportSettings;

	load: (owner: object, doc: SubtitleDoc, encoding: EncodingId) => void;
	/** The same file read again with another character set: a fresh history, the same view. */
	reload: (doc: SubtitleDoc, encoding: EncodingId) => void;
	apply: (change: (doc: SubtitleDoc) => SubtitleDoc) => void;
	preview: (change: (doc: SubtitleDoc) => SubtitleDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	select: (ids: Iterable<number>, active?: number | null) => void;
	setPlayhead: (time: number) => void;
	setPlaying: (playing: boolean) => void;
	setView: (view: Range) => void;
	setLength: (length: number) => void;
	setExport: (settings: Partial<SubtitleExportSettings>) => void;
}

function emptyDoc(): SubtitleDoc {
	return { format: 'srt', cues: [], ass: null, vttHeader: null };
}

export const useSubtitleEditor = create<SubtitleEditorState>((set, get) => ({
	owner: null,
	history: createHistory(emptyDoc()),
	gestureStart: null,
	encoding: 'utf-8',
	selection: new Set(),
	active: null,
	playhead: 0,
	playing: false,
	view: { start: 0, end: FIRST_VIEW },
	length: FIRST_VIEW,
	exportSettings: { format: 'srt' },

	load(owner, doc, encoding) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(doc),
			gestureStart: null,
			encoding,
			selection: new Set(),
			active: null,
			playhead: 0,
			playing: false,
			view: { start: 0, end: FIRST_VIEW },
			// Export defaults to the file's own format.
			exportSettings: { format: doc.format },
		});
	},

	reload(doc, encoding) {
		set({ history: createHistory(doc), gestureStart: null, encoding, selection: new Set(), active: null });
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

	select(ids, active) {
		const selection = new Set(ids);
		set({ selection, active: active === undefined ? ([...selection].at(-1) ?? null) : active });
	},

	setPlayhead(playhead) {
		set({ playhead });
	},

	setPlaying(playing) {
		set({ playing });
	},

	setView(view) {
		set({ view: clampView(view, get().length) });
	},

	setLength(length) {
		const view = get().view;
		const first = view.end - view.start >= get().length - 1e-6 ? { start: 0, end: FIRST_VIEW } : view;
		set({ length, view: clampView(first, length) });
	},

	setExport(settings) {
		set({ exportSettings: { ...get().exportSettings, ...settings } });
	},
}));

export function useSubtitleDoc(): SubtitleDoc {
	return useSubtitleEditor((state) => state.history.present);
}

export function useSubtitleUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useSubtitleEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}
