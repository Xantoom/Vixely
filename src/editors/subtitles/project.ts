import { create } from 'zustand';
import { registerRestorable, takeRestore } from '@/app/resume';
import { canRedo, canUndo, createHistory, type History } from '@/document/history';
import { usePlayback } from '@/media/playback';
import { outputName } from '@/media/save';
import { useSession } from '@/media/session';
import type { OpenedFile } from '@/media/session';
import { type MediaTrackInfo, SubtitleSource, type SubtitleTrackInfo } from '@/media/subtitle-source';
import type { SubtitleDoc } from './document';
import { parseSubtitles } from './formats';
import { decodeText, detectEncoding, type EncodingId } from './formats/encoding';
import { type SubtitleExportSettings, useSubtitleEditor } from './store';
import { type BatchLines, preferredTrack, supDoc, TrackReader, trackKind } from './tracks';

/**
 * A track of the video by its number, the subtitles of a subtitle file, new subtitles, or a
 * subtitle file added to the video as a track.
 */
export type TrackKey = number | 'file' | 'new' | `added-${number}`;

/** Two-letter language codes found in subtitle file names (film.fr.srt), as Matroska writes them. */
const FILE_LANGUAGES: Record<string, string> = {
	fr: 'fre',
	en: 'eng',
	de: 'ger',
	es: 'spa',
	it: 'ita',
	pt: 'por',
	nl: 'dut',
	ja: 'jpn',
	zh: 'chi',
	ko: 'kor',
	ru: 'rus',
	ar: 'ara',
	pl: 'pol',
	sv: 'swe',
};

/** The language a subtitle file's name gives, as in film.fr.srt or film.fre.forced.srt. */
export function fileLanguage(name: string): string {
	const parts = name.toLowerCase().split('.').slice(1, -1);
	for (const part of parts.toReversed()) {
		const code = FILE_LANGUAGES[part] ?? (Object.values(FILE_LANGUAGES).includes(part) ? part : null);
		if (code) return code;
	}
	return 'und';
}

let addedCount = 0;

/** Reads a subtitle file: text formats and Blu-ray pictures. Null when it can't be read. */
async function readSubtitleFile(file: File): Promise<SubtitleDoc | null> {
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (/\.sup$/i.test(file.name)) {
			const doc = await supDoc(bytes);
			return doc.cues.length > 0 ? doc : null;
		}
		return parseSubtitles(decodeText(bytes, detectEncoding(bytes)));
	} catch {
		return null;
	}
}

export interface ProjectTrack {
	key: TrackKey;
	/** The track as the video lists it; null for a subtitle file and for new subtitles. */
	info: SubtitleTrackInfo | null;
	/** The document as read; null when it can't be opened. */
	original: SubtitleDoc | null;
	/** Its edits, kept while another track is shown. */
	history: History<SubtitleDoc> | null;
	/**
	 * Lines are still being read from the video, a batch at a time: they are added to the document
	 * and to every state of its history as they come. `original` stays null until the first batch.
	 */
	reading?: boolean;
	/** A translation: the track it translates, and the original text of each of its lines by id. */
	origin?: { key: TrackKey; texts: ReadonlyMap<number, string> } | null;
}

/** A track made here: from a file, a translation, text recognition or a transcription. */
export interface NewTrack {
	doc: SubtitleDoc;
	/** ISO 639-2, `und` when unknown. */
	language: string;
	name?: string;
	forced?: boolean;
	origin?: ProjectTrack['origin'];
}

type Status = 'idle' | 'reading' | 'ready' | 'unreadable';

/** A track as a closed tab keeps it: its edits, and the track itself when it was made here. */
interface KeptTrack {
	key: TrackKey;
	history: History<SubtitleDoc> | null;
	made?: Pick<ProjectTrack, 'info' | 'original' | 'origin'>;
}

interface SubtitlesKept {
	tracks: KeptTrack[];
	current: TrackKey | null;
	exportSettings: SubtitleExportSettings;
}

