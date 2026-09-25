import { RotateCcw } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { cut, isShortened, type Kept, keepOnly, outputDuration, restoreCut, setTrim } from '@/document/kept';
import type { Range } from '@/document/timemap';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { FieldRow, TimeField } from '@/ui/fields';
import { PanelTitle } from './EditorLayout';

/** What a timed editor keeps of its source, and what the trim panel needs to change it. */
export interface KeptEditing<T extends Kept> {
	doc: T;
	apply: (change: (doc: T) => T) => void;
	/** Where playback is, in source seconds: the start or the end can be set there. */
	playhead: number;
	/** Passage selected on the timeline, in source seconds. */
	selection: Range | null;
	setSelection: (selection: Range | null) => void;
	/** Name of the output's length: `Final length`, as each editor calls it. */
	lengthLabel: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-3.5">
			<h3 className="text-ui text-ink-2 font-semibold">{title}</h3>
			{children}
		</section>
	);
}

function ValueRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
			<span className="text-ui text-ink-2">{label}</span>
			<span className="tabular font-mono text-[12.5px]">{value}</span>
		</div>
	);
}

/**
 * Start and end of what is kept, the selection (removed, or kept alone) and the removed passages.
 * Shared by the audio and video editors.
 */
export function KeptPanel<T extends Kept>({ editing }: { editing: KeptEditing<T> }) {
	const { doc, apply, playhead, selection, setSelection, lengthLabel } = editing;
	const startId = useId();
	const endId = useId();
	const edited = isShortened(doc);

	return (
		<>
			<PanelTitle
				action={
					edited ? (
						<button
							type="button"
							onClick={() => {
								apply((current) => ({
									...current,
									trim: { start: 0, end: current.duration },
									cuts: [],
								}));
							}}
							className="text-ui text-muted hover:text-ink transition-colors"
						>
							{m.reset()}
						</button>
					) : undefined
				}
			>
				{m.trim_title()}
			</PanelTitle>

			<div className="grid gap-3.5">
				<FieldRow label={m.trim_start()} htmlFor={startId}>
					<TimeField
						id={startId}
						value={doc.trim.start}
						min={0}
						max={doc.duration}
						onCommit={(start) => {
							apply((current) => setTrim(current, { ...current.trim, start }));
						}}
					/>
				</FieldRow>
				<FieldRow label={m.trim_end()} htmlFor={endId}>
					<TimeField
						id={endId}
						value={doc.trim.end}
						min={0}
						max={doc.duration}
						onCommit={(end) => {
							apply((current) => setTrim(current, { ...current.trim, end }));
						}}
					/>
				</FieldRow>
				<ValueRow label={lengthLabel} value={formatPreciseTime(outputDuration(doc))} />
				<div className="grid grid-cols-2 gap-2">
					<Button
						title="I"
						onClick={() => {
							apply((current) => setTrim(current, { ...current.trim, start: playhead }));
						}}
					>
						{m.trim_start_here()}
					</Button>
					<Button
						title="O"
						onClick={() => {
							apply((current) => setTrim(current, { ...current.trim, end: playhead }));
						}}
					>
						{m.trim_end_here()}
					</Button>
				</div>
			</div>

			<Section title={m.selection_title()}>
				<ValueRow label={m.trim_start()} value={selection ? formatPreciseTime(selection.start) : '–'} />
				<ValueRow label={m.trim_end()} value={selection ? formatPreciseTime(selection.end) : '–'} />
				<ValueRow
					label={m.selection_length()}
					value={selection ? formatPreciseTime(selection.end - selection.start) : '–'}
				/>
				{/* Always there, greyed until a passage is selected on the timeline. */}
				<div className="grid grid-cols-2 gap-2">
					<Button
						disabled={!selection}
						onClick={() => {
							if (!selection) return;
							apply((current) => cut(current, selection));
							setSelection(null);
						}}
					>
						{m.selection_delete()}
					</Button>
					<Button
						disabled={!selection}
						onClick={() => {
							if (!selection) return;
							apply((current) => keepOnly(current, selection));
							setSelection(null);
						}}
					>
						{m.selection_keep()}
					</Button>
				</div>
			</Section>

			{doc.cuts.length > 0 && (
				<Section title={m.removed_title()}>
					<ul className="-mt-1 grid">
						{doc.cuts.map((removed, index) => (
							<li
								key={`${removed.start}-${removed.end}`}
								className="border-line flex items-center justify-between gap-3 border-b py-1 last:border-b-0"
							>
								<span className="tabular font-mono text-[12.5px]">
									{formatPreciseTime(removed.start)} → {formatPreciseTime(removed.end)}
								</span>
								<IconButton
									label={m.removed_restore_label({
										start: formatPreciseTime(removed.start),
										end: formatPreciseTime(removed.end),
									})}
									onClick={() => {
										apply((current) => restoreCut(current, index));
									}}
								>
									<RotateCcw size={15} />
								</IconButton>
							</li>
						))}
					</ul>
				</Section>
			)}
		</>
	);
}
