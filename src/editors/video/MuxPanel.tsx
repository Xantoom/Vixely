import { AudioLines, Captions, Check, Film, Flag, Pencil, Star } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Section } from '@/editor/panel-parts';
import { languageName } from '@/lib/language';
import { outputName } from '@/media/save';
import { openSaveTarget } from '@/media/save-target';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { Dropdown } from '@/ui/Dropdown';
import { useSubtitleEditor } from '../subtitles/store';
import { exportVideo, type MuxKind, type MuxTrack, muxContainer, useMuxSettings, useMuxTracks } from './mux';

const KIND_ICONS: Record<MuxKind, typeof Film> = { video: Film, audio: AudioLines, subtitle: Captions };
/** Each kind in the colour of its editor, as everywhere in the app. */
const KIND_MEDIA: Record<MuxKind, string> = { video: 'video', audio: 'audio', subtitle: 'subtitles' };

/** Languages offered for subtitle tracks, as ISO 639-2 codes; the track's own is added. */
const LANGUAGES = [
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

function trackLabel(track: MuxTrack): string {
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
function TrackRow({ file, track }: { file: File; track: MuxTrack }) {
	const set = useMuxSettings((state) => state.set);
	const [open, setOpen] = useState(false);
	const Icon = KIND_ICONS[track.kind];
	const change = (patch: Parameters<typeof set>[2]) => {
		set(file, track.key, patch);
	};
	const blockedReason = track.blocked === 'pgs-mp4' ? m.mux_blocked_pgs() : undefined;
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
				<span className="text-small text-muted ml-auto flex-none pl-2 font-mono">{track.codec}</span>
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
						<>
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
							<FlagToggle
								label={m.mux_edit_track()}
								pressed={open}
								disabled={!track.include}
								onChange={setOpen}
							>
								<Pencil size={14} />
							</FlagToggle>
						</>
					)}
				</div>
			)}
			{open && track.kind === 'subtitle' && (
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
 * The tracks of the video to export, as in MKVToolNix: every track of the file and the subtitles
 * made or edited here, each kept or left out, with its language, name and flags.
 */
export function MuxTracks({ opened }: { opened: OpenedFile }) {
	const tracks = useMuxTracks(opened.file, opened.format)?.tracks;
	if (!tracks) return <p className="text-ui text-muted">{m.subs_reading_track({ percent: 0 })}</p>;
	return (
		<Section title={m.mux_tracks()}>
			<ul className="grid gap-3">
				{tracks.map((track) => (
					<TrackRow key={track.key} file={opened.file} track={track} />
				))}
			</ul>
		</Section>
	);
}

/** Writes the video with the chosen tracks, nothing re-encoded. */
export function MuxFooter({ opened }: { opened: OpenedFile }) {
	const listed = useMuxTracks(opened.file, opened.format);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState(0);
	const abort = useRef<AbortController | null>(null);
	const container = muxContainer(opened.format);

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
		const extension = container;
		const save = await openSaveTarget(outputName(opened.file.name, extension), {
			mime: container === 'mkv' ? 'video/x-matroska' : 'video/mp4',
			extension,
			description: container.toUpperCase(),
		});
		if (!save) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		try {
			await exportVideo(
				{
					file: opened.file,
					format: opened.format,
					tracks: listed.tracks,
					shown: () => useSubtitleEditor.getState().history.present,
					title: opened.file.name.replace(/\.[^.]+$/, ''),
				},
				listed.originals,
				save,
				setProgress,
				controller.signal,
			);
			await save.commit();
			setStatus('saved');
		} catch (error) {
			await save.discard().catch(() => undefined);
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
					disabled={!listed || status === 'saving'}
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
						m.export_as({ format: container.toUpperCase() })
					)}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.mux_failed()}
				</p>
			)}
		</>
	);
}
