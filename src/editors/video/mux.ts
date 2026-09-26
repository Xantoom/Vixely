import type { AudioCodec } from 'mediabunny';
import { create } from 'zustand';
import { isShortened, keptRanges, outputDuration } from '@/document/kept';
import { type Range, toOutput } from '@/document/timemap';
import { type AddedTrack, remux, type StreamData, type TrackChoice } from '@/media/remux';
import { openScratchFile, type SaveTarget, type ScratchFile } from '@/media/save-target';
import { getLocale } from '@/paraglide/runtime.js';
import type { SubtitleDoc } from '../subtitles/document';
import { matroskaStream, timedTextStream, trackCodec } from '../subtitles/mux-streams';
import { type TrackKey, type TrackState, useProjectTracks, useSubtitleProject } from '../subtitles/project';
import { codecLabel } from '../subtitles/tracks';
import type { BurnJob } from './burn';
import { type AudioPlan, copiesParts, copyTracks } from './copy-tracks';
import { editTurn, pictureChange, type VideoDoc } from './document';
import {
	audioBitrates,
	bitrateForSize,
	CONTAINERS,
	convertVideo,
	type VideoContainer,
	type VideoExportSettings,
} from './export';

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
	/** Why it can't go in as a track, if it can't: not in this container, or burned in. */
	blocked: 'pgs-mp4' | 'webm' | 'burned' | null;
	/** Change of level of a sound track, in dB. */
	decibels: number;
	/** The file a sound track added here comes from. */
	added: File | null;
}

type Override = Partial<Pick<MuxTrack, 'include' | 'language' | 'name' | 'default' | 'forced' | 'decibels'>>;

/** A sound track added from another file. */
export interface AddedAudio {
	key: string;
	file: File;
	codec: AudioCodec;
}

interface MuxSettingsState {
	file: File | null;
	overrides: Record<string, Override>;
	added: AddedAudio[];
	set: (file: File, key: string, change: Override) => void;
	addAudio: (file: File, audio: Omit<AddedAudio, 'key'>) => void;
	removeAudio: (file: File, key: string) => void;
}

let addedCount = 0;

/** What the user changed in the track list, per file: kept while going between editors. */
export const useMuxSettings = create<MuxSettingsState>((set, get) => {
	/** The settings of this file: fresh ones for another file. */
	const of = (file: File) =>
		get().file === file ? { overrides: get().overrides, added: get().added } : { overrides: {}, added: [] };
	return {
		file: null,
		overrides: {},
		added: [],
		set(file, key, change) {
			const { overrides, added } = of(file);
			set({ file, added, overrides: { ...overrides, [key]: { ...overrides[key], ...change } } });
		},
		addAudio(file, audio) {
			const { overrides, added } = of(file);
			addedCount += 1;
			set({ file, overrides, added: [...added, { ...audio, key: `added-${addedCount}` }] });
		},
		removeAudio(file, key) {
			const { overrides, added } = of(file);
			set({ file, overrides, added: added.filter((entry) => entry.key !== key) });
		},
	};
});

/** Short name of a Mediabunny audio codec. */
export function audioCodecName(codec: AudioCodec): string {
	const names: Partial<Record<AudioCodec, string>> = {
		aac: 'AAC',
		opus: 'Opus',
		mp3: 'MP3',
		vorbis: 'Vorbis',
		flac: 'FLAC',
		ac3: 'AC-3',
		eac3: 'E-AC-3',
	};
	return names[codec] ?? (codec.startsWith('pcm') ? 'PCM' : codec);
}

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
export function useMuxTracks(
	file: File | null,
	format: string,
	/** The container written, when the video is converted into another one. */
	target: VideoContainer | null = null,
	/** The subtitle track burned into the pictures. */
	burned: string | null = null,
): { tracks: MuxTrack[]; originals: MuxTrack[] } | null {
	const container = target === null ? muxContainer(format) : target === 'mkv' || target === 'webm' ? 'mkv' : 'mp4';
	const projectFile = useSubtitleProject((state) => state.file);
	const status = useSubtitleProject((state) => state.status);
	const media = useSubtitleProject((state) => state.media);
	const subtitles = useProjectTracks();
	const overrides = useMuxSettings((state) => (state.file === file ? state.overrides : null));
	const addedAudio = useMuxSettings((state) => (state.file === file ? state.added : null));

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
		decibels: 0,
		added: null,
	}));
	for (const audio of addedAudio ?? []) {
		tracks.push({
			key: audio.key,
			kind: 'audio',
			number: null,
			subtitle: null,
			codec: audioCodecName(audio.codec),
			language: 'und',
			name: audio.file.name.replace(/\.[^.]+$/, ''),
			default: false,
			forced: false,
			include: true,
			edited: false,
			blocked: null,
			decibels: 0,
			added: audio.file,
		});
	}
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
			blocked:
				`subtitle-${track.key}` === burned
					? 'burned'
					: target === 'webm'
						? 'webm'
						: container === 'mp4' && pgs
							? 'pgs-mp4'
							: null,
			decibels: 0,
			added: null,
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
	/** Subtitles read for this export alone, by track key, rather than those of the subtitle editor. */
	docs?: ReadonlyMap<string, SubtitleDoc>;
	/** Fonts of these subtitles, rather than those of the subtitle editor. */
	fonts?: readonly Uint8Array[];
}

