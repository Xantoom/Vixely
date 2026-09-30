import { AudioLines, Captions, Check, ChevronDown, Film, Flag, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { ALL_FORMATS, type AudioCodec, BlobSource, Input } from 'mediabunny';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { isShortened } from '@/document/kept';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { Section } from '@/editor/panel-parts';
import { formatDb } from '@/lib/format';
import { languageName } from '@/lib/language';
import { identify } from '@/media/identify';
import { usePlayback } from '@/media/playback';
import { readableFile } from '@/media/readable';
import { outputName } from '@/media/save';
import { openSaveTarget } from '@/media/save-target';
import type { OpenedFile } from '@/media/session';
import { EQ_PRESET_IDS, EQ_PRESETS } from '@/media/sound';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Dropdown } from '@/ui/Dropdown';
import { Slider, Switch } from '@/ui/fields';
import { Segmented } from '@/ui/Segmented';
import { EQ_PRESET_LABELS } from '../audio/panels';
import { whenRead, isAdded, useSubtitleProject } from '../subtitles/project';
import { useSubtitleEditor } from '../subtitles/store';
import { pictureChange, type VideoDoc } from './document';
import {
	audioBitrates,
	chooseEncoding,
	CONTAINERS,
	EncoderMissing,
	type TrackEncode,
	type VideoContainer,
	type VideoExportSettings,
} from './export';
import {
	exportConverted,
	audioCodecName,
	exportVideo,
	type MuxKind,
	type MuxTrack,
	muxContainer,
	soundChanged,
	useMuxSettings,
	useMuxTracks,
} from './mux';
import { useVideoEditor } from './store';

const KIND_ICONS: Record<MuxKind, typeof Film> = { video: Film, audio: AudioLines, subtitle: Captions };
/** Each kind in the colour of its editor, as everywhere in the app. */
const KIND_MEDIA: Record<MuxKind, string> = { video: 'video', audio: 'audio', subtitle: 'subtitles' };

/** Languages offered for subtitle tracks, as ISO 639-2 codes; the track's own is added. */
export const LANGUAGES = [
	'fre',
	'eng',
	'ger',
	'spa',
	'ita',
	'por',
	'dut',
	'jpn',
	'chi',
	'kor',
	'rus',
	'ara',
	'pol',
	'swe',
	'und',
];

const KIND_NAMES: Record<MuxKind, () => string> = {
	video: () => m.mux_video(),
	audio: () => m.mux_audio(),
	subtitle: () => m.subs_language_unknown(),
};

export function trackLabel(track: MuxTrack): string {
	const language = track.language && track.language !== 'und' ? languageName(track.language) : '';
	// Video rarely has a language: it is called by what it is.
	const fallback = track.subtitle === 'new' ? m.subs_new_track() : KIND_NAMES[track.kind]();
	return [language || (track.kind === 'subtitle' ? '' : fallback), track.name].filter(Boolean).join(', ') || fallback;
}

const CHANNEL_NAMES: Record<number, () => string> = {
	1: () => m.tracks_mono(),
	2: () => m.tracks_stereo(),
	6: () => '5.1',
	8: () => '7.1',
};

/** What a track is, in a few words: its codec, its channels and bitrate for sound, its lines for subtitles. */
function useTrackFacts(file: File, track: MuxTrack): string[] {
	const audio = usePlayback((state) =>
		state.file === file ? state.details?.audioTracks.find((entry) => entry.id === track.number) : undefined,
	);
	const bitrate = useAudioBitrate(file, track.kind === 'audio' && track.added === null ? track.number : null);
	const lines = useSubtitleProject((state) =>
		track.subtitle === null
			? null
			: (() => {
					const entry = state.tracks.find((candidate) => candidate.key === track.subtitle);
					const doc = entry?.history?.present ?? entry?.original;
					return doc && doc.format !== 'pgs' ? doc.cues.length : null;
				})(),
	);
	const facts = [track.codec];
	if (audio) facts.push(CHANNEL_NAMES[audio.channels]?.() ?? m.tracks_channels({ count: audio.channels }));
	if (bitrate) facts.push(`${bitrate} kb/s`);
	if (lines !== null) facts.push(m.tracks_lines({ count: lines }));
	return facts.filter(Boolean);
}

/** Bitrates measured once per file and track: reading them takes a moment. */
const bitrates = new WeakMap<File, Map<number, Promise<number>>>();

