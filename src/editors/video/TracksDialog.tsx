import { AudioLines, Captions, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PanelTitles } from '@/editor/EditorLayout';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { formatDb } from '@/lib/format';
import { languageName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { useDragScroll } from '@/ui/drag-scroll';
import { Dropdown } from '@/ui/Dropdown';
import { FieldRow, Slider, Switch } from '@/ui/fields';
import { Modal } from '@/ui/Modal';
import { TimingPanel } from '../subtitles/panels';
import { isAdded, isPictures, type TrackKey, useProjectReady, useSubtitleProject } from '../subtitles/project';
import { useSubtitleEditor } from '../subtitles/store';
import { SubtitleViewer } from '../subtitles/SubtitleViewer';
import { OcrPanel, TranslatePanel } from '../subtitles/tools';
import { useSubtitleShortcuts, Workspace } from '../subtitles/Workspace';
import type { VideoContainer } from './export';
import { type MuxTrack, useMuxSettings, useMuxTracks } from './mux';
import { LANGUAGES, trackLabel } from './MuxPanel';

/** The key of the new subtitles' tab, before they have a line and so a track of their own. */
export const NEW_KEY = 'subtitle-new';

export type SubtitleTool = 'timing' | 'translate' | 'ocr';

const TOOL_LABELS: Record<SubtitleTool, () => string> = {
	timing: () => m.tool_timing(),
	translate: () => m.tool_translate(),
	ocr: () => m.tool_ocr(),
};

/** A track's tab: its kind, its name, and a dot when it goes in the file. */
function TrackTab({ track, selected, onSelect }: { track: MuxTrack; selected: boolean; onSelect: () => void }) {
	const Icon = track.kind === 'audio' ? AudioLines : Captions;
	return (
		<button
			type="button"
			role="tab"
			aria-selected={selected}
			onClick={onSelect}
			data-media={track.kind === 'audio' ? 'audio' : 'subtitles'}
			className={`text-ui flex h-9 flex-none items-center gap-2 rounded-sm px-3 font-medium whitespace-nowrap transition-[background-color,box-shadow,color] duration-150 ${
				selected
					? 'bg-ed-soft text-ink shadow-[inset_0_0_0_1.5px_var(--ed)]'
					: 'text-ink-2 hover:bg-surface hover:text-ink'
			} ${track.include ? '' : 'opacity-55'}`}
		>
			<Icon size={15} className="text-ed flex-none" aria-hidden="true" />
			{trackLabel(track)}
			{track.edited && <span className="bg-ed size-1.5 flex-none rounded-full" aria-hidden="true" />}
		</button>
	);
}

/** What a track is written with: kept or not, language, name, flags, and the level of sound. */
function TrackProperties({ file, track }: { file: File; track: MuxTrack }) {
	const set = useMuxSettings((state) => state.set);
	const removeAudio = useMuxSettings((state) => state.removeAudio);
	const removeSubtitles = useSubtitleProject((state) => state.removeAdded);
	const change = (patch: Parameters<typeof set>[2]) => {
		set(file, track.key, patch);
	};
	const languages = [...new Set([track.language, ...LANGUAGES])];
	const blocked =
		track.blocked === 'pgs-mp4'
			? m.mux_blocked_pgs()
			: track.blocked === 'webm'
				? m.mux_blocked_webm()
				: track.blocked === 'burned'
					? m.mux_burned()
					: null;
	return (
		<div className="grid gap-3.5">
			<label className="text-ui flex items-center gap-2.5 font-medium">
				<Checkbox
					checked={track.include}
					disabled={track.blocked !== null}
					onChange={(event) => {
						change({ include: event.target.checked });
					}}
				/>
				{m.tracks_include()}
				<span className="text-small text-muted ml-auto font-mono">{track.codec}</span>
			</label>
			{blocked && <p className="text-small text-muted">{blocked}</p>}
			<FieldRow label={m.mux_language()}>
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
			</FieldRow>
			<FieldRow label={m.mux_track_name()}>
				<input
					key={track.key}
					aria-label={m.mux_track_name()}
					defaultValue={track.name}
					onBlur={(event) => {
						if (event.target.value !== track.name) change({ name: event.target.value });
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					className="border-line-2 bg-bg text-ui hover:border-muted h-8 w-full min-w-0 rounded-xs border px-2.5 transition-colors"
				/>
			</FieldRow>
			<Switch
				label={m.subs_track_default()}
				checked={track.default}
				onChange={(value) => {
					change({ default: value });
				}}
			/>
			{track.kind === 'subtitle' && (
				<Switch
					label={m.subs_track_forced()}
					checked={track.forced}
					onChange={(value) => {
						change({ forced: value });
					}}
				/>
			)}
			{track.kind === 'audio' && (
				<Slider
					label={m.mux_volume()}
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
			)}
			{(track.added || isAdded(track.subtitle)) && (
				<Button
					onClick={() => {
						if (track.added) removeAudio(file, track.key);
						else if (track.subtitle !== null) removeSubtitles(track.subtitle);
					}}
				>
					<Trash2 size={16} aria-hidden="true" />
					{m.mux_remove_track()}
				</Button>
			)}
		</div>
	);
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-3.5">
			<h3 className="text-ui text-ink-2 font-semibold">{title}</h3>
			{children}
		</section>
	);
}

/** The subtitle editor's shortcuts and undo, while the dialog shows subtitles. */
function SubtitleKeys() {
	const undo = useSubtitleEditor((state) => state.undo);
	const redo = useSubtitleEditor((state) => state.redo);
	useEditorShortcuts({ undo, redo, inDialog: true });
	useSubtitleShortcuts(true);
	return null;
}

/**
 * The sound and subtitle tracks of the video, edited without leaving it: each track's details,
 * the level of the sound, and the lines of the subtitles in the subtitle editor's layout, with its
 * timing, translation and text recognition.
 */
export function TracksDialog({
	opened,
	target,
	burned,
	initial,
	initialTool = null,
	onClose,
}: {
	opened: OpenedFile;
	target: VideoContainer | null;
	burned: string | null;
	/** The track shown first, by its key. */
	initial: string | null;
	/** The subtitle tool open first. */
	initialTool?: SubtitleTool | null;
	onClose: () => void;
}) {
	const tracks = useMuxTracks(opened.file, opened.format, target, burned)?.tracks.filter(
		(track) => track.kind !== 'video',
	);
	const choose = useSubtitleProject((state) => state.choose);
	const current = useSubtitleProject((state) => state.current);
	const hasNew = useSubtitleProject((state) => state.tracks.some((track) => track.key === 'new'));
	const pictures = useSubtitleProject((state) => state.tracks.some(isPictures));
	const ready = useProjectReady();
	const setAudioTrack = usePlayback((state) => state.setAudioTrack);
	const [selected, setSelected] = useState(initial);
	const [tool, setTool] = useState<SubtitleTool | null>(initialTool);
	const tabs = useDragScroll<HTMLDivElement>();

	const newListed = tracks?.some((track) => track.subtitle === 'new') ?? false;
	const shown = tracks?.find((track) => track.key === selected) ?? tracks?.[0] ?? null;
	const writingNew = selected === NEW_KEY;
	const subtitleKey = writingNew ? 'new' : shown?.kind === 'subtitle' ? shown.subtitle : null;

	// The subtitle editor shows the track chosen here; sound is heard from the one chosen.
	const audioNumber = shown?.kind === 'audio' && shown.added === null ? shown.number : null;
	useEffect(() => {
		if (subtitleKey !== null) choose(subtitleKey);
		else if (audioNumber !== null) setAudioTrack(audioNumber);
	}, [subtitleKey, audioNumber, choose, setAudioTrack]);
	// Subtitles made by a tool, such as a translation, open in their own tab.
	const followed = useRef(new Set<TrackKey | null>([current]));
	const made = tracks?.find((track) => track.subtitle === current);
	useEffect(() => {
		if (!made || followed.current.has(current)) return;
		followed.current.add(current);
		if (current !== null && isAdded(current)) setSelected(made.key);
	}, [made, current]);

	const subtitleTools: SubtitleTool[] = ['timing', 'translate', ...(pictures ? (['ocr'] as const) : [])];
	const showsSubtitles = subtitleKey !== null && ready && current === subtitleKey;
	const title = opened.file.name.replace(/\.[^.]+$/, '');

	return (
		<Modal
			title={m.tracks_title()}
			onClose={onClose}
			header={
				<div
					ref={tabs}
					role="tablist"
					aria-label={m.tracks_title()}
					className="flex min-w-0 gap-1 overflow-x-auto"
				>
					{tracks?.map((track) => (
						<TrackTab
							key={track.key}
							track={track}
							selected={!writingNew && shown?.key === track.key}
							onSelect={() => {
								setSelected(track.key);
							}}
						/>
					))}
					{hasNew && !newListed && (
						<button
							type="button"
							role="tab"
							aria-selected={writingNew}
							onClick={() => {
								setSelected(NEW_KEY);
							}}
							data-media="subtitles"
							className={`text-ui flex h-9 flex-none items-center gap-2 rounded-sm px-3 font-medium whitespace-nowrap transition-colors ${
								writingNew
									? 'bg-ed-soft text-ink shadow-[inset_0_0_0_1.5px_var(--ed)]'
									: 'text-ink-2 hover:bg-surface hover:text-ink'
							}`}
						>
							<Plus size={15} className="text-ed" aria-hidden="true" />
							{m.subs_new_track()}
						</button>
					)}
				</div>
			}
		>
			<div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px] max-lg:grid-cols-1 max-lg:overflow-auto">
				<div className="min-h-0 min-w-0">
					{subtitleKey !== null ? (
						showsSubtitles ? (
							<>
								<SubtitleKeys />
								<Workspace title={title} />
							</>
						) : (
							<p className="text-body text-muted p-6">{m.tracks_unreadable()}</p>
						)
					) : (
						<div className="h-full min-h-[320px] p-3" data-media="audio">
							<SubtitleViewer title={title} />
						</div>
					)}
				</div>
				<aside
					aria-label={m.inspector()}
					className="border-line grid min-h-0 auto-rows-max content-start gap-6 overflow-auto border-l px-5 py-5 max-lg:border-t max-lg:border-l-0"
				>
					{shown && !writingNew && (
						<SideSection title={shown.kind === 'audio' ? m.tracks_sound() : m.tracks_subtitles()}>
							<TrackProperties file={opened.file} track={shown} />
						</SideSection>
					)}
					{subtitleKey !== null && showsSubtitles && (
						<SideSection title={m.tracks_tools()}>
							<div role="tablist" aria-label={m.tracks_tools()} className="grid grid-cols-2 gap-1.5">
								{subtitleTools.map((id) => (
									<button
										key={id}
										type="button"
										role="tab"
										aria-selected={tool === id}
										onClick={() => {
											setTool(tool === id ? null : id);
										}}
										className="text-ui aria-selected:bg-ed-soft hover:bg-surface aria-selected:text-ink text-ink-2 h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)]"
									>
										{TOOL_LABELS[id]()}
									</button>
								))}
							</div>
							<PanelTitles value={false}>
								{tool === 'timing' && <TimingPanel />}
								{tool === 'translate' && <TranslatePanel fileName={opened.file.name} />}
								{tool === 'ocr' && <OcrPanel fileName={opened.file.name} />}
							</PanelTitles>
						</SideSection>
					)}
				</aside>
			</div>
		</Modal>
	);
}
