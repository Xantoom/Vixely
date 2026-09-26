import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ItemStatus } from '@/editor/BatchList';
import { PanelTitle } from '@/editor/EditorLayout';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { FilePanel } from '@/editor/Inspector';
import { Group, ResetButton, Section } from '@/editor/panel-parts';
import { fitRatio } from '@/editors/image/crop';
import { orientedSize } from '@/editors/image/document';
import { saveFile } from '@/editors/image/export';
import { formatBytes, formatPreciseTime } from '@/lib/format';
import { type FileDestination, openFileDestination } from '@/media/file-destination';
import { type GifInfo, readGifInfo } from '@/media/gif-info';
import { outputName } from '@/media/save';
import type { BatchFile, OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select, Slider, Switch, TimeField } from '@/ui/fields';
import { exportGifBatch } from './batch-export';
import { type Direction, type FadeColor, FRAME_RATES, frameLayout, NO_FADE, SPEEDS, setTrim } from './document';
import type { GifEngine } from './engine';
import { browserEncodesWebp, copyBlocker, exportLayout, exportWithinLimit, FORMAT_FILES, videoCodec } from './export';
import { GIF_PRESETS, type GifPreset } from './presets';
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
					<span className="tabular text-small font-mono">{formatPreciseTime(engine.length)}</span>
				</div>
			</div>
			<FadeSection length={engine.length} />
		</>
	);
}

const FADE_COLORS: { value: FadeColor; label: () => string }[] = [
	{ value: 'black', label: () => m.color_black() },
	{ value: 'white', label: () => m.color_white() },
	{ value: 'transparent', label: () => m.color_transparent() },
];

/** Fades in from a colour at the start and out to it at the end. */
function FadeSection({ length }: { length: number }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	// Tenths of a second, at most half the animation each.
	const most = Math.max(1, Math.min(50, Math.floor((length / 2) * 10)));
	const slider = (edge: 'in' | 'out', label: string) => (
		<Slider
			label={label}
			value={Math.round(doc.fade[edge] * 10)}
			min={0}
			max={most}
			format={(tenths) => `${(tenths / 10).toFixed(1)} s`}
			onChange={(tenths) => {
				preview((current) => ({ ...current, fade: { ...current.fade, [edge]: tenths / 10 } }));
			}}
			onEnd={settle}
		/>
	);
	return (
		<Group
			title={m.fade_title()}
			changed={doc.fade.in > 0 || doc.fade.out > 0}
			onReset={() => {
				apply((current) => ({ ...current, fade: NO_FADE }));
			}}
		>
			{slider('in', m.fade_in())}
			{slider('out', m.fade_out())}
			<OptionList
				label={m.fade_color()}
				value={doc.fade.color}
				options={FADE_COLORS.map((color) => ({ value: color.value, label: color.label() }))}
				onChange={(color) => {
					apply((current) => ({ ...current, fade: { ...current.fade, color } }));
				}}
			/>
		</Group>
	);
}

const BAND_SHAPES = ['1:1', '4:5', '9:16', '16:9', '21:9'] as const;

const BAND_COLORS: { value: string; label: () => string; color: string | null }[] = [
	{ value: 'black', label: () => m.color_black(), color: '#000000' },
	{ value: 'white', label: () => m.color_white(), color: '#ffffff' },
	{ value: 'transparent', label: () => m.color_transparent(), color: null },
];

function ratioOf(aspect: string): number {
	const [w = 1, h = 1] = aspect.split(':').map(Number);
	return w / h;
}

/**
 * Bands around the picture to give the frame another shape without cutting anything: a square
 * for a sticker, a tall frame for a story.
 */