/** Puts back what a closed tab kept: edits of the file's tracks, and the tracks made here. */
function restored(tracks: ProjectTrack[], kept: SubtitlesKept): ProjectTrack[] {
	const made: ProjectTrack[] = kept.tracks.flatMap(({ key, history, made }) =>
		made ? [{ key, history, info: made.info, original: made.original, origin: made.origin ?? null }] : [],
	);
	for (const { key } of made) addedCount = Math.max(addedCount, Number(String(key).slice('added-'.length)) || 0);
	const edited = tracks.map((track) => {
		const history = kept.tracks.find(({ key }) => key === track.key)?.history;
		return history ? { ...track, history } : track;
	});
	const at = edited.findIndex((track) => track.key === 'new');
	return at === -1 ? [...edited, ...made] : edited.toSpliced(at, 0, ...made);
}

interface ProjectState {
	file: File | null;
	/** What was opened: a subtitle file, a `.sup`, or a video and its tracks. */
	source: 'text' | 'sup' | 'video' | null;
	status: Status;
	/** Share of the video read while its tracks are extracted, 0 to 1. */
	progress: number;
	/** The video's tracks couldn't be listed: it can still get new subtitles. */
	listFailed: boolean;
	tracks: ProjectTrack[];
	current: TrackKey | null;
	/** Fonts attached to the video, for ASS tracks. */
	fonts: Uint8Array[];
	/** Video and audio tracks of a Matroska video, for remuxing. */
	media: MediaTrackInfo[];
	/** Bytes of a subtitle file, to read it again with another character set. */
	bytes: Uint8Array | null;
	/** A track chosen before its first lines were read: shown when they are. */
	wanted: TrackKey | null;

	/**
	 * Reads a file. The tracks of a video are read a batch of lines at a time: the first batch of
	 * the track shown, then the rest of it, then the other tracks, without holding anything up.
	 * The file already open is kept as it is, with its edits.
	 */
	open: (opened: OpenedFile) => void;
	/** Shows another track; the edits of the one left are kept. */
	choose: (key: TrackKey) => void;
	setEncoding: (encoding: EncodingId) => void;
	/**
	 * Adds subtitle files to the open video as new tracks. Resolves with the name of a file that
	 * couldn't be read, or null.
	 */
	addFiles: (files: readonly File[]) => Promise<string | null>;
	/** Takes an added track out again. */
	removeAdded: (key: TrackKey) => void;
	/** Adds a track made here and shows it. */
	addTrack: (track: NewTrack) => TrackKey;
}

function codecOf(doc: SubtitleDoc): string {
	if (doc.format === 'pgs') return 'S_HDMV/PGS';
	if (doc.format === 'ass') return 'S_TEXT/ASS';
	return doc.format === 'vtt' ? 'S_TEXT/WEBVTT' : 'S_TEXT/UTF8';
}

/** A project track for subtitles made or added here. */
function madeTrack({ doc, language, name = '', forced = false, origin = null }: NewTrack): ProjectTrack {
	addedCount += 1;
	return {
		key: `added-${addedCount}`,
		info: { id: -addedCount, codec: codecOf(doc), language, name, default: false, forced, readable: true },
		original: doc,
		history: null,
		origin,
	};
}

function emptyDoc(): SubtitleDoc {
	return { format: 'srt', cues: [], ass: null, vttHeader: null };
}

const TEXT_FORMATS = new Set(['srt', 'vtt', 'ass']);

/** Lines of a track read at once. */
const BATCH = 200;

/** A video's subtitles opened ahead, while the file is still being probed. */
let prepared: { file: File; source: Promise<SubtitleSource> } | null = null;
/** How long a source opened ahead waits to be taken, in ms: the file may open in another editor. */
const PREPARED_WAIT = 20_000;

/**
 * Starts reading the subtitles of a video as soon as it is known to be one, alongside the rest of
 * its opening: the track list, the first lines of the track to show and the fonts are then ready,
 * or nearly, when the editor asks.
 */
export function prepareVideo(file: File) {
	if (prepared?.file === file) return;
	const source = SubtitleSource.open(file).then((opened) => {
		opened.readAhead(preferredTrack(opened.tracks)?.id ?? null, BATCH);
		return opened;
	});
	source.catch(() => undefined);
	const mine = { file, source };
	dropPrepared();
	prepared = mine;
	setTimeout(() => {
		if (prepared === mine) dropPrepared();
	}, PREPARED_WAIT);
}

function dropPrepared() {
	void prepared?.source.then(
		(source) => {
			source.close();
		},
		() => undefined,
	);
	prepared = null;
}

/** The source opened ahead for this file, if any: taken once. */
function takePrepared(file: File): Promise<SubtitleSource> | null {
	if (prepared?.file !== file) return null;
	const { source } = prepared;
	prepared = null;
	return source;
}

