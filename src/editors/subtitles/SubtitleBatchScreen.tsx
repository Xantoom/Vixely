import { ArrowRight, Check, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ItemStatus } from '@/editor/BatchList';
import { EditorLayout, PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { formatPreciseTime } from '@/lib/format';
import { openFileDestination } from '@/media/file-destination';
import { isPickerCancel } from '@/media/save';
import { type BatchFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select } from '@/ui/fields';
import {
	applyTiming,
	exportSubtitleBatch,
	firstStart,
	outputFormat,
	type RateLabel,
	type ReadFile,
	readSubtitleFile,
	useSubtitleBatch,
} from './batch';
import { FRAME_RATES, shownCues } from './document';
import { FORMAT_FILES } from './formats';
import { OffsetField } from './panels';

/** Every file of the batch read once, as they are added. */
function useReadFiles(batch: readonly BatchFile[]): ReadonlyMap<number, ReadFile> {
	const [read, setRead] = useState<ReadonlyMap<number, ReadFile>>(new Map());
	const requested = useRef(new Set<number>());
	useEffect(() => {
		for (const item of batch) {
			if (requested.current.has(item.id)) continue;
			requested.current.add(item.id);
			void readSubtitleFile(item.file, item.format).then((result) => {
				setRead((current) => new Map(current).set(item.id, result));
			});
		}
	}, [batch]);
	return read;
}

function StatusMark({ status }: { status: ItemStatus | undefined }) {
	if (status === 'working') return <span className="bg-ed size-2 animate-pulse rounded-full" aria-hidden="true" />;
	if (status === 'done') return <Check size={14} strokeWidth={2.6} className="text-ed-text" aria-hidden="true" />;
	if (status === 'failed') return <X size={14} strokeWidth={2.6} className="text-danger" aria-hidden="true" />;
	return null;
}

/** The files, as a table: what each one is, and what it becomes with the settings on the right. */
function BatchTable({
	batch,
	read,
	statuses,
	locked,
}: {
	batch: readonly BatchFile[];
	read: ReadonlyMap<number, ReadFile>;
	statuses: ReadonlyMap<number, ItemStatus>;
	locked: boolean;
}) {
	const settings = useSubtitleBatch();
	const remove = useSession((state) => state.removeFromBatch);
	const add = useSession((state) => state.addToBatch);
	const inputRef = useRef<HTMLInputElement>(null);
	const columns = 'minmax(0,1fr) 128px 96px 208px 24px 28px';
	return (
		<div className="flex h-full min-h-0 flex-col gap-3 p-3">
			<div className="flex items-center justify-between gap-3">
				<span className="text-ui font-semibold">{m.batch_count_subtitles({ count: batch.length })}</span>
				<button
					type="button"
					disabled={locked}
					onClick={() => inputRef.current?.click()}
					className="text-ui text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink flex h-8 items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors disabled:opacity-40"
				>
					<Plus size={15} aria-hidden="true" />
					{m.batch_add_audio()}
				</button>
				<input
					ref={inputRef}
					type="file"
					accept=".srt,.vtt,.ass,.ssa,.sup"
					multiple
					className="hidden"
					tabIndex={-1}
					onChange={(event) => {
						void add([...(event.target.files ?? [])]);
						event.target.value = '';
					}}
				/>
			</div>
			<div
				role="table"
				aria-label={m.batch_label()}
				className="bg-bg min-h-0 flex-1 overflow-auto rounded-xs shadow-[inset_0_0_0_1px_var(--line)]"
			>
				<div
					role="row"
					className="bg-surface border-line text-caption text-muted sticky top-0 grid h-7 items-center border-b font-medium"
					style={{ gridTemplateColumns: columns }}
				>
					{[m.info_file(), m.info_format(), m.subs_lines(), m.subs_first_line(), '', ''].map(
						(label, index) => (
							<span key={index} role="columnheader" className="truncate px-2">
								{label}
							</span>
						),
					)}
				</div>
				{batch.map((item) => {
					const { doc } = read.get(item.id) ?? { doc: undefined };
					const after = doc ? applyTiming(doc, settings) : null;
					const from = doc ? firstStart(doc) : null;
					const to = after ? firstStart(after) : null;
					const source = doc ? FORMAT_FILES[doc.format].label : item.format.toUpperCase();
					const target = doc ? FORMAT_FILES[outputFormat(doc, settings)].label : '';
					return (
						<div
							key={item.id}
							role="row"
							className="border-line/60 grid h-8 items-center border-b text-[12.5px]"
							style={{ gridTemplateColumns: columns }}
						>
							<span role="cell" className="truncate px-2" title={item.file.name}>
								{item.file.name}
							</span>
							<span role="cell" className="text-muted flex items-center gap-1 px-2 font-mono">
								{source}
								{target && target !== source && (
									<>
										<ArrowRight size={12} aria-hidden="true" />
										<span className="text-ed-text">{target}</span>
									</>
								)}
							</span>
							<span role="cell" className="tabular px-2 font-mono">
								{doc ? shownCues(doc).length : doc === null ? '–' : ''}
							</span>
							<span role="cell" className="tabular flex items-center gap-1 px-2 font-mono">
								{from !== null && (
									<>
										{formatPreciseTime(from / 1000)}
										{to !== from && to !== null && (
											<>
												<ArrowRight size={12} aria-hidden="true" className="text-muted" />
												<span className="text-ed-text">{formatPreciseTime(to / 1000)}</span>
											</>
										)}
									</>
								)}
								{doc === null && (
									<span className="text-danger font-sans" title={m.subs_unreadable()}>
										<X size={14} aria-label={m.subs_unreadable()} />
									</span>
								)}
							</span>
							<span role="cell" className="grid place-items-center">
								<StatusMark status={statuses.get(item.id)} />
							</span>
							<span role="cell" className="grid place-items-center">
								{!locked && batch.length > 1 && (
									<button
										type="button"
										aria-label={m.batch_remove({ name: item.file.name })}
										title={m.batch_remove({ name: item.file.name })}
										onClick={() => {
											remove(item.id);
										}}
										className="text-muted hover:text-ink hover:bg-surface grid size-6 place-items-center rounded-xs"
									>
										<X size={13} />
									</button>
								)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

const RATE_OPTIONS = FRAME_RATES.map((option) => ({ value: option.label, label: `${option.label} fps` }));

/** Shift, frame rate and format, shared by every file of the batch. */
function BatchPanel() {
	const settings = useSubtitleBatch();
	const offsetId = useId();
	const fromId = useId();
	const toId = useId();
	return (
		<>
			<PanelTitle>{m.subs_batch_title()}</PanelTitle>
			<Section title={m.subs_shift()}>
				<FieldRow label={m.subs_shift_by()} htmlFor={offsetId}>
					<OffsetField
						id={offsetId}
						value={settings.shift}
						onChange={(shift) => {
							settings.set({ shift });
						}}
					/>
				</FieldRow>
			</Section>
			<Section title={m.subs_frame_rate()}>
				<FieldRow label={m.subs_rate_from()} htmlFor={fromId}>
					<Select
						id={fromId}
						value={settings.fromRate}
						options={RATE_OPTIONS}
						onChange={(fromRate: RateLabel) => {
							settings.set({ fromRate });
						}}
					/>
				</FieldRow>
				<FieldRow label={m.subs_rate_to()} htmlFor={toId}>
					<Select
						id={toId}
						value={settings.toRate}
						options={RATE_OPTIONS}
						onChange={(toRate: RateLabel) => {
							settings.set({ toRate });
						}}
					/>
				</FieldRow>
			</Section>
			<Section title={m.export_format()}>
				<OptionList
					label={m.export_format()}
					value={settings.format}
					options={[
						{ value: 'source', label: m.encoding_copy() },
						...(['srt', 'vtt', 'ass'] as const).map((format) => ({
							value: format,
							label: FORMAT_FILES[format].label,
							detail: `.${FORMAT_FILES[format].extension}`,
						})),
					]}
					onChange={(format) => {
						settings.set({ format });
					}}
				/>
			</Section>
		</>
	);
}

/**
 * Several subtitle files at once, as Subtitle Edit's batch convert: shifted, moved to another frame
 * rate and written in one format, into a folder (or a ZIP where the browser can't write folders).
 */
export function SubtitleBatchScreen({ batch }: { batch: readonly BatchFile[] }) {
	const read = useReadFiles(batch);
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [written, setWritten] = useState(0);
	const abort = useRef<AbortController | null>(null);
	const ready = batch.every((item) => read.has(item.id));

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
		let destination;
		try {
			destination = await openFileDestination('videos', 'subtitles.zip');
		} catch (error) {
			if (isPickerCancel(error)) return;
			throw error;
		}
		const controller = new AbortController();
		abort.current = controller;
		setStatuses(new Map());
		setStatus('saving');
		try {
			const count = await exportSubtitleBatch({
				items: batch.map((item) => ({
					id: item.id,
					file: item.file,
					read: read.get(item.id) ?? { doc: null },
				})),
				settings: useSubtitleBatch.getState(),
				destination,
				signal: controller.signal,
				onStatus: (id, next) => {
					setStatuses((current) => new Map(current).set(id, next));
				},
			});
			setWritten(count);
			setStatus(count > 0 ? 'saved' : 'failed');
		} catch {
			setStatus('failed');
		} finally {
			abort.current = null;
		}
	};

	return (
		<EditorLayout
			kind="subtitles"
			tool="export"
			tools={['export']}
			onTool={() => {}}
			actions={{
				canUndo: false,
				canRedo: false,
				onUndo: () => {},
				onRedo: () => {},
				onExport: ready && status !== 'saving' ? () => void run() : undefined,
				exportActive: true,
			}}
			workspace={<BatchTable batch={batch} read={read} statuses={statuses} locked={status === 'saving'} />}
			inspector={<BatchPanel />}
			inspectorFooter={
				<>
					<Button
						variant="primary"
						className="h-11"
						disabled={!ready || status === 'saving'}
						onClick={() => void run()}
					>
						{status === 'saved' ? (
							<>
								<Check size={17} strokeWidth={2.4} aria-hidden="true" />
								{m.batch_saved_audio({ count: written })}
							</>
						) : (
							m.export_batch_audio_button({ count: batch.length })
						)}
					</Button>
					{status === 'failed' && (
						<p role="alert" className="text-small text-danger">
							{m.subs_export_failed()}
						</p>
					)}
				</>
			}
		/>
	);
}
