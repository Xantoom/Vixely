import { useNavigate } from '@tanstack/react-router';
import { AudioLines, Camera, Captions, Film, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { EDITORS } from '@/editors/registry';
import { formatClock } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { BrandLogo } from '@/ui/BrandLogo';
import { Button } from '@/ui/Button';
import { FieldRow, Select } from '@/ui/fields';
import { MEDIA_ICONS } from '@/ui/icons';
import type { Size } from '../image/document';
import { capturePicture } from './capture';
import { type CoverImage, type VideoMeta, videoLength } from './document';
import { outputSize, PRESET_GROUP_ORDER, PRESET_ORDER, type PresetGroupId, PRESETS, shortSide } from './export';
import { exportTarget, presetPicture, useChoosePreset, useExportMode } from './ExportPanel';
import { type MuxKind, useMuxTracks } from './mux';
import { AudioTrackList, SubtitleTrackList, trackLabel } from './MuxPanel';
import { useVideoDoc, useVideoEditor } from './store';
import { NEW_KEY, type SubtitleTool, TracksDialog } from './TracksDialog';

const OPEN_IN = {
	audio: () => m.audio_from_video(),
	gif: () => m.make_gif(),
	subtitles: () => m.subtitles_from_video(),
};

/**
 * Opens the current video in another editor: its soundtrack in the audio one, a GIF in the GIF
 * one, its subtitle tracks in the subtitle one.
 */
export function OpenIn({ kind }: { kind: 'audio' | 'gif' | 'subtitles' }) {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	const Icon = MEDIA_ICONS[kind];
	return (
		<Button
			onClick={() => {
				openAs(kind);
				void navigate({ to: EDITORS[kind].path });
			}}
		>
			<Icon size={16} aria-hidden="true" />
			{OPEN_IN[kind]()}
		</Button>
	);
}

/** The container the tracks go into, and the subtitle track burned into the pictures. */
function useTarget() {
	const mode = useExportMode();
	const settings = useVideoEditor((state) => state.exportSettings);
	return { target: exportTarget(mode, settings), burned: mode === 'encode' ? (settings?.burn ?? null) : null };
}

/** Which track the tracks dialog shows, and the subtitle tool it opens on; null when closed. */
type Editing = { key: string | null; tool?: SubtitleTool } | null;

/** The tracks dialog, open while `editing` says which track it shows. */
function TracksEditor({ opened, editing, onClose }: { opened: OpenedFile; editing: Editing; onClose: () => void }) {
	const { target, burned } = useTarget();
	if (!editing) return null;
	return (
		<TracksDialog
			opened={opened}
			target={target}
			burned={burned}
			initial={editing.key}
			initialTool={editing.tool ?? null}
			onClose={onClose}
		/>
	);
}

/** The Audio tool: the sound tracks that go into the video, and sound added from other files. */
export function VideoAudioPanel({ opened }: { opened: OpenedFile }) {
	const { target } = useTarget();
	const [editing, setEditing] = useState<Editing>(null);
	return (
		<>
			<PanelTitle>{m.tool_audio()}</PanelTitle>
			<AudioTrackList
				opened={opened}
				target={target}
				onEdit={(key) => {
					setEditing({ key });
				}}
			/>
			{opened.info?.audio && <OpenIn kind="audio" />}
			<TracksEditor
				opened={opened}
				editing={editing}
				onClose={() => {
					setEditing(null);
				}}
			/>
		</>
	);
}

const NONE = 'none';

/** A subtitle track drawn into the pictures, for players that show no subtitles. */
function BurnSection({ opened }: { opened: OpenedFile }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const set = useVideoEditor((state) => state.setExport);
	const id = useId();
	const subtitles = useMuxTracks(opened.file, opened.format)?.originals.filter((track) => track.kind === 'subtitle');
	if (!settings || !subtitles || subtitles.length === 0) return null;
	return (
		<Section title={m.export_burn()}>
			<FieldRow label={m.export_burn_track()} htmlFor={id}>
				<Select
					id={id}
					value={settings.burn ?? NONE}
					options={[
						{ value: NONE, label: m.burn_none() },
						...subtitles.map((track) => ({
							value: track.key,
							label: trackLabel(track),
							detail: track.codec,
						})),
					]}
					onChange={(value) => {
						set({ burn: value === NONE ? null : value });
					}}
				/>
			</FieldRow>
		</Section>
	);
}

/**
 * The Subtitles tool: the subtitle tracks that go into the video, subtitle files added to it, and
 * the track burned into the pictures.
 */
export function VideoSubtitlesPanel({ opened }: { opened: OpenedFile }) {
	const { target, burned } = useTarget();
	const [editing, setEditing] = useState<Editing>(null);
	return (
		<>
			<PanelTitle>{m.tool_subtitles()}</PanelTitle>
			<SubtitleTrackList
				opened={opened}
				target={target}
				burned={burned}
				onEdit={(key) => {
					setEditing({ key });
				}}
			/>
			<div className="grid gap-2">
				<Button
					onClick={() => {
						setEditing({ key: NEW_KEY });
					}}
				>
					<Captions size={16} aria-hidden="true" />
					{m.subs_write_new()}
				</Button>
			</div>
			<BurnSection opened={opened} />
			<TracksEditor
				opened={opened}
				editing={editing}
				onClose={() => {
					setEditing(null);
				}}
			/>
		</>
	);
}

const KIND_ICONS: Record<MuxKind, typeof Film> = { video: Film, audio: AudioLines, subtitle: Captions };
const KIND_MEDIA: Record<MuxKind, string> = { video: 'video', audio: 'audio', subtitle: 'subtitles' };

/** What the exported file will hold, track by track; the Audio and Subtitles tools change it. */
export function TrackSummary({ opened }: { opened: OpenedFile }) {
	const { target, burned } = useTarget();
	const tracks = useMuxTracks(opened.file, opened.format, target, burned)?.tracks.filter((track) => track.include);
	if (!tracks) return null;
	return (
		<Section title={m.mux_tracks()}>
			<ul className="grid gap-2">
				{tracks.map((track) => {
					const Icon = KIND_ICONS[track.kind];
					return (
						<li key={track.key} className="flex min-w-0 items-center gap-2">
							<span data-media={KIND_MEDIA[track.kind]} className="text-ed flex-none" aria-hidden="true">
								<Icon size={15} />
							</span>
							<span className="text-body truncate">{trackLabel(track)}</span>
							<span className="text-small text-muted ml-auto flex-none pl-2 font-mono">
								{track.codec}
							</span>
						</li>
					);
				})}
			</ul>
		</Section>
	);
}

/** Longest side of a cover made from a picture, in pixels: players show them small. */
const COVER_SIDE = 1280;

/**
 * A picture as a cover: a JPEG or PNG chosen as it is, anything else (a frame of the video, a
 * large picture) as a JPEG.
 */
async function coverFrom(file: Blob, keep = true): Promise<CoverImage> {
	if (keep && (file.type === 'image/jpeg' || file.type === 'image/png') && file.size < 2_000_000) {
		return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type };
	}
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, COVER_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
	return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg' };
}