/** A file left for another one, as it was: going back to it finds its tracks and edits. */
interface Left {
	state: Pick<ProjectState, 'source' | 'listFailed' | 'tracks' | 'current' | 'fonts' | 'media' | 'bytes'>;
	exportSettings: SubtitleExportSettings;
	encoding: EncodingId;
}

/** Files left while ready, by file: the video editor and the subtitle editor each keep theirs. */
const left = new WeakMap<File, Left>();

/** Incremented for every file opened: answers for an older one are dropped. */
let run = 0;

function showKey(key: TrackKey): string {
	return `${run}:${key}`;
}

export const useSubtitleProject = create<ProjectState>((set, get) => {
	/** Adds tracks before the new subtitles, which stay last. */
	const insert = (added: ProjectTrack[]) => {
		const tracks = get().tracks;
		const at = tracks.findIndex((track) => track.key === 'new');
		set({ tracks: at === -1 ? [...tracks, ...added] : tracks.toSpliced(at, 0, ...added) });
	};

	const ready = (
		read: ProjectTrack[],
		first: TrackKey,
		patch: Partial<ProjectState> = {},
		kept = takeRestore<SubtitlesKept>('subtitles'),
	) => {
		const tracks = kept ? restored(read, kept) : read;
		const shown = kept?.current ?? first;
		set({ tracks, current: null, status: 'ready', progress: 1, ...patch });
		get().choose(tracks.some((track) => track.key === shown && track.original) ? shown : first);
		if (kept) useSubtitleEditor.getState().setExport(kept.exportSettings);
	};

	/** Adds the lines of a batch to a track, and to every state of its history. */
	const grow = (key: TrackKey, reader: TrackReader, lines: BatchLines, empty: SubtitleDoc | null, last: boolean) => {
		const track = get().tracks.find((candidate) => candidate.key === key);
		const before = track?.original ?? empty;
		if (!track || !before) return;
		const add = (doc: SubtitleDoc): SubtitleDoc => ({
			...doc,
			cues: lines.cues.length > 0 ? [...doc.cues, ...lines.cues] : doc.cues,
			...(lines.pgsSize && !doc.pgsSize ? { pgsSize: lines.pgsSize } : {}),
		});
		let after = add(before);
		if (last) after = { ...after, cues: reader.inFileOrder(after.cues) };
		// The document as read becomes the new one; edited ones get the lines at the end.
		const extend = (doc: SubtitleDoc) => (doc === track.original ? after : add(doc));
		const history = track.history && {
			past: track.history.past.map(extend),
			present: extend(track.history.present),
			future: track.history.future.map(extend),
		};
		set({
			tracks: get().tracks.map((candidate) =>
				candidate.key === key ? { ...candidate, original: after, history, reading: !last } : candidate,
			),
		});
		if (key === get().current) useSubtitleEditor.getState().extend(showKey(key), extend);
		else if (key === get().wanted && (after.cues.length > 0 || last)) {
			set({ wanted: null });
			get().choose(key);
		}
	};

	/** A track that can't be read after all. */
	const unreadable = (key: TrackKey) => {
		set({
			tracks: get().tracks.map((track) => (track.key === key ? { ...track, reading: false } : track)),
			...(get().wanted === key ? { wanted: null } : {}),
		});
	};

	const openVideo = async (file: File, mine: number) => {
		const newTrack: ProjectTrack = { key: 'new', info: null, original: emptyDoc(), history: null };
		let source: SubtitleSource | null = null;
		try {
			source = await (takePrepared(file) ?? SubtitleSource.open(file));
			if (mine !== run) return;
			const opened = source;
			const infos = opened.tracks;
			const readers = new Map(
				infos.filter((info) => trackKind(info) !== null).map((info) => [info.id, new TrackReader(info)]),
			);
			/** Lines of each track read so far, and how many it has once known. */
			const read = new Map<number, { next: number; total: number }>();
			set({
				tracks: [
					...infos.map((info) => ({
						key: info.id,
						info,
						original: null,
						history: null,
						reading: readers.has(info.id),
					})),
					newTrack,
				],
				media: opened.media,
			});

			/** Reads the next batch of a track. */
			const readBatch = async (id: number, onProgress?: (share: number) => void) => {
				const reader = readers.get(id);
				const at = read.get(id) ?? { next: 0, total: Number.POSITIVE_INFINITY };
				if (!reader) return;
				try {
					const batch = await opened.batch(id, at.next, BATCH, onProgress);
					if (mine !== run) return;
					const next = at.next + BATCH;
					read.set(id, { next, total: batch.total });
					const last = next >= batch.total;
					const empty = at.next === 0 ? reader.empty(batch.packets.codecPrivate) : null;
					if (at.next === 0 && !empty) {
						unreadable(id);
						return;
					}
					grow(id, reader, await reader.lines(batch.packets, batch.next, last), empty, last);
				} catch {
					if (mine === run) unreadable(id);
				}
			};
			/** The track to read next: the one asked for, the one shown, then the others in order. */
			const nextTrack = (): number | null => {
				const { tracks, wanted, current } = get();
				const reading = tracks.filter((track) => track.reading && typeof track.key === 'number');
				const pick =
					reading.find((track) => track.key === wanted) ??
					reading.find((track) => track.key === current) ??
					reading[0];
				return typeof pick?.key === 'number' ? pick.key : null;
			};

			// A closed tab's edits are put back on tracks read whole.
			const kept = takeRestore<SubtitlesKept>('subtitles');
			const whole = new Set(
				kept?.tracks.flatMap(({ key }) => (typeof key === 'number' && readers.has(key) ? [key] : [])),
			);
			const isReading = (id: number) => get().tracks.some((track) => track.key === id && track.reading);
			for (const id of whole) {
				// oxlint-disable-next-line no-await-in-loop -- tracks are read in turn
				while (mine === run && isReading(id)) await readBatch(id);
			}
			// The track shown: its first lines, then everything else in the background.
			const preferred = preferredTrack(infos);
			if (preferred && isReading(preferred.id)) {
				await readBatch(preferred.id, (progress) => {
					if (mine === run) set({ progress });
				});
			}
			// ASS styles name fonts the video usually carries.
			const fonts = infos.some((info) => trackKind(info) === 'ass') ? await opened.fonts() : [];
			if (mine !== run) return;
			const shown = get().tracks.find((track) => track.key === preferred?.id && track.original);
			ready(get().tracks, shown?.key ?? 'new', { fonts }, kept);

			for (let id = nextTrack(); id !== null && mine === run; id = nextTrack()) {
				// oxlint-disable-next-line no-await-in-loop -- one batch at a time, the most wanted first
				await readBatch(id);
			}
		} catch {
			if (mine !== run) return;
			ready([newTrack], 'new', { listFailed: true });
		} finally {
			source?.close();
		}
	};

	return {
		file: null,
		source: null,
		status: 'idle',
		progress: 0,
		listFailed: false,
		tracks: [],
		current: null,
		fonts: [],
		media: [],
		bytes: null,
		wanted: null,

		open(opened) {
			if (opened.file === get().file) return;
			const leaving = get();
			// A file left while its tracks are still read is read again when it comes back.
			if (leaving.file && leaving.status === 'ready' && !leaving.tracks.some((track) => track.reading)) {
				const editor = useSubtitleEditor.getState();
				editor.settle();
				const { history, exportSettings, encoding } = useSubtitleEditor.getState();
				const { source, listFailed, tracks, current, fonts, media, bytes } = leaving;
				left.set(leaving.file, {
					state: {
						source,
						listFailed,
						tracks: tracks.map((track) => (track.key === current ? { ...track, history } : track)),
						current,
						fonts,
						media,
						bytes,
					},
					exportSettings,
					encoding,
				});
			}
			const mine = ++run;
			const { file, format } = opened;
			const back = left.get(file);
			if (back) {
				left.delete(file);
				set({ ...back.state, file, status: 'ready', progress: 1, current: null });
				usePlayback.getState().load(back.state.source === 'video' ? file : null);
				const shown = back.state.tracks.find((track) => track.key === back.state.current);
				if (shown?.original) {
					set({ current: shown.key });
					useSubtitleEditor
						.getState()
						.show(showKey(shown.key), shown.history ?? createHistory(shown.original), back.encoding);
				}
				useSubtitleEditor.getState().setExport(back.exportSettings);
				return;
			}
			const kind = TEXT_FORMATS.has(format) ? 'text' : format === 'pgs' ? 'sup' : 'video';
			set({
				file,
				source: kind,
				status: 'reading',
				progress: 0,
				listFailed: false,
				tracks: [],
				current: null,
				fonts: [],
				media: [],
				bytes: null,
				wanted: null,
			});
			// A video plays under its own subtitles; a subtitle file starts without one.
			usePlayback.getState().load(kind === 'video' ? file : null);
			if (kind === 'video') {
				void openVideo(file, mine);
				return;
			}
			void file
				.arrayBuffer()
				.then(async (buffer) => {
					const bytes = new Uint8Array(buffer);
					if (kind === 'sup') {
						const doc = await supDoc(bytes);
						return { doc: doc.cues.length > 0 ? doc : null, bytes: null, encoding: 'utf-8' as const };
					}
					const encoding = detectEncoding(bytes);
					return { doc: parseSubtitles(decodeText(bytes, encoding)), bytes, encoding };
				})
				.catch(() => ({ doc: null, bytes: null, encoding: 'utf-8' as const }))
				.then(({ doc, bytes, encoding }) => {
					if (mine !== run) return;
					if (!doc) {
						set({ status: 'unreadable' });
						return;
					}
					useSubtitleEditor.setState({ encoding });
					ready([{ key: 'file', info: null, original: doc, history: null }], 'file', { bytes });
				});
		},

		choose(key) {
			const { tracks, current } = get();
			const target = tracks.find((track) => track.key === key);
			if (key === current) return;
			if (!target?.original) {
				if (target?.reading) set({ wanted: key });
				return;
			}
			const editor = useSubtitleEditor.getState();
			editor.settle();
			const kept = tracks.map((track) =>
				track.key === current ? { ...track, history: useSubtitleEditor.getState().history } : track,
			);
			set({ tracks: kept, current: key });
			editor.show(showKey(key), target.history ?? createHistory(target.original), editor.encoding);
		},

		async addFiles(files) {
			const owner = get().file;
			const read = await Promise.all(files.map(async (file) => ({ file, doc: await readSubtitleFile(file) })));
			if (get().file !== owner || get().source !== 'video') return files[0]?.name ?? null;
			const added = read.flatMap(({ file, doc }) =>
				doc
					? [madeTrack({ doc, language: fileLanguage(file.name), forced: /\.forced\./i.test(file.name) })]
					: [],
			);
			insert(added);
			return read.find(({ doc }) => doc === null)?.file.name ?? null;
		},

		addTrack(track) {
			const made = madeTrack(track);
			insert([made]);
			get().choose(made.key);
			return made.key;
		},

		removeAdded(key) {
			const { tracks, current } = get();
			if (typeof key !== 'string' || !key.startsWith('added-')) return;
			const rest = tracks.filter((track) => track.key !== key);
			set({ tracks: rest });
			if (current === key) {
				set({ current: null });
				const next =
					rest.find((track) => track.original && track.key !== 'new') ??
					rest.find((track) => track.key === 'new');
				if (next) get().choose(next.key);
			}
		},

		setEncoding(encoding) {
			const bytes = get().bytes;
			if (!bytes) return;
			const doc = parseSubtitles(decodeText(bytes, encoding));
			if (!doc) return;
			set({ tracks: get().tracks.map((track) => (track.key === 'file' ? { ...track, original: doc } : track)) });
			useSubtitleEditor.getState().reload(doc, encoding);
		},
	};
});

