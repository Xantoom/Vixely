import { create } from 'zustand';
import { type AddedTrack, remux, type StreamData, type TrackChoice } from '@/media/remux';
import type { SaveTarget } from '@/media/save-target';
import { getLocale } from '@/paraglide/runtime.js';
import type { SubtitleDoc } from '../subtitles/document';
import { matroskaStream, timedTextStream, trackCodec } from '../subtitles/mux-streams';
import { type TrackKey, type TrackState, useProjectTracks, useSubtitleProject } from '../subtitles/project';
import { codecLabel } from '../subtitles/tracks';

export type MuxKind = 'video' | 'audio' | 'subtitle';

/** The interface language as an ISO 639-2 code. */
function interfaceLanguage(): string {
	return getLocale() === 'fr' ? 'fre' : 'eng';
}

/** A track of the exported video, as MKVToolNix lists them. */
export interface MuxTrack {
	key: string;
	kind: MuxKind;
	/** Track number in the file (Matroska number, MP4 track ID); null for new subtitles. */
	number: number | null;
	/** The subtitle track in the editor, for subtitles. */
	subtitle: TrackKey | null;
	codec: string;
	language: string;
	name: string;
	default: boolean;
	forced: boolean;
	include: boolean;
	/** Changed in the subtitle editor: written from its lines. */
	edited: boolean;
	/** Why it can't go in this container, if it can't. */
	blocked: 'pgs-mp4' | null;
}

type Override = Partial<Pick<MuxTrack, 'include' | 'language' | 'name' | 'default' | 'forced'>>;

interface MuxSettingsState {
	file: File | null;
	overrides: Record<string, Override>;
	set: (file: File, key: string, change: Override) => void;
}

/** What the user changed in the track list, per file: kept while going between editors. */
export const useMuxSettings = create<MuxSettingsState>((set, get) => ({
	file: null,
	overrides: {},
	set(file, key, change) {
		const overrides = get().file === file ? get().overrides : {};
		set({ file, overrides: { ...overrides, [key]: { ...overrides[key], ...change } } });
	},
}));

/** MKV for Matroska and WebM sources, MP4 for MP4 and QuickTime ones. */
export function muxContainer(format: string): 'mkv' | 'mp4' {
	return format === 'mkv' || format === 'webm' ? 'mkv' : 'mp4';
}

interface ListedTrack {
	id: number;
	kind: 'video' | 'audio';
	codec: string;
	language: string;
	name: string;
	default: boolean;
}

/** Short name of a codec: Matroska IDs (`V_MPEG4/ISO/AVC`) and MP4 sample entries (`avc1`). */
function mediaCodec(codec: string): string {
	const names: Record<string, string> = {
		'V_MPEG4/ISO/AVC': 'H.264',
		V_MPEGH_ISO_HEVC: 'HEVC',
		'V_MPEGH/ISO/HEVC': 'HEVC',
		V_AV1: 'AV1',
		V_VP9: 'VP9',
		V_VP8: 'VP8',
		A_AAC: 'AAC',
		A_OPUS: 'Opus',
		A_VORBIS: 'Vorbis',
		A_FLAC: 'FLAC',
		A_AC3: 'AC-3',
		A_EAC3: 'E-AC-3',
		A_DTS: 'DTS',
		A_TRUEHD: 'TrueHD',
		'A_MPEG/L3': 'MP3',
		avc1: 'H.264',
		avc3: 'H.264',
		hvc1: 'HEVC',
		hev1: 'HEVC',
		av01: 'AV1',
		vp09: 'VP9',
		mp4a: 'AAC',
		Opus: 'Opus',
		'ac-3': 'AC-3',
		'ec-3': 'E-AC-3',
		fLaC: 'FLAC',
		'.mp3': 'MP3',
		alac: 'ALAC',
		apch: 'ProRes',
		apcn: 'ProRes',
	};
	return names[codec] ?? codec.replace(/^[VA]_/, '').replace(/^PCM\/INT\/LIT$/, 'PCM');
}

function subtitleCodec(track: TrackState, container: 'mkv' | 'mp4'): string {
	if (container === 'mp4' && (track.edited || !track.info)) return 'Timed Text';
	if (track.edited || !track.info) return track.doc ? codecLabelOf(trackCodec(track.doc)) : '';
	return codecLabel(track.info);
}

function codecLabelOf(codec: string): string {
	return (
		{
			'S_TEXT/UTF8': 'SRT',
			'S_TEXT/ASS': 'ASS',
			'S_TEXT/SSA': 'SSA',
			'S_TEXT/WEBVTT': 'WebVTT',
			'S_HDMV/PGS': 'PGS',
		}[codec] ?? codec
	);
}

/**
 * Every track of the video to export, with the user's choices applied: video and audio as the
 * file has them, subtitles as the subtitle editor has them (new ones once they have a line).
 */
