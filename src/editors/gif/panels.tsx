import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ItemStatus } from '@/editor/BatchList';
import { PanelTitle } from '@/editor/EditorLayout';
import { ASPECT_LABELS, ResetButton, Section } from '@/editor/panel-parts';
import { fitRatio } from '@/editors/image/crop';
import type { Rect } from '@/editors/image/document';
import { saveFile } from '@/editors/image/export';
import { ASPECTS, type AspectId, cropRatio } from '@/editors/image/store';
import { formatBytes, formatPreciseTime } from '@/lib/format';
import { type FileDestination, openFileDestination } from '@/media/file-destination';
import { outputName } from '@/media/save';
import type { BatchFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select, Slider, TimeField } from '@/ui/fields';
import { exportGifBatch } from './batch-export';
import { type Direction, FRAME_RATES, SPEEDS, setTrim } from './document';
import type { GifEngine } from './engine';
import { browserEncodesWebp, copyBlocker, exportWithinLimit, FORMAT_FILES, outputSize, videoCodec } from './export';
import { type AnimationFormat, useGifDoc, useGifEditor } from './store';

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
			</div>
		</>
	);
}

/** Size limits offered: what chats, forums and mail commonly accept. */
const SIZE_LIMITS = [25_000_000, 15_000_000, 10_000_000, 8_000_000, 5_000_000, 2_000_000, 1_000_000];

/** Widths offered, besides the picture's own. */
const WIDTHS = [320, 480, 640, 800, 1080];

const FORMATS: { value: AnimationFormat; label: () => string }[] = [
	{ value: 'gif', label: () => 'GIF' },
	{ value: 'apng', label: () => 'APNG' },
	{ value: 'webp', label: () => 'WebP' },
	{ value: 'video', label: () => m.anim_video() },
];

/** What this browser can encode: WebP itself, and H.264 for video. Both change a note, not a choice. */
function useEncoders(width: number, height: number): { webp: boolean; h264: boolean } {
	const [encoders, setEncoders] = useState({ webp: true, h264: true });
	useEffect(() => {
		let active = true;
		void Promise.all([browserEncodesWebp(), videoCodec(width, height)]).then(([webp, codec]) => {
			if (active) setEncoders({ webp, h264: codec === 'avc' });
		});
		return () => {
			active = false;
		};
	}, [width, height]);
	return encoders;
}

export function ExportPanel({ engine, isGif }: { engine: GifEngine; isGif: boolean }) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const setExport = useGifEditor((state) => state.setExport);
	const widthId = useId();
	const loopId = useId();
	const limitId = useId();
	const source = engine.source;
	const width = source?.width ?? 1;
	const height = source?.height ?? 1;
	const crop = doc.crop ?? { x: 0, y: 0, width, height };
	const output = outputSize(crop, settings.width, settings.format);
	const encoders = useEncoders(output.width, output.height);
	const widths = [...new Set([...WIDTHS.filter((value) => value < crop.width), crop.width])].toSorted(
		(a, b) => a - b,
	);
	const blocker = source ? copyBlocker(doc, settings, source, isGif) : 'source';
	const copying = settings.mode === 'copy' && blocker === null;
	const note =
		settings.format === 'webp' && !encoders.webp
			? m.webp_lossless_note()
			: settings.format === 'video' && !encoders.h264
				? m.video_webm_note()
				: null;

	return (
		<>
			<PanelTitle>{m.export_animation_title()}</PanelTitle>

			<div className="grid gap-2">
				<OptionList
					label={m.export_encoding()}
					value={copying ? 'copy' : 'encode'}
					options={[
						{
							value: 'copy',
							label: m.encoding_copy(),
							detail: 'GIF',
							disabled: blocker !== null,
							reason:
								blocker === 'frames'
									? m.encoding_copy_frames()
									: blocker === 'source'
										? m.encoding_copy_not_gif()
										: undefined,
						},
						{ value: 'encode', label: m.encoding_convert() },
					]}
					onChange={(mode) => {
						setExport({ mode });
					}}
				/>
			</div>

			{/* Kept visible but inactive while the original is kept. */}
			<div inert={copying} className={`grid gap-6 transition-opacity ${copying ? 'opacity-45' : ''}`}>
				<div className="grid gap-2">
					<OptionList
						label={m.export_format()}
						value={settings.format}
						options={FORMATS.map((option) => ({
							value: option.value,
							label: option.label(),
							detail:
								option.value === 'video'
									? encoders.h264
										? '.mp4'
										: '.webm'
									: `.${FORMAT_FILES[option.value].extension}`,
						}))}
						onChange={(value) => {
							setExport({ format: value });
						}}
					/>
					{note && <p className="text-small text-ed-text font-medium">{note}</p>}
				</div>

				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<FieldRow label={m.gif_width()} htmlFor={widthId}>
							<Select
								id={widthId}
								value={String(Math.min(settings.width ?? crop.width, crop.width))}
								options={widths.map((value) => ({ value: String(value), label: `${value} px` }))}
								onChange={(value) => {
									const chosen = Number(value);
									setExport({ width: chosen === crop.width ? null : chosen });
								}}
							/>
						</FieldRow>
					</div>
					{settings.format !== 'apng' && (
						<Slider
							label={m.export_quality()}
							value={settings.quality}
							min={1}
							max={100}
							defaultValue={90}
							format={String}
							onChange={(quality) => {
								setExport({ quality });
							}}
							onEnd={() => {}}
						/>
					)}
					{settings.format === 'gif' && (
						<Slider
							label={m.gif_compression()}
							value={settings.compression}
							min={0}
							max={100}
							defaultValue={0}
							format={String}
							onChange={(compression) => {
								setExport({ compression });
							}}
							onEnd={() => {}}
						/>
					)}
					<div className="grid gap-1.5">
						<FieldRow label={m.max_size()} htmlFor={limitId}>
							<Select
								id={limitId}
								value={String(settings.maxBytes ?? 'none')}
								options={[
									{ value: 'none', label: m.max_size_none() },
									...SIZE_LIMITS.map((bytes) => ({
										value: String(bytes),
										label: formatBytes(bytes),
									})),
								]}
								onChange={(value) => {
									setExport({ maxBytes: value === 'none' ? null : Number(value) });
								}}
							/>
						</FieldRow>
					</div>
				</div>
			</div>

			{(copying || settings.format !== 'video') && (
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
			)}
		</>
	);
}

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