export function BandsSection({ width, height }: { width: number; height: number }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const shapeId = useId();
	const colorId = useId();
	const current = doc.bands;
	const shape = current ? (BAND_SHAPES.find((id) => ratioOf(id) === current.ratio) ?? 'none') : 'none';
	const colour = current ? (BAND_COLORS.find((option) => option.color === current.color)?.value ?? 'black') : 'black';
	const layout = frameLayout(doc, { width, height }, null);
	return (
		<Section title={m.bands_title()}>
			<FieldRow label={m.bands_shape()} htmlFor={shapeId}>
				<Select
					id={shapeId}
					value={shape}
					options={[
						{ value: 'none', label: m.bands_none() },
						...BAND_SHAPES.map((id) => ({ value: id, label: id })),
					]}
					onChange={(value) => {
						apply((doc) => ({
							...doc,
							bands:
								value === 'none'
									? null
									: { ratio: ratioOf(value), color: doc.bands ? doc.bands.color : '#000000' },
						}));
					}}
				/>
			</FieldRow>
			{current && (
				<FieldRow label={m.bands_color()} htmlFor={colorId}>
					<Select
						id={colorId}
						value={colour}
						options={BAND_COLORS.map((option) => ({ value: option.value, label: option.label() }))}
						onChange={(value) => {
							const color = BAND_COLORS.find((option) => option.value === value)?.color ?? null;
							apply((doc) => ({ ...doc, bands: doc.bands && { ...doc.bands, color } }));
						}}
					/>
				</FieldRow>
			)}
			{current && (
				<p className="text-small text-muted tabular font-mono">
					{layout.width} × {layout.height} px
				</p>
			)}
		</Section>
	);
}

