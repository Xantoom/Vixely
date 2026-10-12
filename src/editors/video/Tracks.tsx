import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { ALL_FORMATS, type AudioCodec, BlobSource, Input } from 'mediabunny';
import { createContext, type ReactNode, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { EDITORS } from '@/editors/registry';
import { formatDb } from '@/lib/format';
import { languageName } from '@/lib/language';
import { identify } from '@/media/identify';
import { usePlayback } from '@/media/playback';
import { readableFile } from '@/media/readable';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { FieldRow, Select, Slider, Switch } from '@/ui/fields';
import { Segmented } from '@/ui/Segmented';
import { isAdded, useSubtitleProject } from '../subtitles/project';
import { CONTAINERS, audioBitrates, type TrackEncode, type VideoContainer } from './export';
import { audioCodecName, audioId, type MuxKind, type MuxTrack, useMuxSettings, useMuxTracks } from './mux';
import { useVideoEditor } from './store';

/**
 * The tracks of a video as they go into the exported file, in the export panel: a list per kind,
 * a line per track with whether it goes in, each opening a page of its own to name it, flag it,
 * encode it again or set its level. Packaging, as in MKVToolNix: what plays while editing is the
 * player's choice, in its menus.
 */

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
	const id = track.kind === 'audio' ? audioId(track.key) : null;
	const audio = usePlayback((state) =>
		state.file === file
			? [...(state.details?.audioTracks ?? []), ...state.addedAudio].find((entry) => entry.id === id)
			: undefined,
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

/** Past this many tracks of a kind, the list shows the first ones and folds the rest. */
const FOLD_AFTER = 5;
const SHOWN_FOLDED = 4;

/** The kinds whose list is unfolded, kept while a track's page is open. */
const Unfolded = createContext<{ kinds: ReadonlySet<MuxKind>; toggle: (kind: MuxKind) => void } | null>(null);

/** Lines of the list: a kind's tracks, each a switch keeping it in the file and a way into its page. */
function TrackLine({ file, track, onOpen }: { file: File; track: MuxTrack; onOpen: (key: string) => void }) {
	const set = useMuxSettings((state) => state.set);
	const burned = useVideoEditor((state) => state.exportSettings?.burn === track.key);
	const facts = useTrackFacts(file, track);
	const changes = changesOf(track);
	const label = trackLabel(track);
	const blocked = blockedReason(track);
	return (
		<li className="flex min-h-13 items-center gap-3">
			<Switch
				hideLabel
				label={m.tracks_include_one({ name: label })}
				checked={track.include}
				disabled={track.blocked !== null && track.blocked !== 'burned'}
				title={blocked}
				onChange={(include) => {
					set(file, track.key, { include });
				}}
			/>
			<button
				type="button"
				data-track-row={track.key}
				onClick={() => {
					onOpen(track.key);
				}}
				className="hover:bg-surface -mr-2 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm py-2 pr-1 pl-2 text-left transition-colors"
			>
				<span className={`grid min-w-0 flex-1 gap-0.5 ${track.include ? '' : 'opacity-55'}`}>
					<span className="flex min-w-0 items-center gap-1.5">
						<span className="text-ui text-ink min-w-0 truncate font-medium">{label}</span>
						{track.default && <Badge>{m.track_badge_default()}</Badge>}
						{track.forced && <Badge>{m.track_badge_forced()}</Badge>}
						{burned && <Badge>{m.tracks_col_burn()}</Badge>}
					</span>
					<span className="text-small text-muted min-w-0 truncate tabular">
						{blocked ?? facts.join(', ')}
						{changes.length > 0 && <span className="text-ed-text"> → {changes.join(', ')}</span>}
					</span>
				</span>
				<ChevronRight className="text-muted size-4 flex-none" aria-hidden="true" />
			</button>
		</li>
	);
}

function Badge({ children }: { children: string }) {
	return (
		<span className="bg-ed-soft text-ed-text text-caption flex-none rounded-xs px-1.5 py-px font-medium">
			{children}
		</span>
	);
}

function blockedReason(track: MuxTrack): string | undefined {
	if (track.blocked === 'pgs-mp4') return m.mux_blocked_pgs();
	if (track.blocked === 'webm') return m.mux_blocked_webm();
	return undefined;
}

/** A kind's tracks under its title, with how many go in and a button adding more. */
function TrackList({
	file,
	kind,
	title,
	tracks,
	addLabel,
	onAdd,
	onOpen,
	empty,
	children,
	after,
}: {
	file: File;
	kind: MuxKind;
	title: string;
	tracks: readonly MuxTrack[];
	addLabel: string;
	onAdd: () => void;
	onOpen: (key: string) => void;
	empty: string;
	/** Settings of the whole kind, above its tracks. */
	children?: ReactNode;
	/** The file picker and what went wrong adding. */
	after?: ReactNode;
}) {
	const [own, setOwn] = useState(false);
	const shared = useContext(Unfolded);
	const unfolded = shared ? shared.kinds.has(kind) : own;
	const kept = tracks.filter((track) => track.include).length;
	const folds = tracks.length > FOLD_AFTER;
	const shown = folds && !unfolded ? tracks.slice(0, SHOWN_FOLDED) : tracks;
	return (
		<Section
			title={title}
			action={
				<>
					{tracks.length > 0 && (
						<span className="text-small text-muted tabular">
							{m.tracks_kept({ kept, count: tracks.length })}
						</span>
					)}
					<IconButton label={addLabel} onClick={onAdd}>
						<Plus className="size-[1.15rem]" />
					</IconButton>
				</>
			}
		>
			{children}
			<div data-media={KIND_MEDIA[kind]} className="grid">
				{tracks.length === 0 ? (
					<p className="text-ui text-muted">{empty}</p>
				) : (
					<ul className="divide-line -my-1 grid divide-y">
						{shown.map((track) => (
							<TrackLine key={track.key} file={file} track={track} onOpen={onOpen} />
						))}
					</ul>
				)}
				{folds && (
					<button
						type="button"
						onClick={() => {
							if (shared) shared.toggle(kind);
							else setOwn((value) => !value);
						}}
						className="text-ui text-ed-text hover:text-ink mt-1 justify-self-start py-1.5 font-medium transition-colors"
					>
						{unfolded ? m.tracks_fewer() : m.tracks_more({ count: tracks.length - SHOWN_FOLDED })}
					</button>
				)}
			</div>
			{after}
		</Section>
	);
}

/**
 * The sound tracks of the video: those of the file and those added from other files. `settings`
 * are the encoding every track takes unless its page says otherwise.
 */
export function SoundTracks({
	opened,
	target,
	onOpen,
	settings,
}: {
	opened: OpenedFile;
	target: VideoContainer | null;
	onOpen: (key: string) => void;
	settings?: ReactNode;
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
		let last: string | null = null;
		for (const { file, sound } of taken) if (sound) last = addAudio(opened.file, { file, codec: sound.codec });
		// The sound just added is heard at once, as if chosen in the player.
		const heard = last === null ? null : audioId(last);
		if (heard !== null) usePlayback.getState().setAudioTrack(heard);
		setRefused(read.find(({ sound }) => sound === null)?.file.name ?? null);
		return true;
	};
	// Sound files dropped on the page become tracks of the video; videos still open.
	useDropHandler(async (files) => add(files, true));

	if (!tracks) return <p className="text-ui text-muted">{m.subs_reading_track({ percent: 0 })}</p>;
	return (
		<TrackList
			file={opened.file}
			kind="audio"
			title={m.mux_audio()}
			tracks={tracks}
			addLabel={m.tracks_add_sound()}
			onAdd={() => picker.current?.click()}
			onOpen={onOpen}
			empty={m.audio_no_tracks()}
			after={
				<>
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
					{refused && (
						<p role="alert" className="text-small text-danger">
							{m.mux_no_sound({ name: refused })}
						</p>
					)}
				</>
			}
		>
			{settings}
		</TrackList>
	);
}

/**
 * The subtitle tracks going into the video: those of the file as the subtitle editor left them,
 * new subtitles written there, and subtitle files added here.
 */
export function SubtitleTracks({
	opened,
	target,
	burned = null,
	onOpen,
	onAdded,
}: {
	opened: OpenedFile;
	target: VideoContainer | null;
	burned?: string | null;
	onOpen: (key: string) => void;
	/** Subtitle files were added: the first one now shows over the video. */
	onAdded?: () => void;
}) {
	const tracks = useMuxTracks(opened.file, opened.format, target, burned)?.tracks.filter(
		(track) => track.kind === 'subtitle',
	);
	const addFiles = useSubtitleProject((state) => state.addFiles);
	const [refused, setRefused] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);

	const add = async (files: File[]) => {
		const before = useSubtitleProject.getState().tracks.length;
		setRefused(await addFiles(files));
		if (useSubtitleProject.getState().tracks.length > before) onAdded?.();
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
		<TrackList
			file={opened.file}
			kind="subtitle"
			title={m.player_subtitles()}
			tracks={tracks}
			addLabel={m.tracks_add_subtitles()}
			onAdd={() => picker.current?.click()}
			onOpen={onOpen}
			empty={m.subs_no_tracks()}
			after={
				<>
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
					{refused && (
						<p role="alert" className="text-small text-danger">
							{m.mux_unreadable_subtitles({ name: refused })}
						</p>
					)}
				</>
			}
		/>
	);
}

/** The page of one track: whether it goes in, how players list it, and for sound its encoding and level. */
function TrackPage({
	opened,
	track,
	tracks,
	target,
	soundDefault,
	editLines,
	onBack,
}: {
	opened: OpenedFile;
	track: MuxTrack;
	/** Its kind's tracks: one only is the default. */
	tracks: readonly MuxTrack[];
	target: VideoContainer | null;
	/** What "like the others" means for its sound: copied, or the codec and bitrate chosen. */
	soundDefault: string;
	/** Its lines can be opened in the subtitle editor. */
	editLines: boolean;
	onBack: () => void;
}) {
	const file = opened.file;
	const set = useMuxSettings((state) => state.set);
	const removeAudio = useMuxSettings((state) => state.removeAudio);
	const removeSubtitles = useSubtitleProject((state) => state.removeAdded);
	const choose = useSubtitleProject((state) => state.choose);
	const exportSettings = useVideoEditor((state) => state.exportSettings);
	const setExport = useVideoEditor((state) => state.setExport);
	const openFrom = useSession((state) => state.openFrom);
	const navigate = useNavigate();
	const facts = useTrackFacts(file, track);
	const ids = { name: useId(), language: useId(), codec: useId(), bitrate: useId() };
	const change = (patch: Parameters<typeof set>[2]) => {
		set(file, track.key, patch);
	};
	const container = target ?? 'mkv';
	const codecs = ENCODE_CODECS.filter((codec) => CONTAINERS[container].audio.includes(codec));
	const languages = [...new Set([track.language, ...LANGUAGES])];
	const removable = track.added !== null || isAdded(track.subtitle);
	// Burning in is an export setting, offered where the video is exported, and not into WebM.
	const burnable = track.kind === 'subtitle' && exportSettings !== null && target !== 'webm';
	const burned = exportSettings?.burn === track.key;
	const blocked = blockedReason(track);
	const field =
		'border-field bg-bg text-ui hover:border-muted h-9 w-full min-w-0 rounded-xs border px-2.5 transition-colors';

	return (
		<>
			<PanelTitle onBack={onBack}>{trackLabel(track)}</PanelTitle>

			<div data-media={KIND_MEDIA[track.kind]} className="grid gap-1">
				<p className="text-small text-muted tabular">{blocked ?? facts.join(', ')}</p>
				<Switch
					label={m.track_in_file()}
					checked={track.include}
					disabled={track.blocked !== null && track.blocked !== 'burned'}
					onChange={(include) => {
						change({ include });
					}}
				/>
				{burnable && (
					<>
						<Switch
							label={m.mux_burned()}
							checked={burned}
							onChange={(value) => {
								setExport(value ? { burn: track.key, mode: 'encode' } : { burn: null });
							}}
						/>
						{burned && <p className="text-small text-muted">{m.tracks_burn_hint()}</p>}
					</>
				)}
			</div>

			<Section title={m.track_players()}>
				<div data-media={KIND_MEDIA[track.kind]} className="grid gap-3">
					<FieldRow label={m.mux_track_name()} htmlFor={ids.name}>
						<input
							id={ids.name}
							key={track.key}
							defaultValue={track.name}
							placeholder={trackLabel({ ...track, name: '' })}
							onBlur={(event) => {
								if (event.target.value !== track.name) change({ name: event.target.value });
							}}
							onKeyDown={(event) => {
								if (event.key === 'Enter') event.currentTarget.blur();
							}}
							className={field}
						/>
					</FieldRow>
					<FieldRow label={m.mux_language()} htmlFor={ids.language}>
						<Select
							id={ids.language}
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
					</FieldRow>
					<Switch
						label={m.track_default()}
						checked={track.default}
						onChange={(value) => {
							// One default per kind: making this one the default unsets the others.
							for (const other of tracks) {
								if (other.key === track.key) set(file, other.key, { default: value });
								else if (value && other.default) set(file, other.key, { default: false });
							}
						}}
					/>
					{track.kind === 'subtitle' && (
						<div className="grid">
							<Switch
								label={m.track_forced()}
								checked={track.forced}
								onChange={(forced) => {
									change({ forced });
								}}
							/>
							<p className="text-small text-muted">{m.track_forced_hint()}</p>
						</div>
					)}
				</div>
			</Section>

			{track.kind === 'audio' && (
				<Section title={m.track_sound()}>
					<div data-media="audio" className="grid gap-3.5">
						<div className="grid gap-1.5">
							<Segmented
								label={m.tracks_encoding()}
								value={track.encode ? 'encode' : 'default'}
								options={[
									{ value: 'default', label: m.track_like_others() },
									{ value: 'encode', label: m.tracks_reencode() },
								]}
								onChange={(value) => {
									change({
										encode:
											value === 'default'
												? null
												: {
														codec: codecs[0] ?? 'aac',
														bitrate: container === 'webm' ? 128 : 160,
													},
									});
								}}
							/>
							{!track.encode && <p className="text-small text-muted">{soundDefault}</p>}
						</div>
						{track.encode && (
							<>
								<FieldRow label={m.tracks_codec()} htmlFor={ids.codec}>
									<Select
										id={ids.codec}
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
								</FieldRow>
								<FieldRow label={m.tracks_bitrate()} htmlFor={ids.bitrate}>
									<Select
										id={ids.bitrate}
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
								</FieldRow>
							</>
						)}
						<Slider
							label={m.mux_volume()}
							value={track.decibels}
							min={-24}
							max={24}
							step={0.5}
							defaultValue={0}
							resettable
							format={formatDb}
							onChange={(decibels) => {
								change({ decibels });
							}}
							onEnd={() => undefined}
						/>
					</div>
				</Section>
			)}

			{((editLines && track.kind === 'subtitle') || removable) && (
				<section className="grid gap-2">
					{editLines && track.kind === 'subtitle' && (
						<Button
							className="h-10"
							onClick={() => {
								if (track.subtitle !== null) choose(track.subtitle);
								openFrom('video', 'subtitles');
								void navigate({ to: EDITORS.subtitles.path });
							}}
						>
							<Pencil size={15} aria-hidden="true" />
							{m.tracks_edit_lines()}
						</Button>
					)}
					{removable && (
						<Button
							className="hover:text-danger h-10"
							onClick={() => {
								onBack();
								if (track.added) removeAudio(file, track.key);
								else if (track.subtitle !== null) removeSubtitles(track.subtitle);
							}}
						>
							<Trash2 size={15} aria-hidden="true" />
							{m.mux_remove_track()}
						</Button>
					)}
				</section>
			)}
		</>
	);
}

/**
 * Hosts the tracks inside a panel: the panel as given, or the page of the track opened in it,
 * sliding in from the right and back. The list's scroll and the focus come back with it.
 */
export function TrackPages({
	opened,
	target,
	burned = null,
	soundDefault,
	editLines = false,
	children,
}: {
	opened: OpenedFile;
	target: VideoContainer | null;
	burned?: string | null;
	soundDefault: string;
	editLines?: boolean;
	/** The panel, given the way to open a track's page. */
	children: (open: (key: string) => void) => ReactNode;
}) {
	const [page, setPage] = useState<{ key: string | null; back: string | null }>({ key: null, back: null });
	const [unfolded, setUnfolded] = useState<ReadonlySet<MuxKind>>(new Set());
	const toggle = (kind: MuxKind) => {
		setUnfolded((kinds) => {
			const next = new Set(kinds);
			if (!next.delete(kind)) next.add(kind);
			return next;
		});
	};
	const tracks = useMuxTracks(opened.file, opened.format, target, burned)?.tracks;
	const track = page.key === null ? undefined : tracks?.find((candidate) => candidate.key === page.key);
	const wrapper = useRef<HTMLDivElement>(null);
	const listScroll = useRef(0);
	const panel = () => wrapper.current?.closest('aside') ?? null;

	useLayoutEffect(() => {
		const aside = panel();
		if (!aside) return;
		if (page.key !== null) {
			aside.scrollTop = 0;
			wrapper.current?.querySelector<HTMLElement>('[data-panel-title] button')?.focus();
		} else if (page.back !== null) {
			aside.scrollTop = listScroll.current;
			// Focus goes back to the line of the track left.
			wrapper.current
				?.querySelector<HTMLElement>(`[data-track-row="${CSS.escape(page.back)}"]`)
				?.focus({ preventScroll: true });
		}
	}, [page]);

	if (track && tracks) {
		return (
			<div ref={wrapper} data-page key={`page-${track.key}`} className="page-forward">
				<TrackPage
					opened={opened}
					track={track}
					tracks={tracks.filter((other) => other.kind === track.kind)}
					target={target}
					soundDefault={soundDefault}
					editLines={editLines}
					onBack={() => {
						setPage({ key: null, back: track.key });
					}}
				/>
			</div>
		);
	}
	return (
		<div ref={wrapper} data-page key="list" className={page.back === null ? undefined : 'page-back'}>
			<Unfolded value={{ kinds: unfolded, toggle }}>
				{children((key) => {
					listScroll.current = panel()?.scrollTop ?? 0;
					setPage({ key, back: null });
				})}
			</Unfolded>
		</div>
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