function currentDoc(job: MuxJob, track: MuxTrack): SubtitleDoc | null {
	if (job.docs) return job.docs.get(track.key) ?? null;
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

/**
 * Subtitle lines placed on the edited video's time: those in removed passages go, the others
 * move up by what was removed before them.
 */
export function cutSubtitles(doc: SubtitleDoc, ranges: readonly Range[]): SubtitleDoc {
	const cues = doc.cues.flatMap((cue) => {
		const start = cue.start / 1000;
		const end = cue.end / 1000;
		if (!ranges.some((range) => range.start < end && range.end > start)) return [];
		const from = Math.round(toOutput(ranges, start) * 1000);
		const to = Math.round(toOutput(ranges, end) * 1000);
		return to > from ? [{ ...cue, start: from, end: to }] : [];
	});
	return { ...doc, cues };
}

export interface ConvertedJob extends MuxJob {
	/** The tracks as the file has them, to tell what the user changed. */
	originals: readonly MuxTrack[];
	doc: VideoDoc;
	settings: VideoExportSettings;
	/** Size of the source's pictures, upright. */
	upright: { width: number; height: number };
}

/** Whether the tracks can't simply be copied into a file like the source: their sound changes. */
export function soundChanged(tracks: readonly MuxTrack[]): boolean {
	return tracks.some((track) => track.include && (track.decibels !== 0 || track.added !== null));
}

/** The subtitles burned into the pictures, as edited. */
function burnJob(job: ConvertedJob): BurnJob | null {
	const track = job.tracks.find((candidate) => candidate.key === job.settings.burn);
	const doc = track ? currentDoc(job, track) : null;
	if (!doc) return null;
	return { doc, title: job.title, fonts: job.fonts ?? useSubtitleProject.getState().fonts };
}

/**
 * The settings with the video bitrate a size limit leaves: the length of the output, less what
 * the sound takes (copied tracks at their own bitrate).
 */
async function withSizeLimit(job: ConvertedJob): Promise<VideoExportSettings> {
	const { settings, doc } = job;
	if (settings.mode !== 'encode' || settings.sizeLimit === null) return settings;
	const sound = job.tracks.filter((track) => track.kind === 'audio' && track.include);
	const copied = sound.flatMap((track) =>
		settings.audio === 'copy' && track.decibels === 0 && track.number !== null ? [track.number] : [],
	);
	const measured = copied.length > 0 ? await audioBitrates(job.file, copied) : new Map<number, number>();
	const audio = sound.reduce(
		(total, track) =>
			total +
			(track.number !== null && measured.has(track.number)
				? (measured.get(track.number) ?? 0)
				: settings.audioBitrate),
		0,
	);
	return { ...settings, bitrate: bitrateForSize(settings.sizeLimit, outputDuration(doc), audio) };
}

/** Splits the progress bar between passes, by weight. */
function passes(weights: readonly number[], onProgress: (share: number) => void) {
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	return (index: number) => {
		const before = weights.slice(0, index).reduce((sum, weight) => sum + weight, 0);
		return (share: number) => {
			onProgress((before + share * (weights[index] ?? 0)) / total);
		};
	};
}

/**
 * Writes the video with its edits: the pictures encoded again or copied, the sound copied or
 * encoded again with its level, sound from other files added, then, when subtitles go with it,
 * the file completed by the remuxer with the subtitle tracks (placed on the edited time) and the
 * fonts of the source. Each step but the last writes into the browser's private storage. WebM
 * holds no subtitles of these kinds: they are left out.
 */
export async function exportConverted(
	job: ConvertedJob,
	save: SaveTarget,
	onProgress: (share: number) => void,
	signal: AbortSignal,
): Promise<void> {
	const { doc } = job;
	const settings = await withSizeLimit(job);
	const { container } = settings;
	const shortened = isShortened(doc);
	const kept = shortened ? keptRanges(doc) : null;
	const sound = job.tracks.filter((track) => track.kind === 'audio' && track.include);
	const own = sound.flatMap((track) => (track.number === null ? [] : [{ track, id: track.number }]));
	const added = sound.flatMap((track) => (track.added === null ? [] : [{ track, file: track.added }]));
	const subtitles =
		container === 'webm'
			? []
			: job.tracks.filter((track) => track.kind === 'subtitle' && track.include && track.blocked === null);
	// Matroska players show the segment's title, which only the remuxer writes.
	const title = container === 'mkv' && doc.meta ? doc.meta.title : undefined;
	const remuxed = subtitles.length > 0 || title !== undefined;
	const plan = (track: MuxTrack, from: AudioPlan['from'], encode: AudioPlan['encode']): AudioPlan => ({
		from,
		decibels: track.decibels,
		encode,
		bitrate: settings.audioBitrate,
		language: track.language,
		name: track.name,
		default: track.default,
	});
	const addedPlan = (
		{ track, file }: { track: MuxTrack; file: File },
		encode: AudioPlan['encode'],
		ranges: readonly Range[] | undefined,
	): AudioPlan => ({ ...plan(track, { file }, encode), ranges });

	// A conversion keeps the sound tracks' details as the file has them.
	const renamed = own.some(({ track }) => {
		const original = job.originals.find((candidate) => candidate.key === track.key);
		return Object.keys(changed(track, original)).length > 0;
	});
	// Sound from other files goes in while copying; a conversion is completed by a copy with it,
	// which also writes the sound tracks' new details.
	const merge = settings.mode === 'encode' && (added.length > 0 || renamed);
	const step = passes(
		[settings.mode === 'encode' ? 8 : 2, ...(merge ? [1] : []), ...(remuxed ? [1] : [])],
		onProgress,
	);
	const scratches: ScratchFile[] = [];
	const extension = CONTAINERS[container].extension;
	const last = !merge && !remuxed;
	const scratch = async () => {
		const file = await openScratchFile(`converted.${extension}`);
		scratches.push(file);
		return file;
	};

	try {
		let written = last ? null : await scratch();
		const target = written?.target ?? save.target;
		let ranges: Range[] | null;
		if (settings.mode === 'encode') {
			const audioTracks = new Map(own.map(({ track, id }) => [id, track.decibels]));
			const convert = { file: job.file, doc, settings, upright: job.upright, audioTracks, burn: burnJob(job) };
			await convertVideo(convert, target, step(0), signal);
			ranges = kept;
		} else if (shortened && !copiesParts(container, doc.cuts.length > 0) && !soundChanged(job.tracks)) {
			// MP4 trimmed at both ends: copied exactly, an edit list hiding the pictures before the start.
			const audioTracks = new Map(own.map(({ id }) => [id, 0]));
			const convert = { file: job.file, doc, settings, upright: job.upright, audioTracks };
			await convertVideo(convert, target, step(0), signal);
			ranges = kept;
		} else {
			const audio = [
				...own.map(({ track, id }) => plan(track, { id }, track.decibels === 0 ? null : 'auto')),
				...added.map((track) => addedPlan(track, null, undefined)),
			];
			const turn = pictureChange(doc.picture) === 'turn' ? editTurn(doc.picture) : null;
			ranges = await copyTracks(
				{ file: job.file, container, ranges: kept, audio, turn, meta: doc.meta },
				target,
				step(0),
				signal,
			);
		}

		if (merge && written) {
			const converted = await written.file();
			written = remuxed ? await scratch() : null;
			const audio = [
				// Already encoded with their level: copied as they are.
				...own.map(({ track }, index) => ({ ...plan(track, { number: index + 1 }, null), decibels: 0 })),
				...added.map((entry) =>
					addedPlan(entry, settings.audio === 'copy' ? null : settings.audio, kept ?? undefined),
				),
			];
			await copyTracks(
				{ file: converted, container, ranges: null, audio },
				written?.target ?? save.target,
				step(1),
				signal,
			);
		}

		if (remuxed && written) {
			const converted = await written.file();
			const mkv = container === 'mkv';
			const streams: StreamData[] = [];
			const tracks: AddedTrack[] = [];
			for (const track of subtitles) {
				const subtitleDoc = currentDoc(job, track);
				if (!subtitleDoc) continue;
				const placed = ranges ? cutSubtitles(subtitleDoc, ranges) : subtitleDoc;
				// oxlint-disable-next-line no-await-in-loop -- one track at a time keeps memory low
				streams.push(await (mkv ? matroskaStream(placed) : timedTextStream(placed)));
				tracks.push({
					stream: streams.length - 1,
					language: track.language,
					name: track.name,
					default: track.default,
					forced: track.forced,
				});
			}
			await remux(
				{
					file: converted,
					choices: [],
					added: tracks,
					streams,
					// The fonts come with the tags the first pass copied; a cover chosen here is among them.
					title,
				},
				save,
				step(merge ? 2 : 1),
				signal,
			);
		}
	} finally {
		for (const file of scratches) {
			// oxlint-disable-next-line no-await-in-loop -- a couple of files
			await file.remove();
		}
	}
}
