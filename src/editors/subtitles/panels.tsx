import { ArrowDownToLine, Check, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { saveFile } from '@/editors/image/export';
import { formatBytes, formatPreciseTime } from '@/lib/format';
import { outputName } from '@/media/save';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { FieldRow, OptionList, Select, TimeField } from '@/ui/fields';
import {
	type Cue,
	FRAME_RATES,
	findCue,
	lastEnd,
	MIN_CUE,
	removeCues,
	retime,
	setCueTimes,
	shownCues,
	type SubtitleFormat,
	syncPoints,
	updateCue,
} from './document';
import type { SubtitleEngine } from './engine';
import { droppedCues, FORMAT_FILES, writeSubtitles } from './formats';
import { ENCODINGS, type EncodingId } from './formats/encoding';
import { plainText } from './formats/markup';
import { useSubtitleDoc, useSubtitleEditor } from './store';
import { ChooseMedia } from './SubtitleViewer';

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

export function SubtitleInfoPanel({ opened, engine }: { opened: OpenedFile; engine: SubtitleEngine }) {
	const doc = useSubtitleDoc();
	const encoding = useSubtitleEditor((state) => state.encoding);
	const encodingId = useId();
	const details = engine.media?.details;
	const count = doc.cues.filter((cue) => !cue.comment).length;
	return (
		<>
			<PanelTitle>{m.info_file()}</PanelTitle>
			<dl className="grid gap-3.5">
				<Row label={m.info_format()} value={formatLabel(doc.format, doc.ass?.scriptType)} />
				<Row label={m.info_size()} value={formatBytes(opened.file.size)} />
				<Row label={m.subs_lines()} value={String(count)} />
				<Row label={m.subs_last_line()} value={formatPreciseTime(lastEnd(doc) / 1000)} />
				{doc.ass?.playRes && (
					<Row label={m.subs_play_res()} value={`${doc.ass.playRes.width} × ${doc.ass.playRes.height}`} />
				)}
				{doc.ass && doc.ass.styles.length > 0 && (
					<Row label={m.subs_styles()} value={String(doc.ass.styles.length)} />
				)}
			</dl>
			<Section title={m.subs_charset()}>
				<div className="grid gap-1.5">
					<label htmlFor={encodingId} className="text-ui text-ink-2">
						{m.subs_charset_read()}
					</label>
					<Select
						id={encodingId}
						value={encoding}
						options={ENCODINGS.map((option) => ({ value: option.id, label: option.label }))}
						onChange={(value: EncodingId) => {
							engine.setEncoding(value);
						}}
					/>
				</div>
				<p className="text-small text-muted">{m.subs_charset_hint()}</p>
			</Section>
			<Section title={m.subs_preview_media()}>
				<ChooseMedia engine={engine} />
				{details && (
					<dl className="grid gap-3.5">
						<Row label={m.info_duration()} value={formatPreciseTime(details.duration)} />
						{details.video && (
							<Row
								label={m.info_resolution()}
								value={`${details.video.width} × ${details.video.height}`}
							/>
						)}
					</dl>
				)}
				<p className="text-small text-muted">{m.subs_preview_media_hint()}</p>
			</Section>
		</>
	);
}

/** Characters shown per second: above about 20, most people can't finish reading. */
function readingSpeed(cue: Cue, format: SubtitleFormat): number {
	const characters = plainText(cue.text, format)
		.replace(/\s*\n\s*/g, ' ')
		.trim().length;
	return characters / Math.max(0.001, (cue.end - cue.start) / 1000);
}

/** The selected line: its times, its text, its style. */
function LineEditor({ cue, index, total }: { cue: Cue; index: number; total: number }) {
	const doc = useSubtitleDoc();
	const playhead = useSubtitleEditor((state) => state.playhead);
	const apply = useSubtitleEditor((state) => state.apply);
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const select = useSubtitleEditor((state) => state.select);
	const startId = useId();
	const endId = useId();
	const styleId = useId();
	const textId = useId();
	const speed = readingSpeed(cue, doc.format);
	const setStart = (seconds: number) => {
		apply((current) => setCueTimes(current, cue.id, seconds * 1000, Math.max(cue.end, seconds * 1000 + MIN_CUE)));
	};
	const setEnd = (seconds: number) => {
		apply((current) => setCueTimes(current, cue.id, cue.start, seconds * 1000));
	};

	return (
		<section className="grid gap-3.5" aria-label={m.subs_line_editor()}>
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-ui text-ink-2 font-semibold">{m.subs_line_of({ index: index + 1, total })}</h3>
				<IconButton
					label={m.subs_delete_line()}
					onClick={() => {
						apply((current) => removeCues(current, new Set([cue.id])));
						select([]);
					}}
				>
					<Trash2 size={16} />
				</IconButton>
			</div>
			<FieldRow label={m.trim_start()} htmlFor={startId}>
				<div className="flex gap-1">
					<TimeField
						id={startId}
						value={cue.start / 1000}
						min={0}
						max={Number.MAX_SAFE_INTEGER}
						onCommit={setStart}
					/>
					<IconButton
						label={m.subs_start_here()}
						onClick={() => {
							setStart(playhead);
						}}
					>
						<ArrowDownToLine size={15} />
					</IconButton>
				</div>
			</FieldRow>
			<FieldRow label={m.trim_end()} htmlFor={endId}>
				<div className="flex gap-1">
					<TimeField
						id={endId}
						value={cue.end / 1000}
						min={(cue.start + MIN_CUE) / 1000}
						max={Number.MAX_SAFE_INTEGER}
						onCommit={setEnd}
					/>
					<IconButton
						label={m.subs_end_here()}
						onClick={() => {
							setEnd(Math.max(playhead, (cue.start + MIN_CUE) / 1000));
						}}
					>
						<ArrowDownToLine size={15} />
					</IconButton>
				</div>
			</FieldRow>
			<dl className="grid gap-2">
				<Row label={m.info_duration()} value={`${((cue.end - cue.start) / 1000).toFixed(3)} s`} />
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
					<dt className="text-ink-2">{m.subs_reading_speed()}</dt>
					<dd className={`tabular font-mono text-[12.5px] ${speed > 20 ? 'text-danger' : ''}`}>
						{m.subs_cps({ value: speed.toFixed(1) })}
					</dd>
				</div>
			</dl>
			{speed > 20 && <p className="text-small text-danger -mt-1">{m.subs_reading_fast()}</p>}
			{doc.ass && doc.ass.styles.length > 0 && (
				<FieldRow label={m.subs_style()} htmlFor={styleId}>
					<Select
						id={styleId}
						value={cue.fields?.style ?? 'Default'}
						options={[...new Set([...doc.ass.styles, cue.fields?.style ?? 'Default'])].map((style) => ({
							value: style,
							label: style,
						}))}
						onChange={(style) => {
							apply((current) => updateCue(current, cue.id, { fields: { ...cue.fields, style } }));
						}}
					/>
				</FieldRow>
			)}
			<div className="grid gap-1.5">
				<label htmlFor={textId} className="text-ui text-ink-2">
					{m.subs_text()}
				</label>
				<textarea
					id={textId}
					value={cue.text}
					rows={3}
					spellCheck
					onChange={(event) => {
						const text = event.target.value;
						// Typing is previewed at once and becomes one undo step when the field is left.
						preview((current) => updateCue(current, cue.id, { text }));
					}}
					onBlur={settle}
					className="border-line-2 bg-bg text-body text-ink hover:border-muted w-full resize-y rounded-xs border px-2.5 py-2 transition-colors"
				/>
				<p className="text-small text-muted">
					{doc.format === 'ass' ? m.subs_markup_ass() : m.subs_markup_html()}
				</p>
			</div>
		</section>
	);
}

/** Id of the line showing at the playhead, so the list can mark it without redrawing every frame. */
function useCurrentLine(): number | null {
	return useSubtitleEditor((state) => {
		const time = state.playhead * 1000;
		return (
			state.history.present.cues.find((cue) => !cue.comment && cue.start <= time && time < cue.end)?.id ?? null
		);
	});
}

export function LinesPanel({ engine }: { engine: SubtitleEngine }) {
	const doc = useSubtitleDoc();
	const active = useSubtitleEditor((state) => state.active);
	const selection = useSubtitleEditor((state) => state.selection);
	const select = useSubtitleEditor((state) => state.select);
	const current = useCurrentLine();
	const listRef = useRef<HTMLOListElement>(null);
	const lines = shownCues(doc);
	const activeCue = active === null ? undefined : findCue(doc, active);
	const activeIndex = activeCue ? lines.findIndex((cue) => cue.id === activeCue.id) : -1;

	// The line picked on the timeline scrolls into view.
	useEffect(() => {
		if (active === null) return;
		listRef.current?.querySelector(`[data-cue="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [active]);

	return (
		<>
			<PanelTitle>{m.subs_lines_title()}</PanelTitle>
			{activeCue && !activeCue.comment ? (
				<LineEditor cue={activeCue} index={activeIndex} total={lines.length} />
			) : (
				<p className="text-ui text-muted -mt-3">{m.subs_lines_hint()}</p>
			)}
			<ol ref={listRef} className="-mx-2 grid gap-px" aria-label={m.subs_lines()}>
				{lines.map((cue) => {
					const selected = selection.has(cue.id);
					return (
						<li
							key={cue.id}
							data-cue={cue.id}
							className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]"
						>
							<button
								type="button"
								aria-pressed={selected}
								onClick={(event) => {
									if (event.ctrlKey || event.metaKey) {
										const next = new Set(selection);
										if (next.has(cue.id)) next.delete(cue.id);
										else next.add(cue.id);
										select(next);
										return;
									}
									select([cue.id]);
									engine.seek(cue.start / 1000);
								}}
								className={`grid w-full gap-0.5 rounded-xs px-2 py-1.5 text-left transition-colors ${
									selected ? 'bg-ed-soft' : 'hover:bg-surface'
								} ${cue.id === current ? 'shadow-[inset_2px_0_0_var(--ed)]' : ''}`}
							>
								<span className="text-caption text-muted tabular font-mono">
									{formatPreciseTime(cue.start / 1000)} → {formatPreciseTime(cue.end / 1000)}
								</span>
								<span className="text-ui line-clamp-2 break-words whitespace-pre-line">
									{plainText(cue.text, doc.format) || '–'}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</>
	);
}

/** `+1.500 s`, `−0.250 s`: a shift, with a true minus sign. */
function signedSeconds(milliseconds: number): string {
	const sign = milliseconds > 0 ? '+' : milliseconds < 0 ? '\u2212' : '';
	return `${sign}${(Math.abs(milliseconds) / 1000).toFixed(3)} s`;
}

/** Signed seconds, typed as `-1.5`, `+0,250` or `2`. */
function OffsetField({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
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

export function TimingPanel({ engine }: { engine: SubtitleEngine }) {
	const doc = useSubtitleDoc();
	const selection = useSubtitleEditor((state) => state.selection);
	const playhead = useSubtitleEditor((state) => state.playhead);
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
			<p className="text-ui text-muted -mt-3">{m.subs_timing_hint()}</p>

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
				<p className="text-small text-muted">{m.subs_shift_hint()}</p>
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
					<p className="text-small text-muted -mt-1">
						{picked.length === 2 ? m.subs_sync_hint_selected() : m.subs_sync_hint()}
					</p>
					{[
						{ id: firstId, cue: first, target: firstTarget, index: 0 },
						{ id: secondId, cue: second, target: secondTarget, index: 1 },
					].map(({ id, cue, target, index }) => (
						<div key={id} className="grid gap-1.5">
							<p className="text-ui text-ink-2 line-clamp-1">
								<span className="text-muted tabular mr-2 font-mono text-[12px]">
									{formatPreciseTime(cue.start / 1000)}
								</span>
								{plainText(cue.text, doc.format).replace(/\n/g, ' ')}
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
							engine.seek(first.start / 1000);
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
				<p className="text-small text-muted">{m.subs_frame_rate_hint()}</p>
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

const FORMAT_HINTS: Record<SubtitleFormat, () => string> = {
	srt: () => m.subs_format_srt(),
	vtt: () => m.subs_format_vtt(),
	ass: () => m.subs_format_ass(),
};

export function SubtitleExportPanel() {
	const doc = useSubtitleDoc();
	const settings = useSubtitleEditor((state) => state.exportSettings);
	const setExport = useSubtitleEditor((state) => state.setExport);
	const dropped = droppedCues(doc, settings.format);
	const losesStyles = doc.format === 'ass' && settings.format !== 'ass';
	return (
		<>
			<PanelTitle>{m.subs_export_title()}</PanelTitle>
			<Section title={m.export_format()}>
				<OptionList
					label={m.export_format()}
					value={settings.format}
					options={(['srt', 'vtt', 'ass'] as const).map((format) => ({
						value: format,
						label: FORMAT_FILES[format].label,
						detail: format === doc.format ? m.subs_format_source() : `.${FORMAT_FILES[format].extension}`,
					}))}
					onChange={(format) => {
						setExport({ format });
					}}
				/>
				<p className="text-small text-muted">{FORMAT_HINTS[settings.format]()}</p>
				{losesStyles && <p className="text-small text-ed-text font-medium">{m.subs_loses_styles()}</p>}
				{dropped > 0 && (
					<p className="text-small text-ed-text font-medium">{m.subs_dropped({ count: dropped })}</p>
				)}
				{doc.format !== 'ass' && settings.format === 'ass' && (
					<p className="text-small text-muted">{m.subs_to_ass_hint()}</p>
				)}
			</Section>
			<Section title={m.subs_charset()}>
				<p className="text-small text-muted -mt-1">{m.subs_utf8()}</p>
			</Section>
		</>
	);
}

export function SubtitleExportFooter({ file, engine }: { file: File; engine: SubtitleEngine }) {
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
			const { extension, mime } = FORMAT_FILES[settings.format];
			const title = file.name.replace(/\.[^.]+$/, '');
			const text = writeSubtitles(doc, settings.format, title, engine.media?.details?.video ?? undefined);
			// A byte order mark tells older players and Windows programs the file is UTF-8.
			const bom = settings.format === 'vtt' ? '' : '\ufeff';
			const saved = await saveFile(new Blob([bom + text], { type: mime }), outputName(file.name, extension));
			setStatus(saved ? 'saved' : 'idle');
		} catch {
			setStatus('failed');
		}
	};

	return (
		<>
			<Button variant="primary" className="h-11" disabled={status === 'saving'} onClick={() => void run()}>
				{status === 'saved' ? (
					<>
						<Check size={17} strokeWidth={2.4} aria-hidden="true" />
						{m.saved()}
					</>
				) : (
					m.export_as({ format: FORMAT_FILES[settings.format].label })
				)}
			</Button>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.subs_export_failed()}
				</p>
			)}
		</>
	);
}
