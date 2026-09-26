import { type ReactNode, useId } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { KeptPanel } from '@/editor/KeptPanel';
import { formatDb, signedDb } from '@/lib/format';
import { EQ_BANDS, EQ_PRESET_IDS, EQ_PRESETS, EQ_RANGE, type EqPresetId, FLAT_EQ, responseAt } from '@/media/sound';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { FieldRow, Select, Slider } from '@/ui/fields';
import { GAIN_RANGE, normalizationGain, outputDuration, setFades, setGain, TRUE_PEAK_CEILING } from './document';
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
	return (
		<KeptPanel editing={{ doc, apply, playhead, selection, setSelection, lengthLabel: m.audio_final_length() }} />
	);
}

/** Loudness targets of the places audio ends up, in LUFS. */
const TARGETS: { value: number; name: () => string }[] = [
	{ value: -14, name: () => m.normalize_streaming_name() },
	{ value: -16, name: () => m.normalize_apple_name() },
	{ value: -23, name: () => 'EBU R128' },
];

export function VolumePanel({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const apply = useAudioEditor((state) => state.apply);
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const normalizeId = useId();
	const { reading } = engine;
	const length = outputDuration(doc);
	const fadeMax = Math.max(0.1, Math.min(30, Math.floor(length * 10) / 10));
	const normalization = doc.normalize !== null && reading ? normalizationGain(doc.normalize, reading) : null;
	// What the export will measure: the reading taken without gain, moved by the gain applied.
	const gain = engine.resolved.gain;
	const integrated = reading && Number.isFinite(reading.integrated) ? reading.integrated + gain : null;
	const truePeak = reading && Number.isFinite(reading.truePeak) ? reading.truePeak + gain : null;

	return (
		<>
			<PanelTitle>{m.volume_title()}</PanelTitle>

			<div className="grid gap-4">
				<div className="grid gap-1.5">
					<FieldRow label={m.normalize()} htmlFor={normalizeId}>
						<Select
							id={normalizeId}
							value={doc.normalize === null ? 'off' : String(doc.normalize)}
							options={[
								{ value: 'off', label: m.normalize_off() },
								...TARGETS.map((option) => ({
									value: String(option.value),
									label: `${signedDb(option.value).replace('.0', '')} LUFS, ${option.name()}`,
								})),
							]}
							onChange={(value) => {
								apply((current) => ({ ...current, normalize: value === 'off' ? null : Number(value) }));
							}}
						/>
					</FieldRow>
					{normalization?.limited && integrated !== null && (
						<p role="status" className="text-small text-ed-text font-medium">
							{m.normalize_limited({ lufs: signedDb(integrated) })}
						</p>
					)}
				</div>

				{doc.normalize === null ? (
					<Slider
						label={m.volume_gain()}
						value={doc.gain}
						min={GAIN_RANGE.min}
						max={GAIN_RANGE.max}
						step={0.5}
						format={formatDb}
						onChange={(value) => {
							preview((current) => setGain(current, value));
						}}
						onEnd={settle}
					/>
				) : (
					<div className="grid gap-1.5">
						<ValueRow label={m.volume_gain()} value={reading ? formatDb(gain) : '–'} />
						<p className="text-small text-muted">{m.volume_gain_auto()}</p>
					</div>
				)}

				<div className="grid gap-2">
					<ValueRow
						label={m.loudness_integrated()}
						value={integrated === null ? '–' : `${signedDb(integrated)} LUFS`}
					/>
					<ValueRow
						label={m.loudness_true_peak()}
						value={truePeak === null ? '–' : `${signedDb(truePeak)} dBTP`}
					/>
					{reading === null ? (
						<p className="text-small text-muted">{m.volume_peak_pending()}</p>
					) : (
						truePeak !== null &&
						truePeak > 0.05 && (
							<p role="status" className="text-small text-danger font-medium">
								{m.volume_clipping({ db: (Math.round(truePeak * 10) / 10).toFixed(1) })}
							</p>
						)
					)}
				</div>

				{doc.normalize === null && (
					<div className="grid gap-2">
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
					</div>
				)}
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
			</Section>
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
const CURVE = { width: 300, height: 96 };
const LOW = Math.log10(20);
const HIGH = Math.log10(20_000);

/** The equalizer's effect across the audible range, as the ear hears frequencies (logarithmic). */
function EqCurve({ eq }: { eq: readonly number[] }) {
	const y = (db: number) => CURVE.height / 2 - (db / EQ_RANGE.max) * (CURVE.height / 2 - 4);
	const x = (hertz: number) => ((Math.log10(hertz) - LOW) / (HIGH - LOW)) * CURVE.width;
	const points: string[] = [];
	for (let i = 0; i <= 120; i++) {
		const hertz = 10 ** (LOW + ((HIGH - LOW) * i) / 120);
		const db = Math.max(-EQ_RANGE.max * 1.2, Math.min(EQ_RANGE.max * 1.2, responseAt(eq, hertz, 48_000)));
		points.push(`${x(hertz).toFixed(1)},${y(db).toFixed(1)}`);
	}
	return (
		<svg
			viewBox={`0 0 ${CURVE.width} ${CURVE.height}`}
			className="bg-surface h-24 w-full rounded-sm"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{[100, 1000, 10_000].map((hertz) => (
				<line
					key={hertz}
					x1={x(hertz)}
					x2={x(hertz)}
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
				y1={y(0)}
				y2={y(0)}
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
			<PanelTitle>{m.tool_sound()}</PanelTitle>

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
				<EqCurve eq={doc.eq} />
				{EQ_BANDS.map((band, index) => (
					<Slider
						key={band.frequency}
						label={frequencyLabel(band.frequency)}
						value={doc.eq[index] ?? 0}
						min={EQ_RANGE.min}
						max={EQ_RANGE.max}
						step={0.5}
						defaultValue={0}
						format={formatDb}
						onChange={(gain) => {
							preview((current) => ({
								...current,
								eq: (current.eq.length === EQ_BANDS.length ? current.eq : FLAT_EQ).map((value, at) =>
									at === index ? gain : value,
								),
							}));
						}}
						onEnd={settle}
					/>
				))}
			</Section>
		</>
	);
}