/** A text field that records its value as one undo step, once left. */
function MetaField({
	label,
	value,
	multiline = false,
	type = 'text',
	onCommit,
}: {
	label: string;
	value: string;
	multiline?: boolean;
	type?: 'text' | 'date';
	onCommit: (value: string) => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		// A date is kept only once whole: year, month and day, as files store it.
		const valid = type !== 'date' || draft === '' || (draft !== null && /^\d{4}-\d{2}-\d{2}$/.test(draft));
		if (draft !== null && draft !== value && valid) onCommit(draft);
		setDraft(null);
	};
	const field =
		'border-line-2 bg-bg text-ui text-ink hover:border-muted w-full cursor-text rounded-xs border px-2.5 transition-colors';
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-ui text-ink-2">
				{label}
			</label>
			{multiline ? (
				<textarea
					id={id}
					rows={3}
					value={draft ?? value}
					onChange={(event) => {
						setDraft(event.target.value);
					}}
					onBlur={commit}
					className={`${field} resize-y py-1.5`}
				/>
			) : (
				<input
					id={id}
					type="text"
					inputMode={type === 'date' ? 'numeric' : undefined}
					placeholder={type === 'date' ? m.meta_date_format() : undefined}
					maxLength={type === 'date' ? 10 : undefined}
					value={draft ?? value}
					onChange={(event) => {
						const typed = event.target.value;
						// Dates take their dashes by themselves: 20240315 becomes 2024-03-15.
						setDraft(
							type === 'date'
								? typed
										.replace(/[^\d]/g, '')
										.slice(0, 8)
										.replace(/^(\d{4})(\d)/, '$1-$2')
										.replace(/^(\d{4}-\d{2})(\d)/, '$1-$2')
								: typed,
						);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commit();
						if (event.key === 'Escape') setDraft(null);
					}}
					className={`${field} h-8`}
				/>
			)}
		</div>
	);
}

/** The cover as a picture on screen. */
function CoverPreview({ cover }: { cover: CoverImage }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(new Blob([cover.data.slice()], { type: cover.mimeType }));
		setUrl(next);
		return () => {
			URL.revokeObjectURL(next);
		};
	}, [cover]);
	return url ? (
		<img src={url} alt={m.meta_cover()} className="bg-surface max-h-40 w-full rounded-sm object-contain" />
	) : null;
}

/**
 * What the file says about itself: title, artist, date, comment and cover, as players and file
 * browsers show them. They start as the file has them.
 */
