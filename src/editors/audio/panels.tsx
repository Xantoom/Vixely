import { Scissors } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { KeptPanel } from '@/editor/KeptPanel';
import { Group, ResetButton } from '@/editor/panel-parts';
import { decimal, formatDb, formatPreciseTime, signedDb } from '@/lib/format';
import { EQ_BANDS, EQ_PRESET_IDS, EQ_PRESETS, EQ_RANGE, type EqPresetId, FLAT_EQ, responseAt } from '@/media/sound';
import { PITCH_RANGE } from '@/media/stretch';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button } from '@/ui/Button';
import { OptionList, Slider } from '@/ui/fields';
import {
	AUDIO_SPEEDS,
	audioLength,
	compressOf,
	GAIN_RANGE,
	normalizationGain,
	pitchOf,
	removeSilences,
	setFades,
	setGain,
	speedOf,
	TRUE_PEAK_CEILING,
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

export function TrimPanel({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const playhead = useAudioEditor((state) => state.playhead);
	return (
		<KeptPanel
			editing={{
				doc,
				apply,
				playhead,
				lengthLabel: m.audio_final_length(),
				length: audioLength(doc),
				extra: <SilenceSection engine={engine} />,
			}}
		/>
	);
}

/** Loudness under which sound counts as silence, in dBFS, and how long it must last, in seconds. */
const SILENCE_DEFAULTS = { threshold: -40, shortest: 0.8 };

/** Quiet stretches found in the waveform, cut in one go; each cut can then be restored. */
function SilenceSection({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const [threshold, setThreshold] = useState(SILENCE_DEFAULTS.threshold);
	const [shortest, setShortest] = useState(SILENCE_DEFAULTS.shortest);
	const { loudness, peaks } = engine.waveform;
	const ready = Boolean(loudness && peaks?.complete);
	const found = useMemo(
		() => (ready && loudness ? removeSilences(doc, loudness.quietSpans(threshold, shortest)) : null),
		// The waveform's version tells when its reading is complete.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
		[ready, loudness, doc, threshold, shortest, engine.waveform.version],
	);
	return (
		<Group
			title={m.silence_title()}
			changed={threshold !== SILENCE_DEFAULTS.threshold || shortest !== SILENCE_DEFAULTS.shortest}
			onReset={() => {
				setThreshold(SILENCE_DEFAULTS.threshold);
				setShortest(SILENCE_DEFAULTS.shortest);
			}}
		>
			<Slider
				label={m.silence_threshold()}
				value={threshold}
				min={-70}
				max={-20}
				defaultValue={SILENCE_DEFAULTS.threshold}
				format={(value) => `${value} dB`}
				onChange={setThreshold}
				onEnd={() => {}}
			/>
			<Slider
				label={m.silence_shortest()}
				value={Math.round(shortest * 10)}
				min={2}
				max={50}
				defaultValue={SILENCE_DEFAULTS.shortest * 10}
				format={(tenths) => `${decimal(tenths / 10, 1)} s`}
				onChange={(tenths) => {
					setShortest(tenths / 10);
				}}
				onEnd={() => {}}
			/>
			<Button
				disabled={!found || found.count === 0}
				onClick={() => {
					if (found && found.count > 0) apply(() => found.doc);
				}}
			>
				<Scissors className="size-4.5" aria-hidden="true" />
				{found && found.count === 0 ? m.silence_none() : m.silence_remove({ count: found?.count ?? 0 })}
			</Button>
		</Group>
	);
}

/** Loudness targets of the places audio ends up, in LUFS. */
const TARGETS: { value: number; name: () => string }[] = [
	{ value: -14, name: () => m.level_music() },
	{ value: -16, name: () => m.level_podcast() },
	{ value: -23, name: () => m.level_broadcast() },
];

export function VolumePanel({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const { reading } = engine;
	const length = audioLength(doc);
	const fadeMax = Math.max(0.1, Math.min(30, Math.floor(length * 10) / 10));
	const normalization = doc.normalize !== null && reading ? normalizationGain(doc.normalize, reading) : null;
	// What the export will measure: the reading taken without gain, moved by the gain applied.
	const gain = engine.resolved.gain;
	const integrated = reading && Number.isFinite(reading.integrated) ? reading.integrated + gain : null;
	const truePeak = reading && Number.isFinite(reading.truePeak) ? reading.truePeak + gain : null;

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={
							doc.gain === 0 &&
							doc.normalize === null &&
							compressOf(doc) === 0 &&
							doc.fadeIn === 0 &&
							doc.fadeOut === 0
						}
						onClick={() => {
							apply((current) => ({
								...current,
								gain: 0,
								normalize: null,
								compress: 0,
								fadeIn: 0,
								fadeOut: 0,
							}));
						}}
					/>
				}
			>
				{m.volume_title()}
			</PanelTitle>

			<Section title={m.level_title()}>
				<OptionList
					label={m.level_title()}
					value={doc.normalize === null ? 'off' : String(doc.normalize)}
					options={[
						{ value: 'off', label: m.level_as_is() },
						...TARGETS.map((option) => ({
							value: String(option.value),
							label: option.name(),
							detail: `${signedDb(option.value).replace(/[.,]0$/, '')} LUFS`,
						})),
					]}
					onChange={(value) => {
						apply((current) => ({ ...current, normalize: value === 'off' ? null : Number(value) }));
					}}
				/>
				{normalization?.limited && integrated !== null && (
					<p role="status" className="text-small text-ed-text font-medium">
						{m.normalize_limited({ lufs: signedDb(integrated) })}
					</p>
				)}
				{doc.normalize === null ? (
					<Slider
						label={m.volume_gain()}
						value={doc.gain}
						min={GAIN_RANGE.min}
						max={GAIN_RANGE.max}
						step={0.5}
						defaultValue={0}
						format={formatDb}
						onChange={(value) => {
							preview((current) => setGain(current, value));
						}}
						onEnd={settle}
					/>
				) : (
					<ValueRow label={m.volume_gain()} value={reading ? formatDb(gain) : '–'} />
				)}
				<Slider
					label={m.compress_label()}
					value={Math.round(compressOf(doc) * 100)}
					min={0}
					max={100}
					defaultValue={0}
					format={(value) => (value === 0 ? m.denoise_off() : `${value} %`)}
					onChange={(value) => {
						preview((current) => ({ ...current, compress: value / 100 }));
					}}
					onEnd={settle}
				/>
			</Section>

			<div className="grid gap-2">
				<ValueRow
					label={m.loudness_integrated()}
					value={integrated === null ? '–' : `${signedDb(integrated)} LUFS`}
				/>
				<ValueRow
					label={m.loudness_true_peak()}
					value={truePeak === null ? '–' : `${signedDb(truePeak)} dBTP`}
				/>
				{truePeak !== null && truePeak > 0.05 && (
					<p role="status" className="text-small text-danger font-medium">
						{m.volume_clipping({ db: decimal(Math.round(truePeak * 10) / 10, 1) })}
					</p>
				)}
				{doc.normalize === null && (
					<Button
						disabled={truePeak === null}
						onClick={() => {
							if (truePeak !== null) {
								apply((current) => setGain(current, current.gain + TRUE_PEAK_CEILING - truePeak));
							}
						}}
					>
						{m.volume_maximize()}
					</Button>
				)}
			</div>

			<Section title={m.fades_title()}>
				<Slider
					label={m.fade_in()}
					value={Math.min(doc.fadeIn, fadeMax)}
					min={0}
					max={fadeMax}
					step={0.1}
					format={(value) => `${decimal(value, 1)} s`}
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
					format={(value) => `${decimal(value, 1)} s`}
					onChange={(fadeOut) => {
						preview((current) => setFades(current, { fadeOut }));
					}}
					onEnd={settle}
				/>
			</Section>
		</>
	);
}

function formatSpeed(speed: number): string {
	return `${new Intl.NumberFormat(getLocale()).format(speed)}×`;
}

/** How fast the sound plays and how high it sounds, each on its own. */
export function AudioSpeedPanel() {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const speed = speedOf(doc);
	const pitch = pitchOf(doc);
	const index = Math.max(0, AUDIO_SPEEDS.indexOf(speed));
	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={speed === 1 && pitch === 0}
						onClick={() => {
							apply((current) => ({ ...current, speed: 1, pitch: 0 }));
						}}
					/>
				}
			>
				{m.tool_speed()}
			</PanelTitle>
			<div className="grid gap-3.5">
				<Slider
					label={m.speed_label()}
					value={index}
					min={0}
					max={AUDIO_SPEEDS.length - 1}
					defaultValue={AUDIO_SPEEDS.indexOf(1)}
					format={(at) => formatSpeed(AUDIO_SPEEDS[at] ?? 1)}
					parse={(text) => {
						const typed = Number.parseFloat(text.replace(',', '.'));
						if (!Number.isFinite(typed)) return null;
						const distances = AUDIO_SPEEDS.map((listed) => Math.abs(listed - typed));
						return distances.indexOf(Math.min(...distances));
					}}
					onChange={(at) => {
						preview((current) => ({ ...current, speed: AUDIO_SPEEDS[at] ?? 1 }));
					}}
					onEnd={settle}
				/>
				<div role="radiogroup" aria-label={m.speed_label()} className="grid grid-cols-5 gap-1.5">
					{[0.75, 1, 1.25, 1.5, 2].map((choice) => (
						<button
							key={choice}
							type="button"
							role="radio"
							aria-checked={speed === choice}
							onClick={() => {
								apply((current) => ({ ...current, speed: choice }));
							}}
							className="text-ui tabular text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
						>
							{formatSpeed(choice)}
						</button>
					))}
				</div>
			</div>
			<Slider
				label={m.pitch_label()}
				value={pitch}
				min={PITCH_RANGE.min}
				max={PITCH_RANGE.max}
				defaultValue={0}
				format={(value) => m.pitch_value({ value: value > 0 ? `+${value}` : String(value) })}
				onChange={(value) => {
					preview((current) => ({ ...current, pitch: value }));
				}}
				onEnd={settle}
			/>
			<p className="text-ui text-ink-2 flex justify-between">
				<span>{m.audio_final_length()}</span>
				<span className="tabular text-ink font-mono text-[13px]">{formatPreciseTime(audioLength(doc))}</span>
			</p>
		</>
	);
}

