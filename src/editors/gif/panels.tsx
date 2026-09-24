import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ASPECT_LABELS, ResetButton, Section } from '@/editor/panel-parts';
import { fitRatio } from '@/editors/image/crop';
import type { Rect } from '@/editors/image/document';
import { saveFile } from '@/editors/image/export';
import { ASPECTS, type AspectId, cropRatio } from '@/editors/image/store';
import { formatPreciseTime } from '@/lib/format';
import { outputName } from '@/media/save';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select, Slider, TimeField } from '@/ui/fields';
import { type Direction, FRAME_RATES, SPEEDS, setTrim } from './document';
import type { GifEngine } from './engine';
import { exportGif, outputSize } from './export';
import { useGifDoc, useGifEditor } from './store';

export function TrimPanel({ engine }: { engine: GifEngine }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const startId = useId();
	const endId = useId();
	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={doc.trim.start === 0 && doc.trim.end === doc.duration}
						onClick={() => {
							apply((current) => ({ ...current, trim: { start: 0, end: current.duration } }));
						}}
					/>
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
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
					<span className="text-ui text-ink-2">{m.audio_final_length()}</span>
					<span className="tabular font-mono text-[12.5px]">{formatPreciseTime(engine.length)}</span>
				</div>
				<p className="text-small text-muted">{m.gif_trim_hint()}</p>
			</div>
		</>
	);
}

export function CropPanel({ width, height }: { width: number; height: number }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const aspect = useGifEditor((state) => state.cropAspect);
	const setAspect = useGifEditor((state) => state.setCropAspect);
	const bounds = { width, height };
	const full: Rect = { x: 0, y: 0, width, height };
	const crop = doc.crop ?? full;

	const chooseAspect = (next: AspectId) => {
		setAspect(next);
		const ratio = cropRatio(next, bounds);
		if (next === 'original') apply((current) => ({ ...current, crop: null }));
		else if (ratio !== null) apply((current) => ({ ...current, crop: fitRatio(full, ratio) }));
	};

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={doc.crop === null}
						onClick={() => {
							setAspect('free');
							apply((current) => ({ ...current, crop: null }));
						}}
					/>
				}
			>
				{m.tool_crop()}
			</PanelTitle>
			<Section title={m.crop_aspect()}>
				<OptionList
					label={m.crop_aspect()}
					value={aspect}
					onChange={chooseAspect}
					options={ASPECTS.map((id) => {
						const ratio = cropRatio(id, bounds);
						const size = id === 'free' ? crop : ratio === null ? bounds : fitRatio(full, ratio);
						return { value: id, label: ASPECT_LABELS[id](), detail: `${size.width} × ${size.height}` };
					})}
				/>
			</Section>
		</>
	);
}

const DIRECTIONS: { value: Direction; label: () => string }[] = [
	{ value: 'forward', label: () => m.direction_forward() },
	{ value: 'reverse', label: () => m.direction_reverse() },
	{ value: 'pingpong', label: () => m.direction_pingpong() },
];

function formatSpeed(speed: number): string {
	return `${new Intl.NumberFormat(getLocale()).format(speed)}×`;
}

export function SpeedPanel({ animated }: { animated: boolean }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const rateId = useId();
	const speedIndex = Math.max(0, SPEEDS.indexOf(doc.speed));

	return (
		<>
			<PanelTitle>{m.tool_speed()}</PanelTitle>
			<div className="grid gap-4">
				<Slider
					label={m.speed_label()}
					value={speedIndex}
					min={0}
					max={SPEEDS.length - 1}
					defaultValue={SPEEDS.indexOf(1)}
					format={(index) => formatSpeed(SPEEDS[index] ?? 1)}
					hint={m.speed_hint()}
					onChange={(index) => {
						preview((current) => ({ ...current, speed: SPEEDS[index] ?? 1 }));
					}}
					onEnd={settle}
				/>
			</div>
			<Section title={m.direction()}>
				<OptionList
					label={m.direction()}
					value={doc.direction}
					options={DIRECTIONS.map((direction) => ({ value: direction.value, label: direction.label() }))}
					onChange={(direction) => {
						apply((current) => ({ ...current, direction }));
					}}
				/>
			</Section>
			<div className="grid gap-1.5">
				<FieldRow label={m.info_frame_rate()} htmlFor={rateId}>
					<Select
						id={rateId}
						value={doc.fps === null ? 'original' : String(doc.fps)}
						options={[
							...(animated ? [{ value: 'original', label: m.fps_original() }] : []),
							...FRAME_RATES.map((rate) => ({ value: String(rate), label: `${rate} fps` })),
						]}
						onChange={(value) => {
							apply((current) => ({ ...current, fps: value === 'original' ? null : Number(value) }));
						}}
					/>
				</FieldRow>
				<p className="text-small text-muted">{m.fps_hint()}</p>
			</div>
		</>
	);
}

