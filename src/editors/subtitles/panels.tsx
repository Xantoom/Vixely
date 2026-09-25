import { useNavigate } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowLeft, Ban, Check, Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { Section } from '@/editor/panel-parts';
import { saveFile } from '@/editors/image/export';
import { EDITORS } from '@/editors/registry';
import { formatBytes, formatPreciseTime } from '@/lib/format';
import { languageName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import { type OpenedFile, useSession } from '@/media/session';
import type { SubtitleTrackInfo } from '@/media/subtitle-source';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { FieldRow, OptionList, Select, TimeField } from '@/ui/fields';
import { muxContainer } from '../video/mux';
import { MuxFooter, MuxTracks } from '../video/MuxPanel';
import { FRAME_RATES, lastEnd, retime, shownCues, type SubtitleFormat, syncPoints } from './document';
import { droppedCues, exportFormats, FORMAT_FILES, writeSubtitles } from './formats';
import { ENCODINGS, type EncodingId } from './formats/encoding';
import { cueLabel } from './labels';
import { writeSup } from './pgs';
import { exportName, useProjectTracks, useSubtitleProject } from './project';
import { useSubtitleDoc, useSubtitleEditor } from './store';
import { codecLabel, unsupportedReason, type Unsupported } from './tracks';

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
			<dt className="text-ink-2">{label}</dt>
			<dd className="tabular font-mono text-[12.5px]">{value}</dd>
		</div>
	);
}

/** SSA files are read and written like ASS; their header says which one they are. */
function formatLabel(format: SubtitleFormat, scriptType: string | null | undefined): string {
	if (format === 'ass' && scriptType?.toLowerCase() === 'v4.00') return 'SSA';
	return FORMAT_FILES[format].label;
}

const UNSUPPORTED: Record<Unsupported, () => string> = {
	vobsub: () => m.subs_unsupported_vobsub(),
	dvb: () => m.subs_unsupported_dvb(),
	ttml: () => m.subs_unsupported_ttml(),
	captions: () => m.subs_unsupported_captions(),
	compressed: () => m.subs_unsupported_compressed(),
	other: () => m.subs_unsupported_other(),
};

function trackLabel(track: SubtitleTrackInfo): string {
	return [languageName(track.language), track.name].filter(Boolean).join(', ');
}

/**
 * The subtitle tracks of the video, all read already: picking one shows it at once, and edits of
 * the others are kept. A dot marks tracks that were edited.
 */
function TracksSection() {
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const choose = useSubtitleProject((state) => state.choose);
	const listFailed = useSubtitleProject((state) => state.listFailed);
	return (
		<Section title={m.subs_tracks()}>
			<div role="radiogroup" aria-label={m.subs_tracks()} className="-mx-2.5 grid gap-0.5">
				{tracks.map((track) => {
					const { info } = track;
					const usable = track.original !== null;
					const reason = info && !usable ? UNSUPPORTED[unsupportedReason(info)]() : undefined;
					return (
						<button
							key={track.key}
							type="button"
							role="radio"
							aria-checked={current === track.key}
							disabled={!usable}
							title={reason}
							onClick={() => {
								choose(track.key);
							}}
							className="enabled:hover:bg-surface group grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 rounded-xs px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45"
						>
							<span className="size-4 rounded-full shadow-[inset_0_0_0_1.5px_var(--line-2)] group-aria-checked:shadow-[inset_0_0_0_5px_var(--ed)]" />
							<span className="grid min-w-0">
								<span className="text-body flex min-w-0 items-center gap-1.5">
									<span className="truncate">{info ? trackLabel(info) : m.subs_new_track()}</span>
									{track.edited && (
										<span
											className="bg-ed size-2 flex-none rounded-full"
											title={m.subs_track_edited()}
											aria-label={m.subs_track_edited()}
										/>
									)}
								</span>
								{info && (info.default || info.forced) && (
									<span className="text-small text-muted">
										{[
											info.default ? m.subs_track_default() : '',
											info.forced ? m.subs_track_forced() : '',
										]
											.filter(Boolean)
											.join(', ')}
									</span>
								)}
							</span>
							<span className="text-small text-muted flex items-center gap-1.5 font-mono">
								{!usable && info && <Ban size={13} aria-hidden="true" />}
								{info ? codecLabel(info) : <Plus size={14} aria-hidden="true" />}
							</span>
						</button>
					);
				})}
			</div>
			{listFailed && <p className="text-small text-danger">{m.subs_tracks_failed()}</p>}
		</Section>
	);
}

/** Back to the video these subtitles belong to, with the edits kept. */
function BackToVideo() {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	return (
		<Button
			onClick={() => {
				openAs('video');
				void navigate({ to: EDITORS.video.path });
			}}
		>
			<ArrowLeft size={16} aria-hidden="true" />
			{m.subs_back_to_video()}
		</Button>
	);
}