function useAudioBitrate(file: File, id: number | null): number | null {
	const [found, setFound] = useState<number | null>(null);
	useEffect(() => {
		if (id === null) return;
		let known = bitrates.get(file);
		if (!known) {
			known = new Map();
			bitrates.set(file, known);
		}
		let measured = known.get(id);
		if (!measured) {
			measured = audioBitrates(file, [id])
				.then((all) => all.get(id) ?? 0)
				.catch(() => 0);
			known.set(id, measured);
		}
		let live = true;
		void measured.then((value) => {
			if (live) setFound(value || null);
		});
		return () => {
			live = false;
		};
	}, [file, id]);
	return found;
}

/** Codecs a sound track can be encoded again in, by the container written. */
const ENCODE_CODECS: readonly TrackEncode['codec'][] = ['aac', 'opus'];
const ENCODE_BITRATES = [64, 96, 128, 160, 192, 256, 320];
const KEEP = 'keep';
const CUSTOM_EQ = 'custom';

/** What changes on the way out, under a track's name: its encoding, its level, its sound. */
function changesOf(track: MuxTrack): string[] {
	const changes: string[] = [];
	if (track.encode) changes.push(`${audioCodecName(track.encode.codec)} ${track.encode.bitrate} kb/s`);
	if (track.decibels !== 0) changes.push(formatDb(track.decibels));
	if (track.eq.some((gain) => gain !== 0) || track.compress > 0) changes.push(m.sound_edited());
	if (track.blocked === 'burned') changes.push(m.mux_burned());
	if (track.edited) changes.push(m.subs_track_edited());
	return changes;
}

/**
 * One track, as HandBrake and MKVToolNix list them: whether it goes in, what it is, and its
 * flags at a glance. It unfolds to change its name, language and flags, the encoding and sound of
 * a sound track, and what becomes of a subtitle track.
 */