registerRestorable('subtitles', {
	snapshot: () => {
		const { file, status, tracks, current } = useSubtitleProject.getState();
		if (status !== 'ready' || !file || file !== useSession.getState().current?.file) return null;
		const editor = useSubtitleEditor.getState();
		const kept = tracks.flatMap((track): KeptTrack[] => {
			if (track.reading) return [];
			const history = track.key === current ? editor.history : track.history;
			if (isAdded(track.key)) {
				return [
					{
						key: track.key,
						history,
						made: { info: track.info, original: track.original, origin: track.origin ?? null },
					},
				];
			}
			return history && (canUndo(history) || canRedo(history)) ? [{ key: track.key, history }] : [];
		});
		if (kept.length === 0) return null;
		return { tracks: kept, current, exportSettings: editor.exportSettings } satisfies SubtitlesKept;
	},
	subscribe: (listener) => {
		const project = useSubtitleProject.subscribe(listener);
		const editor = useSubtitleEditor.subscribe(listener);
		return () => {
			project();
			editor();
		};
	},
});

/** The document of a track as it is now: edited in the editor, kept aside, or as read. */
function presentDoc(track: ProjectTrack, current: TrackKey | null, shown: SubtitleDoc): SubtitleDoc | null {
	if (track.key === current) return shown;
	return track.history?.present ?? track.original;
}