export function useMuxTracks(file: File | null, format: string): { tracks: MuxTrack[]; originals: MuxTrack[] } | null {
	const container = muxContainer(format);
	const projectFile = useSubtitleProject((state) => state.file);
	const status = useSubtitleProject((state) => state.status);
	const media = useSubtitleProject((state) => state.media);
	const subtitles = useProjectTracks();
	const overrides = useMuxSettings((state) => (state.file === file ? state.overrides : null));

	if (!file || projectFile !== file || status !== 'ready') return null;
	const listed: ListedTrack[] = media.map((track) => ({ ...track, codec: mediaCodec(track.codec) }));

	const tracks: MuxTrack[] = listed.map((track) => ({
		key: `${track.kind}-${track.id}`,
		kind: track.kind,
		number: track.id,
		subtitle: null,
		codec: track.codec,
		language: track.language,
		name: track.name,
		default: track.default,
		forced: false,
		include: true,
		edited: false,
		blocked: null,
	}));
	for (const track of subtitles) {
		if (track.key === 'file' || (track.key === 'new' && !track.edited)) continue;
		const pgs = track.doc?.format === 'pgs';
		tracks.push({
			key: `subtitle-${track.key}`,
			kind: 'subtitle',
			number: typeof track.key === 'number' ? track.key : null,
			subtitle: track.key,
			codec: subtitleCodec(track, container),
			// New subtitles are in the language of whoever writes them, until told otherwise.
			language: track.info?.language ?? (track.key === 'new' ? interfaceLanguage() : 'und'),
			name: track.info?.name ?? '',
			default: track.info?.default ?? false,
			forced: track.info?.forced ?? false,
			include: true,
			edited: track.edited,
			blocked: container === 'mp4' && pgs ? 'pgs-mp4' : null,
		});
	}
	const chosen = tracks.map((track) => {
		const change = overrides?.[track.key] ?? {};
		const merged = { ...track, ...change };
		return track.blocked ? { ...merged, include: false } : merged;
	});
	return { tracks: chosen, originals: tracks };
}

/** The subtitle document of a track not on screen: its edits, else as read. */
function docOf(track: MuxTrack): SubtitleDoc | null {
	const entry = useSubtitleProject.getState().tracks.find((candidate) => candidate.key === track.subtitle);
	return entry ? (entry.history?.present ?? entry.original) : null;
}

export interface MuxJob {
	file: File;
	format: string;
	tracks: MuxTrack[];
	/** The document shown in the subtitle editor, which may not be saved in its track yet. */
	shown: () => SubtitleDoc;
	title: string;
}

function currentDoc(job: MuxJob, track: MuxTrack): SubtitleDoc | null {
	if (track.subtitle !== null && track.subtitle === useSubtitleProject.getState().current) return job.shown();
	return docOf(track);
}

/** Changes the user made to a track's details, which Matroska stores in its header. */
function changed(track: MuxTrack, original: MuxTrack | undefined): Partial<TrackChoice> {
	if (!original) return {};
	const change: Partial<TrackChoice> = {};
	if (track.language !== original.language) change.language = track.language;
	if (track.name !== original.name) change.name = track.name;
	if (track.default !== original.default) change.default = track.default;
	if (track.forced !== original.forced) change.forced = track.forced;
	return change;
}

/** Writes the video with its tracks, nothing re-encoded: MKV to MKV, MP4 to MP4. */
export async function exportVideo(
	job: MuxJob,
	originals: MuxTrack[],
	save: SaveTarget,
	onProgress: (share: number) => void,
	signal: AbortSignal,
): Promise<void> {
	const mp4 = muxContainer(job.format) === 'mp4';
	const streamOf = async (doc: SubtitleDoc) => (mp4 ? timedTextStream(doc) : matroskaStream(doc));
	const streams: StreamData[] = [];
	const choices: TrackChoice[] = [];
	const added: AddedTrack[] = [];
	for (const track of job.tracks) {
		const original = originals.find((candidate) => candidate.key === track.key);
		const details = { language: track.language, name: track.name, default: track.default, forced: track.forced };
		if (track.number === null) {
			const doc = currentDoc(job, track);
			if (!track.include || !doc) continue;
			// oxlint-disable-next-line no-await-in-loop -- one track at a time keeps memory low
			streams.push(await streamOf(doc));
			added.push({ stream: streams.length - 1, ...details });
			continue;
		}
		if (track.include && track.edited) {
			const doc = currentDoc(job, track);
			if (doc) {
				// oxlint-disable-next-line no-await-in-loop -- one track at a time keeps memory low
				streams.push(await streamOf(doc));
				// The track is written anew: it takes all its details from here.
				choices.push({ number: track.number, keep: true, stream: streams.length - 1, ...details });
				continue;
			}
		}
		const change = changed(track, original);
		if (!track.include || Object.keys(change).length > 0) {
			choices.push({ number: track.number, keep: track.include, ...change });
		}
	}
	await remux({ file: job.file, choices, added, streams }, save, onProgress, signal);
}