export function SubtitleInfoPanel({ opened }: { opened: OpenedFile }) {
	const doc = useSubtitleDoc();
	const encoding = useSubtitleEditor((state) => state.encoding);
	const source = useSubtitleProject((state) => state.source);
	const fonts = useSubtitleProject((state) => state.fonts);
	const setEncoding = useSubtitleProject((state) => state.setEncoding);
	const details = usePlayback((state) => state.details);
	const encodingId = useId();
	const count = doc.cues.filter((cue) => !cue.comment).length;
	const fromVideo = source === 'video';
	return (
		<>
			<PanelTitle>{m.info_file()}</PanelTitle>
			{fromVideo && <BackToVideo />}
			<dl className="grid gap-3.5">
				<Row
					label={m.info_format()}
					value={fromVideo ? opened.format.toUpperCase() : formatLabel(doc.format, doc.ass?.scriptType)}
				/>
				<Row label={m.info_size()} value={formatBytes(opened.file.size)} />
				{details && <Row label={m.info_duration()} value={formatPreciseTime(details.duration)} />}
				{details?.video && (
					<Row label={m.info_resolution()} value={`${details.video.width} × ${details.video.height}`} />
				)}
				<Row label={m.subs_lines()} value={String(count)} />
				<Row label={m.subs_last_line()} value={formatPreciseTime(lastEnd(doc) / 1000)} />
				{doc.ass?.playRes && (
					<Row label={m.subs_play_res()} value={`${doc.ass.playRes.width} × ${doc.ass.playRes.height}`} />
				)}
				{doc.pgsSize && (
					<Row label={m.subs_picture_size()} value={`${doc.pgsSize.width} × ${doc.pgsSize.height}`} />
				)}
				{doc.ass && doc.ass.styles.length > 0 && (
					<Row label={m.subs_styles()} value={String(doc.ass.styles.length)} />
				)}
				{fonts.length > 0 && <Row label={m.subs_fonts()} value={String(fonts.length)} />}
			</dl>
			{fromVideo && <TracksSection />}
			{source === 'text' && (
				<Section title={m.subs_charset()}>
					<label htmlFor={encodingId} className="sr-only">
						{m.subs_charset_read()}
					</label>
					<Select
						id={encodingId}
						value={encoding}
						options={ENCODINGS.map((option) => ({ value: option.id, label: option.label }))}
						onChange={(value: EncodingId) => {
							setEncoding(value);
						}}
					/>
				</Section>
			)}
		</>
	);
}

/** `+1.500 s`, `−0.250 s`: a shift, with a true minus sign. */
export function signedSeconds(milliseconds: number): string {
	const sign = milliseconds > 0 ? '+' : milliseconds < 0 ? '\u2212' : '';
	return `${sign}${(Math.abs(milliseconds) / 1000).toFixed(3)} s`;
}

/** Signed seconds, typed as `-1.5`, `+0,250` or `2`. */
export function OffsetField({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft === null) return;
		const cleaned = draft.trim().replace(',', '.').replace('\u2212', '-').replace(/\s*s$/, '');
		setDraft(null);
		if (/^[+-]?\d*\.?\d+$/.test(cleaned)) onChange(Math.round(Number(cleaned) * 1000));
	};
	const shown = signedSeconds(value);
	return (
		<input
			id={id}
			type="text"
			inputMode="decimal"
			spellCheck={false}
			value={draft ?? shown}
			onChange={(event) => {
				setDraft(event.target.value);
			}}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit();
				if (event.key === 'Escape') setDraft(null);
			}}
			className="border-line-2 bg-bg text-ink hover:border-muted tabular h-8 w-full cursor-text rounded-xs border px-2.5 font-mono text-[12.5px] transition-colors"
		/>
	);
}

type Scope = 'all' | 'selected';

