import { create } from 'zustand';
import { createHistory, type History } from '@/document/history';
import { usePlayback } from '@/media/playback';
import { outputName } from '@/media/save';
import type { OpenedFile } from '@/media/session';
import { type MediaTrackInfo, SubtitleSource, type SubtitleTrackInfo } from '@/media/subtitle-source';
import type { SubtitleDoc } from './document';
import { parseSubtitles } from './formats';
import { decodeText, detectEncoding, type EncodingId } from './formats/encoding';
import { useSubtitleEditor } from './store';
import { preferredTrack, supDoc, trackDoc, trackKind } from './tracks';

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
}

type Status = 'idle' | 'reading' | 'ready' | 'unreadable';

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

	/**
	 * Reads a file: all the subtitle tracks of a video at once, so switching between them is
	 * instant. The file already open is kept as it is, with its edits.
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
}

function emptyDoc(): SubtitleDoc {
	return { format: 'srt', cues: [], ass: null, vttHeader: null };
}

const TEXT_FORMATS = new Set(['srt', 'vtt', 'ass']);

/** Incremented for every file opened: answers for an older one are dropped. */
let run = 0;

function showKey(key: TrackKey): string {
	return `${run}:${key}`;
}

export const useSubtitleProject = create<ProjectState>((set, get) => {
	const ready = (tracks: ProjectTrack[], first: TrackKey, patch: Partial<ProjectState> = {}) => {
		set({ tracks, current: null, status: 'ready', progress: 1, ...patch });
		get().choose(first);
	};

	const openVideo = async (file: File, mine: number) => {
		const newTrack: ProjectTrack = { key: 'new', info: null, original: emptyDoc(), history: null };
		let source: SubtitleSource | null = null;
		try {
			source = await SubtitleSource.open(file);
			if (mine !== run) return;
			const infos = source.tracks;
			const readable = infos.filter((info) => trackKind(info) !== null);
			const extracted = await source.extract(
				readable.map((info) => info.id),
				(progress) => {
					if (mine === run) set({ progress });
				},
			);
			const docs = await Promise.all(
				readable.map(async (info, index) => {
					const track = extracted[index];
					return track ? trackDoc(info, track).catch(() => null) : null;
				}),
			);
			// ASS styles name fonts the video usually carries.
			const fonts = readable.some((info) => trackKind(info) === 'ass') ? await source.fonts() : [];
			if (mine !== run) return;
			const tracks: ProjectTrack[] = infos.map((info) => {
				const index = readable.indexOf(info);
				return { key: info.id, info, original: index === -1 ? null : (docs[index] ?? null), history: null };
			});
			const preferred = preferredTrack(infos.filter((_, index) => tracks[index]?.original));
			ready([...tracks, newTrack], preferred?.id ?? 'new', { fonts, media: source.media });
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

		open(opened) {
			if (opened.file === get().file) return;
			const mine = ++run;
			const { file, format } = opened;
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
			if (!target?.original || key === current) return;
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
			const added: ProjectTrack[] = read.flatMap(({ file, doc }) => {
				if (!doc) return [];
				addedCount += 1;
				const forced = /\.forced\./i.test(file.name);
				return [
					{
						key: `added-${addedCount}` as const,
						info: {
							id: -addedCount,
							codec:
								doc.format === 'pgs'
									? 'S_HDMV/PGS'
									: doc.format === 'ass'
										? 'S_TEXT/ASS'
										: 'S_TEXT/UTF8',
							language: fileLanguage(file.name),
							name: '',
							default: false,
							forced,
							readable: true,
						},
						original: doc,
						history: null,
					},
				];
			});
			const tracks = get().tracks;
			// Before the new subtitles, which stay last.
			const at = tracks.findIndex((track) => track.key === 'new');
			set({ tracks: at === -1 ? [...tracks, ...added] : tracks.toSpliced(at, 0, ...added) });
			return read.find(({ doc }) => doc === null)?.file.name ?? null;
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
	if (source !== 'video') return outputName(file.name, extension, ['ssa']);
	const base = file.name.replace(/\.[^.]+$/, '');
	const info = tracks.find((track) => track.key === current)?.info;
	const language = info && info.language !== 'und' ? `.${info.language}` : '';
	return `${base}${language}${info?.forced ? '.forced' : ''}.${extension}`;
}

/** Whether the track comes from a subtitle file added to the video. */
export function isAdded(key: TrackKey | null): key is `added-${number}` {
	return typeof key === 'string' && key.startsWith('added-');
}
