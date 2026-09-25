import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { codecName, formatSampleRate, groupDigits } from '@/lib/format';
import { outputName } from '@/media/save';
import { openBatchDestination, openSaveTarget } from '@/media/save-target';
import type { BatchFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select, TextField } from '@/ui/fields';
import { exportAudioBatch, type ItemStatus } from './batch-export';
import type { AudioDoc } from './document';
import {
	AUDIO_FORMAT_ORDER,
	AUDIO_FORMATS,
	type AudioExportSettings,
	outputChannels,
	outputRate,
	outputType,
	canExport,
	copyBlocker,
	exportAudio,
	type SourceFormat,
} from './export';
import { type AudioTags, useAudioEditor } from './store';

function useOpusSupport(): boolean | null {
	const [supported, setSupported] = useState<boolean | null>(null);
	useEffect(() => {
		let active = true;
		void canExport('opus').then((result) => {
			if (active) setSupported(result);
		});
		return () => {
			active = false;
		};
	}, []);
	return supported;
}

/** Cover pictures players can read. Anything else is converted to JPEG first. */
const COVER_TYPES = new Set(['image/jpeg', 'image/png']);

async function coverFromFile(file: File): Promise<{ data: Uint8Array; mimeType: string }> {
	if (COVER_TYPES.has(file.type)) return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type };
	const bitmap = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
	return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg' };
}

function CoverPreview({ source, cover }: { source: ImageBitmap | null; cover: AudioExportSettings['cover'] }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (typeof cover !== 'object') return;
		const next = URL.createObjectURL(new Blob([cover.data.slice()], { type: cover.mimeType }));
		setUrl(next);
		return () => {
			URL.revokeObjectURL(next);
		};
	}, [cover]);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !source || cover !== 'keep') return;
		canvas.width = 128;
		canvas.height = Math.round((source.height / source.width) * 128);
		canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
	}, [source, cover]);

	const box = 'size-16 flex-none rounded-xs bg-surface-2 object-cover shadow-[0_0_0_1px_var(--line)]';
	if (typeof cover === 'object' && url) return <img src={url} alt="" className={box} />;
	if (cover === 'keep' && source) return <canvas ref={canvasRef} className={box} />;
	return (
		<span className={`${box} text-caption text-muted grid place-items-center p-1 text-center`}>
			{m.cover_none()}
		</span>
	);
}

function CoverField({ source }: { source: ImageBitmap | null }) {
	const cover = useAudioEditor((state) => state.exportSettings.cover);
	const setExport = useAudioEditor((state) => state.setExport);
	const inputRef = useRef<HTMLInputElement>(null);
	const hasCover = typeof cover === 'object' || (cover === 'keep' && source !== null);

	return (
		<div className="grid gap-1.5">
			<span className="text-ui text-ink-2">{m.cover()}</span>
			<div className="flex items-center gap-3">
				<CoverPreview source={source} cover={cover} />
				<div className="flex flex-wrap gap-2">
					<Button className="h-8 px-3" onClick={() => inputRef.current?.click()}>
						{hasCover ? m.cover_change() : m.cover_add()}
					</Button>
					{hasCover ? (
						<Button
							className="h-8 px-3"
							onClick={() => {
								setExport({ cover: 'none' });
							}}
						>
							{m.cover_remove()}
						</Button>
					) : (
						source && (
							<Button
								className="h-8 px-3"
								onClick={() => {
									setExport({ cover: 'keep' });
								}}
							>
								{m.removed_restore()}
							</Button>
						)
					)}
				</div>
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					className="hidden"
					tabIndex={-1}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (!file) return;
						void coverFromFile(file).then((picture) => {
							setExport({ cover: picture });
						});
					}}
				/>
			</div>
		</div>
	);
}

