import { LocateFixed, RotateCcw } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { isShortened, type Kept, restoreCut, setTrim } from '@/document/kept';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { TimeField } from '@/ui/fields';
import { PanelTitle } from './EditorLayout';
import { ResetButton } from './panel-parts';

/** What a timed editor keeps of its source, and what the trim panel needs to change it. */
export interface KeptEditing<T extends Kept> {
	doc: T;
	apply: (change: (doc: T) => T) => void;
	/**
	 * Where playback is, in source seconds: the start or the end can be set there. Read when a
	 * button is pressed, so the panel doesn't draw again on every frame of playback.
	 */
	playhead: () => number;
	/** More settings under the trim, such as a video's speed and fades. */
	extra?: ReactNode;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-3.5">
			<h3 className="text-ui font-semibold">{title}</h3>
			{children}
		</section>
	);
}

/** The start or the end of what is kept, typed or set where playback is. */
export function TrimRow({
	label,
	value,
	max,
	hereLabel,
	onCommit,
	onHere,
}: {
	label: string;
	value: number;
	max: number;
	hereLabel: string;
	onCommit: (time: number) => void;
	onHere: () => void;
}) {
	const id = useId();
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-center gap-2">
			<label htmlFor={id} className="text-ui text-ink-2">
				{label}
			</label>
			<TimeField id={id} value={value} min={0} max={max} onCommit={onCommit} />
			<IconButton label={hereLabel} onClick={onHere} className="-mr-2">
				<LocateFixed className="size-[1.1rem]" />
			</IconButton>
		</div>
	);
}

/**
 * Start and end of what is kept, and the passages removed. A passage selected on the timeline is
 * removed or kept alone from the bar above it.
 * Shared by the audio and video editors.
 */
export function KeptPanel<T extends Kept>({ editing }: { editing: KeptEditing<T> }) {
	const { doc, apply, playhead } = editing;
	const edited = isShortened(doc);

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={!edited}
						onClick={() => {
							apply((current) => ({ ...current, trim: { start: 0, end: current.duration }, cuts: [] }));
						}}
					/>
				}
			>
				{m.trim_title()}
			</PanelTitle>

			<div className="grid gap-3">
				<TrimRow
					label={m.trim_start()}
					value={doc.trim.start}
					max={doc.duration}
					hereLabel={m.trim_start_here()}
					onCommit={(start) => {
						apply((current) => setTrim(current, { ...current.trim, start }));
					}}
					onHere={() => {
						apply((current) => setTrim(current, { ...current.trim, start: playhead() }));
					}}
				/>
				<TrimRow
					label={m.trim_end()}
					value={doc.trim.end}
					max={doc.duration}
					hereLabel={m.trim_end_here()}
					onCommit={(end) => {
						apply((current) => setTrim(current, { ...current.trim, end }));
					}}
					onHere={() => {
						apply((current) => setTrim(current, { ...current.trim, end: playhead() }));
					}}
				/>
			</div>

			{doc.cuts.length > 0 && (
				<Section title={m.removed_title()}>
					<ul className="-mt-1 grid">
						{doc.cuts.map((removed, index) => (
							<li
								key={`${removed.start}-${removed.end}`}
								className="border-line flex items-center justify-between gap-3 border-b py-1 last:border-b-0"
							>
								<span className="tabular text-small">
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
			{editing.extra}
		</>
	);
}