const EQ_PRESET_LABELS: Record<EqPresetId, () => string> = {
	flat: () => m.eq_flat(),
	voice: () => m.eq_voice(),
	bass: () => m.eq_bass(),
	'bass-cut': () => m.eq_bass_cut(),
	treble: () => m.eq_treble(),
	warm: () => m.eq_warm(),
	bright: () => m.eq_bright(),
};

function frequencyLabel(hertz: number): string {
	return hertz >= 1000 ? `${hertz / 1000} kHz` : `${hertz} Hz`;
}

/** Width and height of the equalizer's curve, in its own units. */
const CURVE = { width: 300, height: 140 };
const LOW = Math.log10(20);
const HIGH = Math.log10(20_000);
/** Room kept above and below the ±12 dB range, in the curve's units, so handles stay whole. */
const CURVE_PAD = 10;

/** Share of the width at which a frequency sits, as the ear hears them (logarithmic). */
function curveX(hertz: number): number {
	return (Math.log10(hertz) - LOW) / (HIGH - LOW);
}

/** Height in the curve's units of a gain, in dB. */
function curveY(db: number): number {
	return CURVE.height / 2 - (db / EQ_RANGE.max) * (CURVE.height / 2 - CURVE_PAD);
}

function snapDb(db: number): number {
	return Math.max(EQ_RANGE.min, Math.min(EQ_RANGE.max, Math.round(db * 2) / 2));
}

