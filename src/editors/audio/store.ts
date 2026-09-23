import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import type { Range } from '@/document/timemap';
import { type AudioDoc, createAudioDoc } from './document';

/** Shortest span the timeline zooms to, in seconds. */
export const MIN_VIEW = 1;

interface AudioEditorState {
	/** The file the history belongs to. Another file starts a fresh history. */
	owner: object | null;
	history: History<AudioDoc>;
	/** Document before the gesture in progress, so a whole drag becomes one undo step. */
	gestureStart: AudioDoc | null;

	/** Where playback starts and where the playhead is drawn, in source seconds. */
	playhead: number;
	playing: boolean;
	/** Passage selected on the waveform, in source seconds. Not part of the document. */
	selection: Range | null;
	/** Visible part of the timeline, in source seconds. */
	view: Range;

	load: (owner: object, duration: number) => void;
	apply: (change: (doc: AudioDoc) => AudioDoc) => void;
	preview: (change: (doc: AudioDoc) => AudioDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	setPlayhead: (time: number) => void;
	setPlaying: (playing: boolean) => void;
	setSelection: (selection: Range | null) => void;
	setView: (view: Range) => void;
}

/** Keeps a view within the source and at least MIN_VIEW long, preserving its length when possible. */
export function clampView(view: Range, duration: number): Range {
	const length = Math.min(duration, Math.max(MIN_VIEW, view.end - view.start));
	const start = Math.min(Math.max(0, view.start), duration - length);
	return { start, end: start + length };
}

export const useAudioEditor = create<AudioEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createAudioDoc(0)),
	gestureStart: null,
	playhead: 0,
	playing: false,
	selection: null,
	view: { start: 0, end: 0 },

	load(owner, duration) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(createAudioDoc(duration)),
			gestureStart: null,
			playhead: 0,
			playing: false,
			selection: null,
			view: { start: 0, end: duration },
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

	setSelection(selection) {
		set({ selection });
	},

	setView(view) {
		set({ view: clampView(view, get().history.present.duration) });
	},
}));

export function useAudioDoc(): AudioDoc {
	return useAudioEditor((state) => state.history.present);
}

export function useAudioUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useAudioEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}
