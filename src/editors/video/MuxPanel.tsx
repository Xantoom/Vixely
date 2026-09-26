import { AudioLines, Captions, Check, Film, Flag, Pencil, Plus, Star, Volume2, X } from 'lucide-react';
import { ALL_FORMATS, type AudioCodec, BlobSource, Input } from 'mediabunny';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { isShortened } from '@/document/kept';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { Section } from '@/editor/panel-parts';
import { formatDb } from '@/lib/format';
import { languageName } from '@/lib/language';
import { outputName } from '@/media/save';
import { openSaveTarget } from '@/media/save-target';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { Dropdown } from '@/ui/Dropdown';
import { Slider } from '@/ui/fields';
import { isAdded, useSubtitleProject } from '../subtitles/project';
import { useSubtitleEditor } from '../subtitles/store';
import { pictureChange, type VideoDoc } from './document';
import { CONTAINERS, EncoderMissing, type VideoContainer, type VideoExportSettings } from './export';
import {
	exportConverted,
	exportVideo,
	type MuxKind,
	type MuxTrack,
	muxContainer,
	soundChanged,
	useMuxSettings,
	useMuxTracks,
} from './mux';

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

function FlagToggle({
	label,
	pressed,
	disabled,
	onChange,
	children,
}: {
	label: string;
	pressed: boolean;
	disabled: boolean;
	onChange: (pressed: boolean) => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={() => {
				onChange(!pressed);
			}}
			className="text-muted enabled:hover:bg-surface aria-pressed:text-ed-text grid size-7 place-items-center rounded-xs transition-colors disabled:opacity-40"
		>
			{children}
		</button>
	);
}

/** One track: whether it goes in, what it is, and its flags; subtitles unfold to rename them. */
export function TrackRow({ file, track }: { file: File; track: MuxTrack }) {
	const set = useMuxSettings((state) => state.set);
	const removeAudio = useMuxSettings((state) => state.removeAudio);
	const removeSubtitles = useSubtitleProject((state) => state.removeAdded);
	const [open, setOpen] = useState<'details' | 'volume' | null>(null);
	const Icon = KIND_ICONS[track.kind];
	const change = (patch: Parameters<typeof set>[2]) => {
		set(file, track.key, patch);
	};
	const blockedReason =
		track.blocked === 'pgs-mp4'
			? m.mux_blocked_pgs()
			: track.blocked === 'webm'
				? m.mux_blocked_webm()
				: track.blocked === 'burned'
					? m.mux_burned()
					: undefined;
	const languages = [...new Set([track.language, ...LANGUAGES])];
	return (
		<li className={`grid gap-1 ${track.include ? '' : 'opacity-50'}`} title={blockedReason}>
			<div className="flex min-w-0 items-center gap-2">
				<input
					type="checkbox"
					aria-label={trackLabel(track)}
					checked={track.include}
					disabled={track.blocked !== null}
					onChange={(event) => {
						change({ include: event.target.checked });
					}}
					className="accent-ed size-4 flex-none cursor-pointer disabled:cursor-not-allowed"
				/>
				<span data-media={KIND_MEDIA[track.kind]} className="text-ed flex-none" aria-hidden="true">
					<Icon size={15} />
				</span>
				<span className="text-body truncate">{trackLabel(track)}</span>
				{track.edited && (
					<span
						className="bg-ed size-2 flex-none rounded-full"
						title={m.subs_track_edited()}
						aria-label={m.subs_track_edited()}
					/>
				)}
				{track.decibels !== 0 && (
					<span className="text-small text-ed-text ml-auto flex-none pl-2 font-mono" data-media="audio">
						{formatDb(track.decibels)}
					</span>
				)}
				<span
					className={`text-small text-muted flex-none pl-2 font-mono ${track.decibels === 0 ? 'ml-auto' : ''}`}
				>
					{track.codec}
				</span>
			</div>
			{track.kind !== 'video' && (
				<div className="flex items-center gap-0.5 pl-[42px]">
					<FlagToggle
						label={m.subs_track_default()}
						pressed={track.default}
						disabled={!track.include}
						onChange={(value) => {
							change({ default: value });
						}}
					>
						<Star size={14} fill={track.default ? 'currentColor' : 'none'} />
					</FlagToggle>
					{track.kind === 'subtitle' && (
						<FlagToggle
							label={m.subs_track_forced()}
							pressed={track.forced}
							disabled={!track.include}
							onChange={(value) => {
								change({ forced: value });
							}}
						>
							<Flag size={14} fill={track.forced ? 'currentColor' : 'none'} />
						</FlagToggle>
					)}
					{track.kind === 'audio' && (
						<FlagToggle
							label={m.mux_volume()}
							pressed={open === 'volume'}
							disabled={!track.include}
							onChange={(pressed) => {
								setOpen(pressed ? 'volume' : null);
							}}
						>
							<Volume2 size={14} />
						</FlagToggle>
					)}
					<FlagToggle
						label={m.mux_edit_track()}
						pressed={open === 'details'}
						disabled={!track.include}
						onChange={(pressed) => {
							setOpen(pressed ? 'details' : null);
						}}
					>
						<Pencil size={14} />
					</FlagToggle>
					{(track.added || isAdded(track.subtitle)) && (
						<FlagToggle
							label={m.mux_remove_track()}
							pressed={false}
							disabled={false}
							onChange={() => {
								if (track.added) removeAudio(file, track.key);
								else if (track.subtitle !== null) removeSubtitles(track.subtitle);
							}}
						>
							<X size={14} />
						</FlagToggle>
					)}
				</div>
			)}
			{open === 'volume' && track.kind === 'audio' && track.include && (
				<div className="pl-[42px]" data-media="audio">
					<Slider
						label={m.volume_gain()}
						value={track.decibels}
						min={-24}
						max={24}
						step={0.5}
						format={formatDb}
						onChange={(decibels) => {
							change({ decibels });
						}}
						onEnd={() => undefined}
					/>
				</div>
			)}
			{open === 'details' && track.kind !== 'video' && track.include && (
				<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-1.5 pl-[42px]">
					<Dropdown
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
					<input
						aria-label={m.mux_track_name()}
						placeholder={m.mux_track_name()}
						defaultValue={track.name}
						onBlur={(event) => {
							if (event.target.value !== track.name) change({ name: event.target.value });
						}}
						className="border-line-2 bg-bg text-ui hover:border-muted h-8 min-w-0 rounded-xs border px-2"
					/>
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
	const add = async (files: File[], soundOnly: boolean): Promise<boolean> => {
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
				<ul className="grid gap-3">
					{tracks.map((track) => (
						<TrackRow key={track.key} file={opened.file} track={track} />
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
}: {
	opened: OpenedFile;
	target?: VideoContainer | null;
	burned?: string | null;
	title?: string;
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
				<ul className="grid gap-3">
					{tracks.map((track) => (
						<TrackRow key={track.key} file={opened.file} track={track} />
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
			<Button className="mt-3 w-full" onClick={() => picker.current?.click()}>
				<Plus size={16} aria-hidden="true" />
				{m.mux_add_subtitles()}
			</Button>
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

	const run = async () => {
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
		try {
			const job = {
				file: opened.file,
				format: opened.format,
				tracks: listed.tracks,
				shown: () => useSubtitleEditor.getState().history.present,
				title: opened.file.name.replace(/\.[^.]+$/, ''),
			};
			if (convert && rewrite) {
				await exportConverted(
					{ ...job, ...convert, originals: listed.originals },
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
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{failure ?? m.mux_failed()}
				</p>
			)}
		</>
	);
}