export interface TrackState extends ProjectTrack {
	doc: SubtitleDoc | null;
	/** Changed since it was read; new subtitles count once they have a line. */
	edited: boolean;
}

/** Every track with its current document and whether it was edited. */
export function useProjectTracks(): TrackState[] {
	const tracks = useSubtitleProject((state) => state.tracks);
	const current = useSubtitleProject((state) => state.current);
	const shown = useSubtitleEditor((state) => state.history.present);
	return tracks.map((track) => {
		const doc = presentDoc(track, current, shown);
		// A file added to the video is always written into it.
		const edited = track.key === 'new' ? (doc?.cues.length ?? 0) > 0 : isAdded(track.key) || doc !== track.original;
		return { ...track, doc, edited };
	});
}

/** Whether the document on screen belongs to the open file. */
export function useProjectReady(): boolean {
	const status = useSubtitleProject((state) => state.status);
	const current = useSubtitleProject((state) => state.current);
	const key = useSubtitleEditor((state) => state.key);
	return status === 'ready' && current !== null && key === showKey(current);
}

/**
 * Name of an exported file. Tracks of a video are named the way players look for subtitles next
 * to it: film.fre.srt, film.eng.forced.sup.
 */
export function exportName(extension: string): string {
	const { file, source, tracks, current } = useSubtitleProject.getState();
	if (!file) return `subtitles.${extension}`;
	const info = tracks.find((track) => track.key === current)?.info;
	if (source !== 'video' && !isAdded(current)) return outputName(file.name, extension, ['ssa']);
	// A subtitle file's own language (film.fr.srt) gives way to the track's.
	const name = file.name.replace(/\.[^.]+$/, '');
	const base = source === 'video' ? name : name.replace(/(\.forced)?(\.[a-z]{2,3})?(\.forced)?$/i, '');
	const language = info && info.language !== 'und' ? `.${info.language}` : '';
	return `${base}${language}${info?.forced ? '.forced' : ''}.${extension}`;
}

