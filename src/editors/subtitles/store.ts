import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import type { SubtitleDoc, SubtitleFormat } from './document';
import type { EncodingId } from './formats/encoding';

export interface SubtitleExportSettings {
	format: SubtitleFormat;
}

interface SubtitleEditorState {
	/** Which document is shown: a track of the opened file. Changes when another one is shown. */
	key: string | null;
	history: History<SubtitleDoc>;
	gestureStart: SubtitleDoc | null;
	/** Character set the file was read with. */
	encoding: EncodingId;
	/** Selected cues. The last one clicked is `active`, the one the edit box shows. */
	selection: ReadonlySet<number>;
	active: number | null;
	exportSettings: SubtitleExportSettings;

	/** Shows a document with its history: a track read for the first time, or one shown again. */
	show: (key: string, history: History<SubtitleDoc>, encoding: EncodingId) => void;
	/** The same file read again with another character set: a fresh history. */
	reload: (doc: SubtitleDoc, encoding: EncodingId) => void;
	apply: (change: (doc: SubtitleDoc) => SubtitleDoc) => void;
	preview: (change: (doc: SubtitleDoc) => SubtitleDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	select: (ids: Iterable<number>, active?: number | null) => void;
	setExport: (settings: Partial<SubtitleExportSettings>) => void;
}

function emptyDoc(): SubtitleDoc {
	return { format: 'srt', cues: [], ass: null, vttHeader: null };
}

export const useSubtitleEditor = create<SubtitleEditorState>((set, get) => ({
	key: null,
	history: createHistory(emptyDoc()),
	gestureStart: null,
	encoding: 'utf-8',
	selection: new Set(),
	active: null,
	exportSettings: { format: 'srt' },

	show(key, history, encoding) {
		const first = history.present.cues.find((cue) => !cue.comment)?.id ?? null;
		set({
			key,
			history,
			gestureStart: null,
			encoding,
			selection: new Set(first === null ? [] : [first]),
			active: first,
			// Export defaults to the track's own format.
			exportSettings: { format: history.present.format },
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