export function ExportPanel({
	source,
	doc,
	cover,
	batch,
}: {
	source: SourceFormat;
	/** The document as it sounds: whether the original encoding can be kept depends on it. */
	doc: AudioDoc;
	cover: ImageBitmap | null;
	/** In a batch, every file keeps its own tags. */
	batch: boolean;
}) {
	const settings = useAudioEditor((state) => state.exportSettings);
	const setExport = useAudioEditor((state) => state.setExport);
	const opus = useOpusSupport();
	const info = AUDIO_FORMATS[settings.format];
	const bitrateId = useId();
	const rateId = useId();
	const channelsId = useId();
	const depthId = useId();
	// The source layout comes first, named like the others: Stereo, Mono or 6 channels.
	const keptChannels = outputChannels({ ...settings, channels: 'keep' }, source);
	const channels = outputChannels(settings, source);
	const layoutName = (count: number) =>
		count === 1 ? m.channels_mono() : count === 2 ? m.channels_stereo() : m.channels_count({ count });
	const channelOptions: { value: AudioExportSettings['channels']; label: string }[] = [
		{ value: 'keep', label: layoutName(keptChannels) },
		...(keptChannels === 2 ? [] : [{ value: 'stereo' as const, label: m.channels_stereo() }]),
		...(keptChannels === 1 ? [] : [{ value: 'mono' as const, label: m.channels_mono() }]),
	];
	const rate = outputRate(settings, source);
	const bitrate = settings.bitrate;
	const blocker = copyBlocker(doc, source);
	const copying = settings.mode === 'copy' && blocker === null;
	const lossy = source.codec !== null && ['mp3', 'aac', 'opus', 'vorbis', 'ac3', 'eac3'].includes(source.codec);
	const original = source.codec
		? `${codecName(source.codec)}${lossy && source.bitrate ? ` ${source.bitrate} kb/s` : ''}`
		: undefined;
	const copyReason =
		blocker === 'volume' ? m.encoding_copy_volume() : blocker === 'codec' ? m.encoding_copy_codec() : undefined;

	return (
		<>
			<PanelTitle>{m.export_audio_title()}</PanelTitle>

			<div className="grid gap-2">
				<OptionList
					label={m.export_encoding()}
					value={copying ? 'copy' : 'encode'}
					options={[
						{
							value: 'copy',
							label: m.encoding_copy(),
							detail: original,
							disabled: blocker !== null,
							reason: copyReason,
						},
						{ value: 'encode', label: m.encoding_convert() },
					]}
					onChange={(mode) => {
						setExport({ mode });
					}}
				/>
			</div>

			{/* Kept visible but inactive while the original is kept: the values it has are the source's. */}
			<div inert={copying} className={`grid gap-6 transition-opacity ${copying ? 'opacity-45' : ''}`}>
				<div className="grid gap-2">
					<OptionList
						label={m.export_format()}
						value={settings.format}
						options={AUDIO_FORMAT_ORDER.filter((format) => format !== 'opus' || opus !== false).map(
							(format) => ({
								value: format,
								label: AUDIO_FORMATS[format].label,
								detail: `.${AUDIO_FORMATS[format].extension}`,
							}),
						)}
						onChange={(format) => {
							setExport({ format, bitrate: AUDIO_FORMATS[format].defaultBitrate });
						}}
					/>
					{opus === false && <p className="text-small text-muted">{m.opus_unavailable()}</p>}
				</div>

				<div className="grid gap-3.5">
					{info.bitrates.length > 0 && (
						<div className="grid gap-1.5">
							<FieldRow label={m.export_bitrate()} htmlFor={bitrateId}>
								<Select
									id={bitrateId}
									value={String(bitrate)}
									options={info.bitrates.map((kbps) => ({
										value: String(kbps),
										label: `${kbps} kb/s`,
									}))}
									onChange={(value) => {
										setExport({ bitrate: Number(value) });
									}}
								/>
							</FieldRow>
						</div>
					)}

					<div className="grid gap-1.5">
						<FieldRow label={m.info_sample_rate()} htmlFor={rateId}>
							{info.sampleRates.length === 1 ? (
								<span className="tabular text-right font-mono text-[12.5px]">
									{formatSampleRate(info.sampleRates[0] ?? 48_000)}
								</span>
							) : (
								<Select
									id={rateId}
									value={String(rate)}
									options={info.sampleRates.map((option) => ({
										value: String(option),
										label: `${groupDigits(option)} Hz`,
									}))}
									onChange={(value) => {
										// The source's own rate is stored as "keep", so it follows another file.
										const chosen = Number(value);
										setExport({ sampleRate: chosen === source.sampleRate ? null : chosen });
									}}
								/>
							)}
						</FieldRow>
					</div>

					<FieldRow label={m.info_channels()} htmlFor={channelsId}>
						<Select
							id={channelsId}
							value={channels === keptChannels ? 'keep' : settings.channels}
							options={channelOptions}
							onChange={(channels) => {
								setExport({ channels });
							}}
						/>
					</FieldRow>

					{info.bitDepth && (
						<div className="grid gap-1.5">
							<FieldRow label={m.export_bit_depth()} htmlFor={depthId}>
								<Select
									id={depthId}
									value={String(settings.bitDepth)}
									options={[
										{ value: '16', label: m.bit_depth_value({ bits: 16 }) },
										{ value: '24', label: m.bit_depth_value({ bits: 24 }) },
									]}
									onChange={(value) => {
										setExport({ bitDepth: value === '24' ? 24 : 16 });
									}}
								/>
							</FieldRow>
						</div>
					)}
				</div>
			</div>

			<section className="grid gap-3.5">
				<h3 className="text-ui text-ink-2 font-semibold">{m.export_metadata()}</h3>
				{batch || !settings.tags ? (
					<p className="text-small text-muted -mt-1">{m.batch_tags_kept()}</p>
				) : (
					<MetadataFields tags={settings.tags} cover={cover} />
				)}
			</section>
		</>
	);
}