const SKIPS = [1, 2, 3, 4];

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
	const skipId = useId();
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
			<div className="grid gap-3.5">
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
				<FieldRow label={m.skip_frames()} htmlFor={skipId}>
					<Select
						id={skipId}
						value={String(doc.skip)}
						options={SKIPS.map((skip) => ({
							value: String(skip),
							label: skip === 1 ? m.skip_none() : m.skip_one_in({ count: skip }),
						}))}
						onChange={(value) => {
							apply((current) => ({ ...current, skip: Number(value) }));
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
	{ value: 'frames', label: () => m.anim_frames() },
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
	// Widths are those of the whole frame, bands included.
	const natural = frameLayout(doc, { width, height }, null).width;
	const output = exportLayout(doc, { width, height }, settings);
	const encoders = useEncoders(output.width, output.height);
	const widths = [...new Set([...WIDTHS.filter((value) => value < natural), natural])].toSorted((a, b) => a - b);
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
									? encoders.h264 && !settings.alpha
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
								value={String(Math.min(settings.width ?? natural, natural))}
								options={widths.map((value) => ({ value: String(value), label: `${value} px` }))}
								onChange={(value) => {
									const chosen = Number(value);
									setExport({ width: chosen === natural ? null : chosen });
								}}
							/>
						</FieldRow>
					</div>
					{settings.format !== 'apng' && settings.format !== 'frames' && (
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
					{settings.format === 'gif' && (
						<Switch
							label={m.gif_dither()}
							checked={settings.dither}
							onChange={(dither) => {
								setExport({ dither });
							}}
						/>
					)}
					{settings.format === 'video' && (
						<Switch
							label={m.video_alpha()}
							checked={settings.alpha}
							onChange={(alpha) => {
								setExport({ alpha });
							}}
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

			{(copying || (settings.format !== 'video' && settings.format !== 'frames')) && (
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
				: settings.format === 'frames'
					? m.anim_frames()
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
					disabled={!engine.source}
					busy={status === 'saving'}
				>
					{label()}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			<ExportAnnounce status={status} />
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

/**
 * What platforms ask for, one click each: the frame's width, a square crop for emotes and
 * stickers, the format and the size limit.
 */
export function GifPresetsPanel({ engine }: { engine: GifEngine }) {
	const chosen = useGifEditor((state) => state.exportSettings.preset);
	const setExport = useGifEditor((state) => state.setExport);
	const apply = useGifEditor((state) => state.apply);
	const setAspect = useGifEditor((state) => state.setCropAspect);
	const { source } = engine;

	const choose = (preset: GifPreset) => {
		if (!source) return;
		apply((doc) => {
			const bounds = orientedSize(source, doc.picture.rotation);
			const crop = preset.square ? fitRatio({ x: 0, y: 0, ...bounds }, 1) : doc.picture.crop;
			// A video is sampled at the preset's rate; an animation keeps its own frames.
			return {
				...doc,
				picture: { ...doc.picture, crop },
				bands: null,
				fps: source.timing ? doc.fps : preset.fps,
			};
		});
		if (preset.square) setAspect('1:1');
		setExport({
			mode: 'encode',
			format: preset.format,
			width: preset.width,
			maxBytes: preset.maxBytes,
			preset: preset.id,
		});
	};

	return (
		<>
			<PanelTitle>{m.tool_presets()}</PanelTitle>
			<div className="grid gap-1.5">
				{GIF_PRESETS.map((preset) => {
					const name = preset.platform ? `${preset.platform} · ${preset.label()}` : preset.label();
					return (
						<button
							key={preset.id}
							type="button"
							aria-pressed={chosen === preset.id}
							onClick={() => {
								choose(preset);
							}}
							className="bg-surface hover:bg-surface-2 aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] ease-spring grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-3.5 py-2.5 text-left transition-[background-color,transform] duration-200 active:scale-[0.98]"
						>
							<span className="text-ui truncate font-medium">{name}</span>
							<span className="text-small text-muted tabular text-right font-mono">
								{preset.square ? `${preset.width} × ${preset.width}` : `${preset.width} px`}
								<span className="text-caption block">
									{FORMAT_FILES[preset.format].extension.toUpperCase()}
									{preset.maxBytes ? ` · ≤ ${formatBytes(preset.maxBytes)}` : ''}
								</span>
							</span>
						</button>
					);
				})}
			</div>
		</>
	);
}

/** The file's details, and for an animation, how its frames are timed and, for a GIF, coloured. */
export function GifInfoPanel({ engine, opened }: { engine: GifEngine; opened: OpenedFile | null }) {
	const [info, setInfo] = useState<GifInfo | null>(null);
	const file = opened?.file ?? null;
	const isGif = opened?.format === 'gif';
	useEffect(() => {
		setInfo(null);
		if (!file || !isGif) return;
		let live = true;
		void file.arrayBuffer().then((buffer) => {
			if (live) setInfo(readGifInfo(new Uint8Array(buffer)));
		});
		return () => {
			live = false;
		};
	}, [file, isGif]);
	const timing = engine.source?.timing ?? null;
	const delays = timing?.map((frame) => Math.round(frame.duration * 1000)) ?? [];
	const total = timing ? timing.reduce((sum, frame) => sum + frame.duration, 0) : 0;
	const rows: [string, string][] = [];
	if (timing && delays.length > 0) {
		rows.push(
			[m.analysis_frames(), String(delays.length)],
			[
				m.analysis_delays(),
				`${Math.min(...delays)} / ${Math.round((total * 1000) / delays.length)} / ${Math.max(...delays)} ms`,
			],
			[m.analysis_rate(), `${(delays.length / Math.max(total, 1e-3)).toFixed(2)} fps`],
		);
	}
	if (info) {
		rows.push(
			[
				m.analysis_palette(),
				info.localPalettes > 0
					? m.analysis_palette_local({ colors: info.globalColors, count: info.localPalettes })
					: String(info.globalColors),
			],
			[m.analysis_transparency(), info.transparent ? m.yes() : m.no()],
			[
				m.loop(),
				info.loops === null
					? m.loop_once()
					: info.loops === 0
						? m.loop_forever()
						: m.loop_times({ count: info.loops + 1 }),
			],
		);
		// Browsers show delays under 20 ms as 100 ms.
		const slowed = info.delays.filter((delay) => delay < 20).length;
		if (slowed > 0) rows.push([m.analysis_slowed(), String(slowed)]);
	}
	return (
		<>
			<FilePanel opened={opened} />
			{rows.length > 0 && (
				<Section title={m.analysis_title()}>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
						{rows.map(([label, value]) => (
							<div key={label} className="contents">
								<dt className="text-ui text-ink-2">{label}</dt>
								<dd className="text-small tabular text-right font-mono">{value}</dd>
							</div>
						))}
					</dl>
				</Section>
			)}
		</>
	);
}