export function ExportFooter({
	engine,
	file,
	isGif,
	batch,
	onStatus,
	onRunning,
}: {
	engine: GifEngine;
	file: File;
	isGif: boolean;
	/** Set in batch mode: every file is exported with the same settings. */
	batch: BatchFile[] | null;
	onStatus: (id: number, status: ItemStatus | null) => void;
	onRunning: (running: boolean) => void;
}) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState<number | null>(0);
	const [retry, setRetry] = useState<number | null>(null);
	const [fit, setFit] = useState<{ width: number; size: number; fits: boolean } | null>(null);
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

	const [exported, setExported] = useState(0);

	const runBatch = async (items: BatchFile[]) => {
		let destination: FileDestination;
		try {
			destination = await openFileDestination('pictures', 'vixely-animations.zip');
		} catch {
			return;
		}
		for (const item of items) onStatus(item.id, null);
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		onRunning(true);
		try {
			const count = await exportGifBatch({
				items,
				settings,
				destination,
				signal: controller.signal,
				onStatus,
				onProgress: setProgress,
			});
			setExported(count);
			setStatus(controller.signal.aborted ? 'idle' : count > 0 ? 'saved' : 'failed');
		} catch {
			setStatus('failed');
		} finally {
			abort.current = null;
			onRunning(false);
		}
	};

	const run = async () => {
		if (batch) {
			await runBatch(batch);
			return;
		}
		const source = engine.source;
		if (!source) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setRetry(null);
		setFit(null);
		setStatus('saving');
		try {
			const { blob, fittedWidth, fits } = await exportWithinLimit(
				{ file, isGif, source, doc, settings, signal: controller.signal, onProgress: setProgress },
				(width) => {
					setRetry(width);
					setProgress(0);
				},
			);
			if (fittedWidth !== null) setFit({ width: fittedWidth, size: blob.size, fits });
			const extension =
				blob.type === 'video/webm'
					? 'webm'
					: FORMAT_FILES[
							copyBlocker(doc, settings, source, isGif) === null && settings.mode === 'copy'
								? 'gif'
								: settings.format
						].extension;
			const saved = await saveFile(blob, outputName(file.name, extension));
			setStatus(saved ? 'saved' : 'idle');
		} catch (error) {
			setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		} finally {
			abort.current = null;
		}
	};

	const label = () => {
		if (status === 'saving' && batch) return m.exporting_percent({ percent: Math.floor((progress ?? 1) * 100) });
		if (status === 'saving') {
			if (retry !== null) return m.exporting_retry({ width: retry });
			return progress === null ? m.encoding_gif() : m.exporting_frames({ percent: Math.floor(progress * 100) });
		}
		if (status === 'saved') {
			return (
				<>
					<Check size={17} strokeWidth={2.4} aria-hidden="true" />
					{batch ? m.batch_saved_audio({ count: exported }) : m.saved()}
				</>
			);
		}
		if (batch) return m.export_batch_audio_button({ count: batch.length });
		const source = engine.source;
		const copying =
			source !== null && settings.mode === 'copy' && copyBlocker(doc, settings, source, isGif) === null;
		const name = copying
			? 'GIF'
			: settings.format === 'video'
				? m.anim_video()
				: settings.format.toUpperCase().replace('WEBP', 'WebP');
		return m.export_as({ format: name });
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
			{fit && status !== 'saving' && (
				<p role="status" className={`text-small font-medium ${fit.fits ? 'text-ed-text' : 'text-danger'}`}>
					{fit.fits
						? m.size_fitted({ width: fit.width, size: formatBytes(settings.maxBytes ?? fit.size) })
						: m.size_unreachable({ width: fit.width, size: formatBytes(fit.size) })}
				</p>
			)}
		</>
	);
}