/** Whether the track comes from a subtitle file added to the video. */
export function isAdded(key: TrackKey | null): key is `added-${number}` {
	return typeof key === 'string' && key.startsWith('added-');
}

/** A track's document as it is now, for work started from it (a translation, a burn). */
export function currentTrackDoc(key: TrackKey): SubtitleDoc | null {
	const { tracks, current } = useSubtitleProject.getState();
	const track = tracks.find((candidate) => candidate.key === key);
	return track ? presentDoc(track, current, useSubtitleEditor.getState().history.present) : null;
}

/** The original text of each line of the track shown, when it is a translation. */
export function useOrigin(): ReadonlyMap<number, string> | null {
	return useSubtitleProject(
		(state) => state.tracks.find((track) => track.key === state.current)?.origin?.texts ?? null,
	);
}

/**
 * Resolves once every line of a track is read, or of every track when none is given: for work on
 * a whole track (an export, a shift, a search), which must not miss lines still being read.
 */
export async function whenRead(key?: TrackKey | null): Promise<void> {
	const done = () =>
		!useSubtitleProject
			.getState()
			.tracks.some((track) => track.reading && (key === undefined || key === null || track.key === key));
	if (done()) return;
	await new Promise<void>((resolve) => {
		const stop = useSubtitleProject.subscribe(() => {
			if (!done()) return;
			stop();
			resolve();
		});
	});
}

/** Applies a change to the whole track shown, once all its lines are read. */
export function applyWhole(change: (doc: SubtitleDoc) => SubtitleDoc) {
	const shown = useSubtitleEditor.getState().key;
	void whenRead(useSubtitleProject.getState().current).then(() => {
		const editor = useSubtitleEditor.getState();
		if (editor.key === shown) editor.apply(change);
	});
}

/** Whether a track holds pictures (PGS), read already or not yet. */
export function isPictures(track: ProjectTrack): boolean {
	if (track.original) return track.original.format === 'pgs';
	return track.reading === true && track.info !== null && trackKind(track.info) === 'pgs';
}
