import { create } from 'zustand';
import { canRedo, canUndo, commit, createHistory, type History, redo, replace, undo } from '@/document/history';
import { clampView, type Range } from '@/document/timemap';
import { type AudioDoc, createAudioDoc } from './document';
import { AUDIO_FORMATS, type AudioExportSettings, settingsFromSource, type SourceFormat } from './export';

export type AudioTags = NonNullable<AudioExportSettings['tags']>;

export { MIN_VIEW } from '@/document/timemap';

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
	exportSettings: AudioExportSettings;
	/** Owner whose export settings were taken from its source file, so it happens once. */
	adopted: object | null;
	/** Audio track edited, for videos with several; null for the file's main one. */
	audioTrack: number | null;

	load: (owner: object, duration: number, tags: AudioTags) => void;
	/** Moves the edits of a batch to another file: its own length, everything kept. */
	retarget: (duration: number) => void;
	apply: (change: (doc: AudioDoc) => AudioDoc) => void;
	preview: (change: (doc: AudioDoc) => AudioDoc) => void;
	settle: () => void;
	undo: () => void;
	redo: () => void;
	setPlayhead: (time: number) => void;
	setPlaying: (playing: boolean) => void;
	setSelection: (selection: Range | null) => void;
	setView: (view: Range) => void;
	setExport: (settings: Partial<AudioExportSettings>) => void;
	/** Starts the export settings from the source's own format, once per file or batch. */
	adoptSource: (source: SourceFormat) => void;
	/** Edits another audio track of the file; its format is adopted again. */
	setAudioTrack: (track: number | null) => void;
}

function defaultExport(tags: AudioTags): AudioExportSettings {
	return {
		mode: 'copy',
		format: 'mp3',
		bitrate: AUDIO_FORMATS.mp3.defaultBitrate,
		sampleRate: null,
		channels: 'keep',
		bitDepth: 16,
		tags,
		cover: 'keep',
	};
}

export const useAudioEditor = create<AudioEditorState>((set, get) => ({
	owner: null,
	history: createHistory(createAudioDoc(0)),
	gestureStart: null,
	playhead: 0,
	playing: false,
	selection: null,
	view: { start: 0, end: 0 },
	exportSettings: defaultExport({ title: '', artist: '', album: '' }),
	adopted: null,
	audioTrack: null,

	load(owner, duration, tags) {
		if (get().owner === owner) return;
		set({
			owner,
			history: createHistory(createAudioDoc(duration)),
			gestureStart: null,
			playhead: 0,
			playing: false,
			selection: null,
			view: { start: 0, end: duration },
			exportSettings: defaultExport(tags),
			audioTrack: null,
		});
	},

	retarget(duration) {
		const { history } = get();
		if (history.present.duration === duration) return;
		const doc = { ...history.present, duration, trim: { start: 0, end: duration }, cuts: [] };
		// Past states belong to the other file: the history starts again from here.
		set({
			history: createHistory(doc),
			gestureStart: null,
			selection: null,
			playhead: 0,
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

	adoptSource(source) {
		const { owner, adopted, exportSettings } = get();
		if (!owner || adopted === owner) return;
		set({ exportSettings: settingsFromSource(source, exportSettings), adopted: owner });
	},

	setExport(settings) {
		set({ exportSettings: { ...get().exportSettings, ...settings } });
	},

	setAudioTrack(audioTrack) {
		get().setPlaying(false);
		set({ audioTrack, adopted: null });
	},
}));

export function useAudioDoc(): AudioDoc {
	return useAudioEditor((state) => state.history.present);
}

export function useAudioUndoState(): { canUndo: boolean; canRedo: boolean } {
	const history = useAudioEditor((state) => state.history);
	return { canUndo: canUndo(history), canRedo: canRedo(history) };
}