/**
 * The equalizer as a curve across the audible range, with a point on each band: dragged up or
 * down, or moved with the arrows once focused (Page keys by 3 dB, Home back to 0).
 */
function EqCurve({
	eq,
	onPreview,
	onSettle,
}: {
	eq: readonly number[];
	onPreview: (band: number, gain: number) => void;
	onSettle: () => void;
}) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState<number | null>(null);
	const points: string[] = [];
	for (let i = 0; i <= 150; i++) {
		const hertz = 10 ** (LOW + ((HIGH - LOW) * i) / 150);
		const db = Math.max(-EQ_RANGE.max * 1.2, Math.min(EQ_RANGE.max * 1.2, responseAt(eq, hertz, 48_000)));
		points.push(`${(curveX(hertz) * CURVE.width).toFixed(1)},${curveY(db).toFixed(1)}`);
	}
	const dbAt = (clientY: number) => {
		const box = boxRef.current?.getBoundingClientRect();
		if (!box) return 0;
		const y = ((clientY - box.top) / box.height) * CURVE.height;
		return snapDb(((CURVE.height / 2 - y) / (CURVE.height / 2 - CURVE_PAD)) * EQ_RANGE.max);
	};
	return (
		<div className="grid gap-1.5">
			<div ref={boxRef} role="group" aria-label={m.eq_curve()} className="bg-surface relative h-36 rounded-sm">
				<svg
					viewBox={`0 0 ${CURVE.width} ${CURVE.height}`}
					className="absolute inset-0 size-full"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{[100, 1000, 10_000].map((hertz) => (
						<line
							key={hertz}
							x1={curveX(hertz) * CURVE.width}
							x2={curveX(hertz) * CURVE.width}
							y1={0}
							y2={CURVE.height}
							className="stroke-line"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<line
						x1={0}
						x2={CURVE.width}
						y1={curveY(0)}
						y2={curveY(0)}
						className="stroke-line-2"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
					<polyline
						points={points.join(' ')}
						fill="none"
						className="stroke-ed"
						strokeWidth={2}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{EQ_BANDS.map((band, index) => {
					const gain = eq[index] ?? 0;
					const set = (value: number) => {
						onPreview(index, snapDb(value));
					};
					return (
						<button
							key={band.frequency}
							type="button"
							role="slider"
							aria-label={frequencyLabel(band.frequency)}
							aria-valuemin={EQ_RANGE.min}
							aria-valuemax={EQ_RANGE.max}
							aria-valuenow={gain}
							aria-valuetext={formatDb(gain)}
							onPointerDown={(event) => {
								event.currentTarget.setPointerCapture(event.pointerId);
								setActive(index);
							}}
							onPointerMove={(event) => {
								if (active === index) set(dbAt(event.clientY));
							}}
							onPointerUp={() => {
								setActive(null);
								onSettle();
							}}
							onDoubleClick={() => {
								set(0);
								onSettle();
							}}
							onKeyDown={(event) => {
								const step =
									event.key === 'ArrowUp' || event.key === 'ArrowRight'
										? 0.5
										: event.key === 'ArrowDown' || event.key === 'ArrowLeft'
											? -0.5
											: event.key === 'PageUp'
												? 3
												: event.key === 'PageDown'
													? -3
													: null;
								if (step === null && event.key !== 'Home') return;
								event.preventDefault();
								set(step === null ? 0 : gain + step);
							}}
							onKeyUp={onSettle}
							className="group bg-bg absolute size-4 -translate-1/2 cursor-ns-resize touch-none rounded-full shadow-[inset_0_0_0_2.5px_var(--ed)]"
							style={{
								left: `${curveX(band.frequency) * 100}%`,
								top: `${(curveY(gain) / CURVE.height) * 100}%`,
							}}
						>
							<span
								className={`text-caption tabular bg-ink text-bg pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-xs px-1.5 py-0.5 font-mono whitespace-nowrap transition-opacity ${active === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
							>
								{formatDb(gain)}
							</span>
						</button>
					);
				})}
			</div>
			<div className="text-caption text-muted tabular relative h-4 font-mono" aria-hidden="true">
				{EQ_BANDS.map((band) => (
					<span
						key={band.frequency}
						className="absolute -translate-x-1/2 whitespace-nowrap"
						style={{ left: `${curveX(band.frequency) * 100}%` }}
					>
						{band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
					</span>
				))}
			</div>
		</div>
	);
}

/** Noise reduction and the equalizer: what changes the sound itself rather than its volume. */
export function SoundPanel() {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const chosen = EQ_PRESET_IDS.find((id) => EQ_PRESETS[id].every((gain, index) => gain === doc.eq[index]));
	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={doc.denoise === 0 && doc.eq.every((gain) => gain === 0)}
						onClick={() => {
							apply((current) => ({ ...current, denoise: 0, eq: FLAT_EQ }));
						}}
					/>
				}
			>
				{m.tool_sound()}
			</PanelTitle>

			<Section title={m.denoise_title()}>
				<Slider
					label={m.denoise_amount()}
					value={Math.round(doc.denoise * 100)}
					min={0}
					max={100}
					defaultValue={0}
					format={(value) => (value === 0 ? m.denoise_off() : `${value} %`)}
					onChange={(value) => {
						preview((current) => ({ ...current, denoise: value / 100 }));
					}}
					onEnd={settle}
				/>
			</Section>

			<Section title={m.eq_title()}>
				<div role="radiogroup" aria-label={m.eq_presets()} className="flex flex-wrap gap-1.5">
					{EQ_PRESET_IDS.map((id) => (
						<button
							key={id}
							type="button"
							role="radio"
							aria-checked={chosen === id}
							onClick={() => {
								apply((current) => ({ ...current, eq: EQ_PRESETS[id] }));
							}}
							className="bg-surface hover:bg-surface-2 aria-checked:bg-ed-soft aria-checked:text-ed-text aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)] text-ui rounded-full px-3 py-1.5 font-medium transition-colors"
						>
							{EQ_PRESET_LABELS[id]()}
						</button>
					))}
				</div>
				<EqCurve
					eq={doc.eq}
					onPreview={(band, gain) => {
						preview((current) => ({
							...current,
							eq: (current.eq.length === EQ_BANDS.length ? current.eq : FLAT_EQ).map((value, at) =>
								at === band ? gain : value,
							),
						}));
					}}
					onSettle={settle}
				/>
			</Section>
		</>
	);
}