export function MetadataSection({ opened }: { opened: OpenedFile }) {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const source = useVideoEditor((state) => state.exportSource?.source.meta ?? null);
	const picker = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	if (!source) return null;
	const meta = doc.meta ?? source;
	const change = (patch: Partial<VideoMeta>) => {
		apply((current) => ({ ...current, meta: { ...(current.meta ?? source), ...patch } }));
	};
	const setCover = (made: Promise<CoverImage>) => {
		setBusy(true);
		void made
			.then((cover) => {
				change({ cover });
			})
			.catch(() => undefined)
			.finally(() => {
				setBusy(false);
			});
	};
	return (
		<Section title={m.meta_title()}>
			<div className="grid gap-2.5">
				<MetaField
					label={m.meta_name()}
					value={meta.title}
					onCommit={(title) => {
						change({ title });
					}}
				/>
				<MetaField
					label={m.meta_artist()}
					value={meta.artist}
					onCommit={(artist) => {
						change({ artist });
					}}
				/>
				<MetaField
					label={m.meta_date()}
					type="date"
					value={meta.date}
					onCommit={(date) => {
						change({ date });
					}}
				/>
				<MetaField
					label={m.meta_comment()}
					multiline
					value={meta.comment}
					onCommit={(comment) => {
						change({ comment });
					}}
				/>
				<div className="grid gap-1.5">
					<span className="text-ui text-ink-2">{m.meta_cover()}</span>
					{meta.cover ? (
						<CoverPreview cover={meta.cover} />
					) : (
						<p className="text-ui text-muted">{m.meta_no_cover()}</p>
					)}
					<input
						ref={picker}
						type="file"
						accept="image/*"
						hidden
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = '';
							if (file) setCover(coverFrom(file));
						}}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Button disabled={busy} onClick={() => picker.current?.click()}>
							<ImagePlus size={16} aria-hidden="true" />
							{m.meta_cover_choose()}
						</Button>
						<Button
							disabled={busy}
							onClick={() => {
								setCover(
									capturePicture(opened.file, usePlayback.getState().time).then(async (frame) =>
										coverFrom(frame, false),
									),
								);
							}}
						>
							<Camera size={16} aria-hidden="true" />
							{m.meta_cover_frame()}
						</Button>
					</div>
					{meta.cover && (
						<Button
							onClick={() => {
								change({ cover: null });
							}}
						>
							<Trash2 size={16} aria-hidden="true" />
							{m.meta_cover_remove()}
						</Button>
					)}
				</div>
				{doc.meta && (
					<Button
						onClick={() => {
							apply((current) => ({ ...current, meta: null }));
						}}
					>
						{m.meta_reset()}
					</Button>
				)}
			</div>
		</Section>
	);
}

const PRESET_GROUP_TITLES: Record<PresetGroupId, () => string> = {
	messages: () => m.preset_group_messages(),
	vertical: () => m.preset_group_vertical(),
	social: () => m.preset_group_social(),
	video: () => m.preset_group_video(),
	general: () => m.preset_group_general(),
};

/**
 * The Formats tool: the settings of the places videos are sent to, one click each. Vertical
 * formats crop the pictures to 9:16 from the middle, which the crop tool can then move.
 */
export function VideoPresetsPanel({ upright }: { upright: Size }) {
	const chosen = useVideoEditor((state) => state.exportSettings?.preset ?? null);
	const ready = useVideoEditor((state) => state.exportSource !== null);
	const doc = useVideoDoc();
	const length = videoLength(doc);
	const choose = useChoosePreset(upright);
	return (
		<>
			<PanelTitle>{m.tool_presets()}</PanelTitle>
			{PRESET_GROUP_ORDER.map((group) => (
				<Section key={group} title={PRESET_GROUP_TITLES[group]()}>
					<div className="-mt-1 grid gap-1">
						{PRESET_ORDER.filter((id) => PRESETS[id].group === group).map((id) => {
							const preset = PRESETS[id];
							const box = outputSize(presetPicture(doc.picture, upright, id), upright, null);
							const scale = Math.min(1, preset.maxHeight / shortSide(box));
							const size = `${Math.round(box.width * scale)}×${Math.round(box.height * scale)}`;
							const tooLong = preset.maxSeconds !== undefined && length > preset.maxSeconds + 0.05;
							const facts = [
								size,
								preset.sizeLimit === null
									? null
									: `≤ ${preset.sizeLimit >= 1000 ? m.size_gb({ size: preset.sizeLimit / 1000 }) : m.size_mb({ size: preset.sizeLimit })}`,
							].filter(Boolean);
							return (
								<button
									key={id}
									type="button"
									aria-pressed={chosen === id}
									disabled={!ready}
									onClick={() => {
										choose(id);
									}}
									className="enabled:hover:bg-surface aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] ease-spring -mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-[background-color,transform] duration-200 enabled:active:scale-[0.98] disabled:opacity-50"
								>
									<BrandLogo logo={preset.logo} size={30} />
									<span className="grid min-w-0">
										<span className="text-ui truncate font-medium">{preset.label}</span>
										<span className="text-caption text-muted tabular truncate font-mono">
											{facts.join(' · ')}
										</span>
									</span>
									{preset.maxSeconds !== undefined && (
										<span
											title={
												tooLong
													? m.preset_too_long({ length: formatClock(preset.maxSeconds) })
													: undefined
											}
											className={`text-caption tabular rounded-full px-2 py-0.5 font-mono ${
												tooLong
													? 'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-(--danger)'
													: 'text-muted'
											}`}
										>
											≤ {formatClock(preset.maxSeconds)}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</Section>
			))}
		</>
	);
}
