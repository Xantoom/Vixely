import { RotateCcw } from 'lucide-react';
import { type ReactNode, useId, useMemo } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { FieldRow, Slider, TimeField } from '@/ui/fields';
import {
	createAudioDoc,
	cut,
	GAIN_RANGE,
	gainToDb,
	keepOnly,
	keptRanges,
	outputDuration,
	restoreCut,
	setFades,
	setGain,
	setTrim,
} from './document';
import type { AudioEngine } from './engine';
import { useAudioDoc, useAudioEditor } from './store';

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

export function TrimPanel() {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const playhead = useAudioEditor((state) => state.playhead);
	const selection = useAudioEditor((state) => state.selection);
	const setSelection = useAudioEditor((state) => state.setSelection);
	const startId = useId();
	const endId = useId();
	const edited = doc.cuts.length > 0 || doc.trim.start > 0 || doc.trim.end < doc.duration;

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
									trim: createAudioDoc(current.duration).trim,
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
				<ValueRow label={m.audio_final_length()} value={formatPreciseTime(outputDuration(doc))} />
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
				<p className="text-small text-muted">{m.trim_hint()}</p>
			</div>

			<Section title={m.selection_title()}>
				{selection ? (
					<>
						<ValueRow label={m.trim_start()} value={formatPreciseTime(selection.start)} />
						<ValueRow label={m.trim_end()} value={formatPreciseTime(selection.end)} />
						<ValueRow
							label={m.selection_length()}
							value={formatPreciseTime(selection.end - selection.start)}
						/>
						<div className="grid grid-cols-2 gap-2">
							<Button
								onClick={() => {
									apply((current) => cut(current, selection));
									setSelection(null);
								}}
							>
								{m.selection_delete()}
							</Button>
							<Button
								onClick={() => {
									apply((current) => keepOnly(current, selection));
									setSelection(null);
								}}
							>
								{m.selection_keep()}
							</Button>
						</div>
					</>
				) : (
					<p className="text-small text-muted">{m.selection_none()}</p>
				)}
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

/** Highest level a peak is raised to by the maximise action, in dBFS: a little headroom for encoders. */
const MAXIMISE_TARGET = -1;

/** Signed decibels with a true minus sign: `+3.0`, `−1.2`, `0.0`. */
function signedDb(db: number): string {
	const rounded = Math.round(db * 10) / 10;
	return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}

function formatDb(db: number): string {
	return `${signedDb(db)} dB`;
}

export function VolumePanel({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const { peaks, version } = engine.waveform;
	const complete = peaks?.complete ?? false;
	const length = outputDuration(doc);
	const fadeMax = Math.max(0.1, Math.min(30, Math.floor(length * 10) / 10));

	// Peak of the kept audio before gain, measured on the waveform once it is fully read.
	const sourcePeak = useMemo(
		() => (peaks && complete ? peaks.peak(keptRanges(doc)) : null),
		// `version` marks new peaks; the ranges only change with trim and cuts.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
		[peaks, complete, version, doc.trim, doc.cuts],
	);
	const peakDb = sourcePeak !== null && sourcePeak > 0 ? gainToDb(sourcePeak) + doc.gain : null;

	return (
		<>
			<PanelTitle>{m.volume_title()}</PanelTitle>

			<div className="grid gap-4">
				<Slider
					label={m.volume_gain()}
					value={doc.gain}
					min={GAIN_RANGE.min}
					max={GAIN_RANGE.max}
					step={0.5}
					format={formatDb}
					hint={m.volume_gain_hint()}
					onChange={(gain) => {
						preview((current) => setGain(current, gain));
					}}
					onEnd={settle}
				/>
				<div className="grid gap-2">
					<ValueRow label={m.volume_peak()} value={peakDb === null ? '–' : `${signedDb(peakDb)} dBFS`} />
					{peakDb === null ? (
						<p className="text-small text-muted">{m.volume_peak_pending()}</p>
					) : (
						peakDb > 0.05 && (
							<p role="status" className="text-small text-danger font-medium">
								{m.volume_clipping({ db: (Math.round(peakDb * 10) / 10).toFixed(1) })}
							</p>
						)
					)}
				</div>
				<div className="grid gap-2">
					<Button
						disabled={peakDb === null}
						onClick={() => {
							if (peakDb !== null)
								apply((current) => setGain(current, current.gain + MAXIMISE_TARGET - peakDb));
						}}
					>
						{m.volume_maximize()}
					</Button>
					<p className="text-small text-muted">{m.volume_maximize_hint()}</p>
				</div>
			</div>

			<Section title={m.fades_title()}>
				<Slider
					label={m.fade_in()}
					value={Math.min(doc.fadeIn, fadeMax)}
					min={0}
					max={fadeMax}
					step={0.1}
					format={(value) => `${value.toFixed(1)} s`}
					onChange={(fadeIn) => {
						preview((current) => setFades(current, { fadeIn }));
					}}
					onEnd={settle}
				/>
				<Slider
					label={m.fade_out()}
					value={Math.min(doc.fadeOut, fadeMax)}
					min={0}
					max={fadeMax}
					step={0.1}
					format={(value) => `${value.toFixed(1)} s`}
					onChange={(fadeOut) => {
						preview((current) => setFades(current, { fadeOut }));
					}}
					onEnd={settle}
				/>
				<p className="text-small text-muted">{m.fades_hint()}</p>
			</Section>
		</>
	);
}