export function TimingPanel() {
	const doc = useSubtitleDoc();
	const selection = useSubtitleEditor((state) => state.selection);
	const playhead = usePlayback((state) => state.time);
	const seek = usePlayback((state) => state.seek);
	const apply = useSubtitleEditor((state) => state.apply);
	const [offset, setOffset] = useState(0);
	const [scope, setScope] = useState<Scope>('all');
	const [fromRate, setFromRate] = useState('25');
	const [toRate, setToRate] = useState('23.976');
	const offsetId = useId();
	const scopeId = useId();
	const fromId = useId();
	const toId = useId();
	const firstId = useId();
	const secondId = useId();

	const lines = shownCues(doc);
	const picked = lines.filter((cue) => selection.has(cue.id));
	// Two selected lines are the sync points; otherwise the first and the last.
	const anchors = picked.length === 2 ? picked : [lines[0], lines.at(-1)];
	const [first, second] = anchors;
	const [targets, setTargets] = useState<[number, number] | null>(null);
	const firstTarget = targets?.[0] ?? first?.start ?? 0;
	const secondTarget = targets?.[1] ?? second?.start ?? 0;
	const sync = first && second ? syncPoints([first.start, second.start], [firstTarget, secondTarget]) : null;
	const syncChanges = sync !== null && (Math.abs(sync.scale - 1) > 1e-9 || Math.round(sync.offset) !== 0);

	// New sync points when the lines they come from change.
	useEffect(() => {
		setTargets(null);
	}, [first?.id, second?.id]);

	const ids = scope === 'selected' && selection.size > 0 ? selection : null;
	const rate = (label: string) => FRAME_RATES.find((option) => option.label === label)?.value ?? 25;
	const rateOptions = FRAME_RATES.map((option) => ({ value: option.label, label: `${option.label} fps` }));

	return (
		<>
			<PanelTitle>{m.subs_timing_title()}</PanelTitle>

			<Section title={m.subs_shift()}>
				<FieldRow label={m.subs_shift_by()} htmlFor={offsetId}>
					<OffsetField id={offsetId} value={offset} onChange={setOffset} />
				</FieldRow>
				<FieldRow label={m.subs_apply_to()} htmlFor={scopeId}>
					<Select
						id={scopeId}
						value={selection.size > 0 ? scope : 'all'}
						options={[
							{ value: 'all', label: m.subs_all_lines() },
							{
								value: 'selected',
								label: m.subs_selected_lines({ count: selection.size }),
								disabled: selection.size === 0,
							},
						]}
						onChange={setScope}
					/>
				</FieldRow>
				<Button
					disabled={offset === 0}
					onClick={() => {
						apply((current) => retime(current, 1, offset, ids));
					}}
				>
					{m.subs_shift_apply({ offset: signedSeconds(offset) })}
				</Button>
			</Section>

			{first && second && first.id !== second.id && (
				<Section title={m.subs_sync()}>
					{[
						{ id: firstId, cue: first, target: firstTarget, index: 0 },
						{ id: secondId, cue: second, target: secondTarget, index: 1 },
					].map(({ id, cue, target, index }) => (
						<div key={id} className="grid gap-1.5">
							<p className="text-ui text-ink-2 line-clamp-1">
								<span className="text-muted tabular mr-2 font-mono text-[12px]">
									{formatPreciseTime(cue.start / 1000)}
								</span>
								{cueLabel(cue, doc.format).replace(/\n/g, ' ')}
							</p>
							<FieldRow label={m.subs_should_start()} htmlFor={id}>
								<div className="flex gap-1">
									<TimeField
										id={id}
										value={target / 1000}
										min={0}
										max={Number.MAX_SAFE_INTEGER}
										onCommit={(seconds) => {
											const next: [number, number] = [firstTarget, secondTarget];
											next[index] = Math.round(seconds * 1000);
											setTargets(next);
										}}
									/>
									<IconButton
										label={m.subs_use_playhead()}
										onClick={() => {
											const next: [number, number] = [firstTarget, secondTarget];
											next[index] = Math.round(playhead * 1000);
											setTargets(next);
										}}
									>
										<ArrowDownToLine size={15} />
									</IconButton>
								</div>
							</FieldRow>
						</div>
					))}
					{sync ? (
						<p className="text-small text-muted tabular font-mono">
							{m.subs_sync_result({
								scale: sync.scale.toFixed(5),
								offset: signedSeconds(Math.round(sync.offset)),
							})}
						</p>
					) : (
						<p className="text-small text-danger">{m.subs_sync_invalid()}</p>
					)}
					<Button
						disabled={!syncChanges}
						onClick={() => {
							if (!sync) return;
							apply((current) => retime(current, sync.scale, sync.offset));
							setTargets(null);
						}}
					>
						{m.subs_sync_apply()}
					</Button>
					<button
						type="button"
						className="text-small text-muted hover:text-ink justify-self-start underline-offset-2 hover:underline"
						onClick={() => {
							seek(first.start / 1000);
						}}
					>
						{m.subs_sync_listen()}
					</button>
				</Section>
			)}

			<Section title={m.subs_frame_rate()}>
				<FieldRow label={m.subs_rate_from()} htmlFor={fromId}>
					<Select id={fromId} value={fromRate} options={rateOptions} onChange={setFromRate} />
				</FieldRow>
				<FieldRow label={m.subs_rate_to()} htmlFor={toId}>
					<Select id={toId} value={toRate} options={rateOptions} onChange={setToRate} />
				</FieldRow>
				<Button
					disabled={fromRate === toRate}
					onClick={() => {
						apply((current) => retime(current, rate(fromRate) / rate(toRate), 0));
					}}
				>
					{m.subs_frame_rate_apply({ scale: (rate(fromRate) / rate(toRate)).toFixed(5) })}
				</Button>
			</Section>
		</>
	);
}