function MetadataFields({ tags, cover }: { tags: AudioTags; cover: ImageBitmap | null }) {
	const setExport = useAudioEditor((state) => state.setExport);
	return (
		<>
			<TextField
				label={m.info_title()}
				value={tags.title}
				onChange={(title) => {
					setExport({ tags: { ...tags, title } });
				}}
			/>
			<TextField
				label={m.info_artist()}
				value={tags.artist}
				onChange={(artist) => {
					setExport({ tags: { ...tags, artist } });
				}}
			/>
			<TextField
				label={m.info_album()}
				value={tags.album}
				onChange={(album) => {
					setExport({ tags: { ...tags, album } });
				}}
			/>
			<CoverField source={cover} />
		</>
	);
}

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

/**
 * `doc` is the document as it sounds. `ready` is false while normalization waits for the
 * loudness measurement: exporting then would use the wrong gain. With a batch, every file is
 * exported with the same edits.
 */
export function ExportFooter({
	file,
	source,
	doc,
	ready,
	batch,
	onStatus,
	onRunning,
}: {
	file: File;
	source: SourceFormat;
	doc: AudioDoc;
	ready: boolean;
	batch: BatchFile[] | null;
	onStatus: (id: number, status: ItemStatus | null) => void;
	onRunning: (running: boolean) => void;
}) {
	const settings = useAudioEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState(0);
	const [exported, setExported] = useState(0);
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

	const start = () => {
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		onRunning(true);
		return controller.signal;
	};

	const end = (next: typeof status) => {
		setStatus(next);
		abort.current = null;
		onRunning(false);
	};

	const exportOne = async () => {
		const type = outputType(settings, source);
		// The destination is asked first: the file picker only opens from the click itself.
		const save = await openSaveTarget(outputName(file.name, type.extension), {
			mime: type.mime,
			extension: type.extension,
			description: type.label,
		});
		if (!save) return;
		const signal = start();
		try {
			await exportAudio({
				file,
				track: useAudioEditor.getState().audioTrack,
				doc,
				settings,
				source,
				save,
				signal,
				onProgress: setProgress,
			});
			end('saved');
		} catch (error) {
			end(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		}
	};

	const exportAll = async (items: BatchFile[]) => {
		const destination = await openBatchDestination('music');
		if (!destination) return;
		for (const item of items) onStatus(item.id, null);
		const signal = start();
		try {
			const count = await exportAudioBatch({
				items,
				template: doc,
				settings,
				destination,
				signal,
				onStatus,
				onProgress: setProgress,
			});
			setExported(count);
			end(signal.aborted ? 'idle' : count > 0 ? 'saved' : 'failed');
		} catch {
			end('failed');
		}
	};

	const label = () => {
		if (status === 'saving') return m.exporting_percent({ percent: Math.floor(progress * 100) });
		if (status === 'saved') {
			return (
				<>
					<Check size={17} strokeWidth={2.4} aria-hidden="true" />
					{batch ? m.batch_saved_audio({ count: exported }) : m.saved()}
				</>
			);
		}
		return batch ? m.export_batch_audio_button({ count: batch.length }) : m.export_audio_button();
	};

	return (
		<>
			{status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full transition-[width] duration-200"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					onClick={() => void (batch ? exportAll(batch) : exportOne())}
					disabled={!ready}
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
					{m.export_audio_failed()}
				</p>
			)}
		</>
	);
}