/** Widths offered, besides the picture's own. */
const WIDTHS = [320, 480, 640, 800, 1080];

export function ExportPanel({ width, height }: { width: number; height: number }) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const setExport = useGifEditor((state) => state.setExport);
	const widthId = useId();
	const loopId = useId();
	const crop = doc.crop ?? { x: 0, y: 0, width, height };
	const output = outputSize(crop, settings.width);
	const widths = [...new Set([...WIDTHS.filter((value) => value < crop.width), crop.width])].toSorted(
		(a, b) => a - b,
	);

	return (
		<>
			<PanelTitle>{m.export_gif_title()}</PanelTitle>
			<div className="grid gap-4">
				<div className="grid gap-1.5">
					<FieldRow label={m.gif_width()} htmlFor={widthId}>
						<Select
							id={widthId}
							value={String(output.width)}
							options={widths.map((value) => ({ value: String(value), label: `${value} px` }))}
							onChange={(value) => {
								const chosen = Number(value);
								setExport({ width: chosen === crop.width ? null : chosen });
							}}
						/>
					</FieldRow>
					<p className="text-small text-muted">{m.gif_width_hint()}</p>
				</div>
				<FieldRow label={m.loop()} htmlFor={loopId}>
					<Select
						id={loopId}
						value={String(settings.repeat)}
						options={[
							{ value: '0', label: m.loop_forever() },
							{ value: '-1', label: m.loop_once() },
							...[2, 3, 5].map((count) => ({ value: String(count - 1), label: m.loop_times({ count }) })),
						]}
						onChange={(value) => {
							setExport({ repeat: Number(value) });
						}}
					/>
				</FieldRow>
				<Slider
					label={m.export_quality()}
					value={settings.quality}
					min={1}
					max={100}
					defaultValue={90}
					format={String}
					hint={m.gif_quality_hint()}
					onChange={(quality) => {
						setExport({ quality });
					}}
					onEnd={() => {}}
				/>
				<Slider
					label={m.gif_compression()}
					value={settings.compression}
					min={0}
					max={100}
					defaultValue={0}
					format={String}
					hint={m.gif_compression_hint()}
					onChange={(compression) => {
						setExport({ compression });
					}}
					onEnd={() => {}}
				/>
			</div>
		</>
	);
}

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

export function ExportFooter({ engine, file }: { engine: GifEngine; file: File }) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState<number | null>(0);
	const abort = useRef<AbortController | null>(null);

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, SAVED_FEEDBACK);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	const run = async () => {
		const source = engine.source;
		if (!source) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		try {
			const blob = await exportGif({ source, doc, settings, signal: controller.signal, onProgress: setProgress });
			const saved = await saveFile(blob, outputName(file.name, 'gif'));
			setStatus(saved ? 'saved' : 'idle');
		} catch (error) {
			setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		} finally {
			abort.current = null;
		}
	};

	const label = () => {
		if (status === 'saving') {
			return progress === null ? m.encoding_gif() : m.exporting_frames({ percent: Math.floor(progress * 100) });
		}
		if (status === 'saved') {
			return (
				<>
					<Check size={17} strokeWidth={2.4} aria-hidden="true" />
					{m.saved()}
				</>
			);
		}
		return m.export_gif_button();
	};

	return (
		<>
			{status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className={`bg-ed h-full transition-[width] duration-200 ${progress === null ? 'animate-pulse' : ''}`}
						style={{ width: `${(progress ?? 1) * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					onClick={() => void run()}
					disabled={status === 'saving' || !engine.source}
				>
					{label()}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.export_gif_failed()}
				</p>
			)}
		</>
	);
}