function TrackRow({
	file,
	track,
	target,
	onEditLines,
}: {
	file: File;
	track: MuxTrack;
	target: VideoContainer | null;
	/** Opens a subtitle track's lines in the subtitle editor. */
	onEditLines?: (track: MuxTrack) => void;
}) {
	const set = useMuxSettings((state) => state.set);
	const removeAudio = useMuxSettings((state) => state.removeAudio);
	const removeSubtitles = useSubtitleProject((state) => state.removeAdded);
	const setAudioTrack = usePlayback((state) => state.setAudioTrack);
	const exportSettings = useVideoEditor((state) => state.exportSettings);
	const setExport = useVideoEditor((state) => state.setExport);
	const [open, setOpen] = useState(false);
	const Icon = KIND_ICONS[track.kind];
	const facts = useTrackFacts(file, track);
	const changes = changesOf(track);
	const detailsId = useId();
	const change = (patch: Parameters<typeof set>[2]) => {
		set(file, track.key, patch);
	};
	const blockedReason =
		track.blocked === 'pgs-mp4' ? m.mux_blocked_pgs() : track.blocked === 'webm' ? m.mux_blocked_webm() : undefined;
	const languages = [...new Set([track.language, ...LANGUAGES])];
	const container = target ?? 'mkv';
	const codecs = ENCODE_CODECS.filter((codec) => CONTAINERS[container].audio.includes(codec));
	const eq = EQ_PRESET_IDS.find((id) => EQ_PRESETS[id].every((gain, index) => gain === track.eq[index]));
	const removable = track.added !== null || isAdded(track.subtitle);
	const burned = exportSettings?.burn === track.key;
	const field =
		'border-line-2 bg-bg text-ui hover:border-muted h-9 w-full min-w-0 rounded-xs border px-2.5 transition-colors';
	return (
		<li
			data-media={KIND_MEDIA[track.kind]}
			className={`rounded-md transition-shadow ${open ? 'shadow-[inset_0_0_0_1px_var(--line-2)]' : 'shadow-[inset_0_0_0_1px_var(--line)]'}`}
		>
			<div className="flex min-w-0 items-center gap-2.5 py-2 pr-1.5 pl-3">
				<Checkbox
					aria-label={m.tracks_include_one({ name: trackLabel(track) })}
					checked={track.include}
					disabled={track.blocked !== null && track.blocked !== 'burned'}
					title={blockedReason}
					onChange={(event) => {
						change({ include: event.target.checked });
					}}
				/>
				<button
					type="button"
					aria-expanded={open}
					aria-controls={detailsId}
					onClick={() => {
						setOpen(!open);
						// The sound track unfolded is the one heard.
						if (!open && track.kind === 'audio' && track.number !== null) setAudioTrack(track.number);
					}}
					className={`grid min-w-0 flex-1 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 text-left ${track.include ? '' : 'opacity-55'}`}
				>
					<Icon size={16} className="text-ed row-span-2 flex-none" aria-hidden="true" />
					<span className="text-body min-w-0 truncate font-medium">{trackLabel(track)}</span>
					<span className="row-span-2 flex items-center gap-1 self-center">
						{track.default && (
							<span title={m.subs_track_default()} className="text-ed-text">
								<Star size={13} fill="currentColor" aria-label={m.subs_track_default()} />
							</span>
						)}
						{track.forced && (
							<span title={m.subs_track_forced()} className="text-ed-text">
								<Flag size={13} fill="currentColor" aria-label={m.subs_track_forced()} />
							</span>
						)}
						<ChevronDown
							size={17}
							className={`text-muted ml-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
							aria-hidden="true"
						/>
					</span>
					<span className="text-small text-muted min-w-0 truncate">
						{blockedReason ?? facts.join(', ')}
						{changes.length > 0 && <span className="text-ed-text"> → {changes.join(', ')}</span>}
					</span>
				</button>
			</div>
			{open && (
				<div id={detailsId} className="border-line grid gap-3.5 border-t px-3 pt-3 pb-3.5">
					<div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
						<label className="grid gap-1">
							<span className="text-small text-muted">{m.mux_track_name()}</span>
							<input
								key={track.key}
								defaultValue={track.name}
								placeholder={trackLabel(track)}
								onBlur={(event) => {
									if (event.target.value !== track.name) change({ name: event.target.value });
								}}
								onKeyDown={(event) => {
									if (event.key === 'Enter') event.currentTarget.blur();
								}}
								className={field}
							/>
						</label>
						<div className="grid gap-1">
							<label htmlFor={`${detailsId}-language`} className="text-small text-muted">
								{m.mux_language()}
							</label>
							<Dropdown
								id={`${detailsId}-language`}
								label={m.mux_language()}
								value={track.language}
								options={languages.map((code) => ({
									value: code,
									label: code === 'und' ? m.subs_language_unknown() : languageName(code),
								}))}
								onChange={(language) => {
									change({ language });
								}}
							/>
						</div>
					</div>
					<div className="grid gap-0.5">
						<Switch
							label={m.subs_track_default()}
							checked={track.default}
							onChange={(value) => {
								change({ default: value });
							}}
						/>
						<Switch
							label={m.subs_track_forced()}
							checked={track.forced}
							onChange={(value) => {
								change({ forced: value });
							}}
						/>
					</div>
					{track.kind === 'audio' && (
						<>
							<div className="grid gap-2">
								<Segmented
									label={m.tracks_encoding()}
									value={track.encode ? 'encode' : KEEP}
									options={[
										{ value: KEEP, label: m.tracks_keep() },
										{ value: 'encode', label: m.tracks_reencode() },
									]}
									onChange={(value) => {
										change({
											encode:
												value === KEEP
													? null
													: {
															codec: codecs[0] ?? 'aac',
															bitrate: container === 'webm' ? 128 : 160,
														},
										});
									}}
								/>
								{track.encode && (
									<div className="grid grid-cols-2 gap-x-2 gap-y-1">
										<label htmlFor={`${detailsId}-codec`} className="text-small text-muted">
											{m.tracks_codec()}
										</label>
										<label htmlFor={`${detailsId}-bitrate`} className="text-small text-muted">
											{m.tracks_bitrate()}
										</label>
										<Dropdown
											id={`${detailsId}-codec`}
											label={m.tracks_codec()}
											value={track.encode.codec}
											options={codecs.map((codec) => ({
												value: codec,
												label: audioCodecName(codec),
											}))}
											onChange={(codec) => {
												if (track.encode) change({ encode: { ...track.encode, codec } });
											}}
										/>
										<Dropdown
											id={`${detailsId}-bitrate`}
											label={m.tracks_bitrate()}
											value={String(track.encode.bitrate)}
											options={ENCODE_BITRATES.map((bitrate) => ({
												value: String(bitrate),
												label: `${bitrate} kb/s`,
											}))}
											onChange={(bitrate) => {
												if (track.encode)
													change({ encode: { ...track.encode, bitrate: Number(bitrate) } });
											}}
										/>
									</div>
								)}
							</div>
							<Slider
								label={m.mux_volume()}
								value={track.decibels}
								min={-24}
								max={24}
								step={0.5}
								defaultValue={0}
								format={formatDb}
								onChange={(decibels) => {
									change({ decibels });
								}}
								onEnd={() => undefined}
							/>
							<Slider
								label={m.compress_label()}
								value={Math.round(track.compress * 100)}
								min={0}
								max={100}
								defaultValue={0}
								format={(value) => (value === 0 ? m.denoise_off() : `${value} %`)}
								onChange={(value) => {
									change({ compress: value / 100 });
								}}
								onEnd={() => undefined}
							/>
							<div className="grid gap-1">
								<label htmlFor={`${detailsId}-eq`} className="text-small text-muted">
									{m.eq_title()}
								</label>
								<Dropdown
									id={`${detailsId}-eq`}
									label={m.eq_title()}
									value={eq ?? CUSTOM_EQ}
									options={[
										...EQ_PRESET_IDS.map((id) => ({ value: id, label: EQ_PRESET_LABELS[id]() })),
										...(eq ? [] : [{ value: CUSTOM_EQ, label: m.eq_custom() }]),
									]}
									onChange={(id) => {
										const preset = EQ_PRESET_IDS.find((candidate) => candidate === id);
										if (preset) change({ eq: EQ_PRESETS[preset] });
									}}
								/>
							</div>
						</>
					)}
					{track.kind === 'subtitle' && exportSettings && target !== 'webm' && (
						<div className="grid gap-1">
							<Switch
								label={m.tracks_burn()}
								checked={burned}
								onChange={(value) => {
									setExport(value ? { burn: track.key, mode: 'encode' } : { burn: null });
								}}
							/>
							{burned && <p className="text-small text-muted">{m.tracks_burn_hint()}</p>}
						</div>
					)}
					{(onEditLines && track.kind === 'subtitle') || removable ? (
						<div className="flex flex-wrap gap-2">
							{onEditLines && track.kind === 'subtitle' && (
								<Button
									className="h-9 flex-1"
									onClick={() => {
										onEditLines(track);
									}}
								>
									<Pencil size={15} aria-hidden="true" />
									{m.tracks_edit_lines()}
								</Button>
							)}
							{removable && (
								<Button
									className="h-9 flex-1"
									onClick={() => {
										if (track.added) removeAudio(file, track.key);
										else if (track.subtitle !== null) removeSubtitles(track.subtitle);
									}}
								>
									<Trash2 size={15} aria-hidden="true" />
									{m.mux_remove_track()}
								</Button>
							)}
						</div>
					) : null}
				</div>
			)}
		</li>
	);
}

/**
 * The sound tracks of the video, as in MKVToolNix: every one of the file and those added from
 * other files, each kept or left out, with its level, language, name and flags.
 */
export function AudioTrackList({
	opened,
	target = null,
	title = m.mux_tracks(),
}: {
	opened: OpenedFile;
	target?: VideoContainer | null;
	title?: string;
}) {
	const tracks = useMuxTracks(opened.file, opened.format, target)?.tracks.filter((track) => track.kind === 'audio');
	const addAudio = useMuxSettings((state) => state.addAudio);
	const [refused, setRefused] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);

	/** Adds the sound of each file; with `soundOnly`, files with pictures are left to open. */
	const add = async (dropped: File[], soundOnly: boolean): Promise<boolean> => {
		const files = await Promise.all(dropped.map(readableSound));
		const read = await Promise.all(files.map(async (file) => ({ file, sound: await readSound(file) })));
		const taken = read.filter(({ sound }) => sound !== null && !(soundOnly && sound.video));
		if (soundOnly && taken.length === 0) return false;
		for (const { file, sound } of taken) if (sound) addAudio(opened.file, { file, codec: sound.codec });
		setRefused(read.find(({ sound }) => sound === null)?.file.name ?? null);
		return true;
	};
	// Sound files dropped on the page become tracks of the video; videos still open.
	useDropHandler(async (files) => add(files, true));

	if (!tracks) return <p className="text-ui text-muted">{m.subs_reading_track({ percent: 0 })}</p>;
	return (
		<Section title={title}>
			{tracks.length === 0 ? (
				<p className="text-ui text-muted">{m.audio_no_tracks()}</p>
			) : (
				<ul className="grid gap-2">
					{tracks.map((track) => (
						<TrackRow key={track.key} file={opened.file} track={track} target={target} />
					))}
				</ul>
			)}
			<input
				ref={picker}
				type="file"
				accept="audio/*,video/*,.mka,.mkv,.opus,.flac"
				multiple
				hidden
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = '';
					void add(files, false);
				}}
			/>
			<Button className="mt-3 w-full" onClick={() => picker.current?.click()}>
				<Plus size={16} aria-hidden="true" />
				{m.mux_add_audio()}
			</Button>
			{refused && (
				<p role="alert" className="text-small text-danger mt-2">
					{m.mux_no_sound({ name: refused })}
				</p>
			)}
		</Section>
	);
}

/**
 * The subtitle tracks going into the video: those of the file as the subtitle editor left them,
 * new subtitles written there, and subtitle files added here.
 */
export function SubtitleTrackList({
	opened,
	target = null,
	burned = null,
	title = m.mux_tracks(),
	onEditLines,
	children,
}: {
	opened: OpenedFile;
	target?: VideoContainer | null;
	burned?: string | null;
	title?: string;
	onEditLines?: (track: MuxTrack) => void;
	/** More ways to add a track, under the file button. */
	children?: ReactNode;
}) {
	const tracks = useMuxTracks(opened.file, opened.format, target, burned)?.tracks.filter(
		(track) => track.kind === 'subtitle',
	);
	const addFiles = useSubtitleProject((state) => state.addFiles);
	const [refused, setRefused] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);

	const add = async (files: File[]) => {
		setRefused(await addFiles(files));
	};
	// Subtitle files dropped on the page become tracks of the video.
	useDropHandler(async (files) => {
		const subtitles = files.filter((file) => SUBTITLE_FILE.test(file.name));
		if (subtitles.length === 0) return false;
		await add(subtitles);
		return true;
	});

	if (!tracks) return <p className="text-ui text-muted">{m.subs_reading_track({ percent: 0 })}</p>;
	return (
		<Section title={title}>
			{tracks.length === 0 ? (
				<p className="text-ui text-muted">{m.subs_no_tracks()}</p>
			) : (
				<ul className="grid gap-2">
					{tracks.map((track) => (
						<TrackRow
							key={track.key}
							file={opened.file}
							track={track}
							target={target}
							onEditLines={onEditLines}
						/>
					))}
				</ul>
			)}
			<input
				ref={picker}
				type="file"
				accept=".srt,.ass,.ssa,.vtt,.sup"
				multiple
				hidden
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = '';
					void add(files);
				}}
			/>
			<div className="mt-3 grid gap-2">
				<Button onClick={() => picker.current?.click()}>
					<Plus size={16} aria-hidden="true" />
					{m.mux_add_subtitles()}
				</Button>
				{children}
			</div>
			{refused && (
				<p role="alert" className="text-small text-danger mt-2">
					{m.mux_unreadable_subtitles({ name: refused })}
				</p>
			)}
		</Section>
	);
}

/** The subtitle and sound tracks of the video, for the subtitle editor's export into it. */
export function MuxTracks({ opened }: { opened: OpenedFile }) {
	return (
		<>
			<SubtitleTrackList opened={opened} title={m.mux_subtitle_tracks()} />
			<AudioTrackList opened={opened} title={m.mux_audio_tracks()} />
		</>
	);
}

const SUBTITLE_FILE = /\.(srt|ass|ssa|vtt|sup)$/i;

/** The file, or a WAV made from it when browsers can't read its sound (AIFF, Apple Lossless). */
async function readableSound(file: File): Promise<File> {
	const found = await identify(file);
	return found.ok ? readableFile(file, found.value.format).catch(() => file) : file;
}

/** The codec of a file's sound, and whether it has pictures too; null without sound. */
async function readSound(file: File): Promise<{ codec: AudioCodec; video: boolean } | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const [audio, video] = await Promise.all([input.getPrimaryAudioTrack(), input.getPrimaryVideoTrack()]);
		const codec = audio ? await audio.getCodec() : null;
		return codec ? { codec, video: video !== null } : null;
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** A conversion to run instead of copying the tracks. */
export interface ConvertOrder {
	settings: VideoExportSettings;
	doc: VideoDoc;
	upright: { width: number; height: number };
}

/**
 * Writes the video with the chosen tracks: copied as they are, or converted with the edits when
 * `convert` is given. `blocked` when neither can be done.
 */
export function MuxFooter({
	opened,
	blocked = false,
	convert = null,
}: {
	opened: OpenedFile;
	blocked?: boolean;
	convert?: ConvertOrder | null;
}) {
	const encoding = convert?.settings.mode === 'encode';
	const target = encoding ? convert.settings.container : null;
	const listed = useMuxTracks(opened.file, opened.format, target, encoding ? convert.settings.burn : null);
	// Copied as it is by the remuxer, unless the edits, the sound, the turn or the tags need the
	// file written again.
	const rewrite =
		convert !== null &&
		(convert.settings.mode === 'encode' ||
			isShortened(convert.doc) ||
			convert.doc.meta !== null ||
			pictureChange(convert.doc.picture) !== 'none' ||
			(listed ? soundChanged(listed.tracks) : false));
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [failure, setFailure] = useState<string | null>(null);
	// The graphics card failed to encode: software is offered instead.
	const [gpuFailed, setGpuFailed] = useState(false);
	const [progress, setProgress] = useState(0);
	const abort = useRef<AbortController | null>(null);
	const container = target ?? muxContainer(opened.format);
	const kind = CONTAINERS[container];

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, 2400);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	/** Writes the video; `settings` stand in for the chosen ones, as when retried in software. */
	const run = async (settings = convert?.settings) => {
		if (!listed) return;
		const save = await openSaveTarget(outputName(opened.file.name, kind.extension), {
			mime: kind.mime,
			extension: kind.extension,
			description: kind.label,
		});
		if (!save) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		setGpuFailed(false);
		try {
			// Subtitle tracks still being read are written whole.
			await whenRead();
			const job = {
				file: opened.file,
				format: opened.format,
				tracks: listed.tracks,
				shown: () => useSubtitleEditor.getState().history.present,
				title: opened.file.name.replace(/\.[^.]+$/, ''),
			};
			if (convert && settings && rewrite) {
				await exportConverted(
					{ ...job, ...convert, settings, originals: listed.originals },
					save,
					setProgress,
					controller.signal,
				);
			} else {
				await exportVideo(job, listed.originals, save, setProgress, controller.signal);
			}
			await save.commit();
			setStatus('saved');
		} catch (error) {
			await save.discard().catch(() => undefined);
			const onGpu = settings?.mode === 'encode' && settings.encoder === 'gpu';
			setGpuFailed(onGpu && !(error instanceof EncoderMissing && error.kind === 'audio'));
			setFailure(
				error instanceof EncoderMissing
					? error.kind === 'video'
						? m.convert_no_video_encoder()
						: m.convert_no_audio_encoder()
					: null,
			);
			setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		} finally {
			abort.current = null;
		}
	};

	/** The same export, on the processor: the codec too when software can't write the chosen one. */
	const retryInSoftware = () => {
		const chosen = convert?.settings;
		const source = useVideoEditor.getState().exportSource;
		if (!chosen || !source) return;
		const encoding = chooseEncoding(source.encoders, CONTAINERS[chosen.container].codecs, chosen.codec, 'software');
		useVideoEditor.getState().setExport(encoding);
		void run({ ...chosen, ...encoding });
	};

	return (
		<>
			{status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full transition-[width] duration-200"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					disabled={!listed || blocked}
					busy={status === 'saving'}
					onClick={() => void run()}
				>
					{status === 'saving' ? (
						m.exporting_percent({ percent: Math.floor(progress * 100) })
					) : status === 'saved' ? (
						<>
							<Check size={17} strokeWidth={2.4} aria-hidden="true" />
							{m.saved()}
						</>
					) : (
						m.export_as({ format: kind.label })
					)}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			<ExportAnnounce status={status} />
			{status === 'failed' &&
				(gpuFailed ? (
					<div role="alert" className="grid gap-2">
						<p className="text-small text-danger">{m.encoder_gpu_failed()}</p>
						<Button onClick={retryInSoftware}>{m.encoder_software_retry()}</Button>
					</div>
				) : (
					<p role="alert" className="text-small text-danger">
						{failure ?? m.mux_failed()}
					</p>
				))}
		</>
	);
}