function Warning({ children }: { children: string }) {
	return (
		<p className="text-small text-ed-text flex items-start gap-1.5 font-medium">
			<TriangleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none" />
			{children}
		</p>
	);
}

export function SubtitleExportPanel({ opened }: { opened: OpenedFile }) {
	const settings = useSubtitleEditor((state) => state.exportSettings);
	const setExport = useSubtitleEditor((state) => state.setExport);
	const fromVideo = useSubtitleProject((state) => state.source === 'video');
	const intoVideo = fromVideo && settings.target === 'video';
	return (
		<>
			<PanelTitle>{m.subs_export_title()}</PanelTitle>
			{fromVideo && (
				<OptionList
					label={m.subs_export_target()}
					value={settings.target}
					options={[
						{
							value: 'file',
							label: m.subs_export_file(),
							detail: `.${FORMAT_FILES[settings.format].extension}`,
						},
						{ value: 'video', label: m.subs_export_video(), detail: `.${muxContainer(opened.format)}` },
					]}
					onChange={(target) => {
						setExport({ target });
					}}
				/>
			)}
			{intoVideo ? <MuxTracks opened={opened} /> : <SubtitleFileSettings />}
		</>
	);
}

/** Format and character set of an exported subtitle file. */
function SubtitleFileSettings() {
	const doc = useSubtitleDoc();
	const settings = useSubtitleEditor((state) => state.exportSettings);
	const setExport = useSubtitleEditor((state) => state.setExport);
	const dropped = droppedCues(doc, settings.format);
	const losesStyles = doc.format === 'ass' && settings.format !== 'ass';
	return (
		<>
			<Section title={m.export_format()}>
				<OptionList
					label={m.export_format()}
					value={settings.format}
					options={exportFormats(doc).map((format) => ({
						value: format,
						label: FORMAT_FILES[format].label,
						detail: format === doc.format ? m.subs_format_source() : `.${FORMAT_FILES[format].extension}`,
					}))}
					onChange={(format) => {
						setExport({ format });
					}}
				/>
				{losesStyles && <Warning>{m.subs_loses_styles()}</Warning>}
				{dropped > 0 && <Warning>{m.subs_dropped({ count: dropped })}</Warning>}
			</Section>
			{doc.format !== 'pgs' && (
				<dl className="grid gap-3.5">
					<Row label={m.subs_charset()} value={settings.format === 'vtt' ? 'UTF-8' : 'UTF-8 BOM'} />
				</dl>
			)}
		</>
	);
}

export function SubtitleExportFooter({ opened }: { opened: OpenedFile }) {
	const target = useSubtitleEditor((state) => state.exportSettings.target);
	const fromVideo = useSubtitleProject((state) => state.source === 'video');
	if (fromVideo && target === 'video') return <MuxFooter opened={opened} />;
	return <SubtitleFileFooter />;
}

function SubtitleFileFooter() {
	const doc = useSubtitleDoc();
	const settings = useSubtitleEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

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
		setStatus('saving');
		try {
			const format = settings.format;
			const { extension, mime } = FORMAT_FILES[format];
			const name = exportName(extension);
			let blob: Blob;
			if (format === 'pgs') {
				const bytes = await writeSup(doc);
				blob = new Blob([bytes.slice()], { type: mime });
			} else {
				const title = name.replace(/\.[^.]+$/, '');
				const text = writeSubtitles(doc, format, title, usePlayback.getState().details?.video ?? undefined);
				// A byte order mark tells older players and Windows programs the file is UTF-8.
				const bom = format === 'vtt' ? '' : '\ufeff';
				blob = new Blob([bom + text], { type: mime });
			}
			const saved = await saveFile(blob, name);
			setStatus(saved ? 'saved' : 'idle');
		} catch {
			setStatus('failed');
		}
	};

	return (
		<>
			<Button variant="primary" className="h-11" busy={status === 'saving'} onClick={() => void run()}>
				{status === 'saved' ? (
					<>
						<Check size={17} strokeWidth={2.4} aria-hidden="true" />
						{m.saved()}
					</>
				) : (
					m.export_as({ format: FORMAT_FILES[settings.format].label })
				)}
			</Button>
			<ExportAnnounce status={status} />
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.subs_export_failed()}
				</p>
			)}
		</>
	);
}
