import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { formatSampleRate, groupDigits } from '@/lib/format';
import { outputName } from '@/media/save';
import { openSaveTarget } from '@/media/save-target';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { FieldRow, OptionList, Select, TextField } from '@/ui/fields';
import {
	AUDIO_FORMAT_ORDER,
	AUDIO_FORMATS,
	type AudioExportSettings,
	availableBitrates,
	outputBitrate,
	outputChannels,
	outputRate,
	type AudioFormat,
	canExport,
	exportAudio,
	type SourceFormat,
} from './export';
import { useAudioDoc, useAudioEditor } from './store';

const FORMAT_HINTS: Record<AudioFormat, () => string> = {
	mp3: () => m.audio_format_mp3(),
	aac: () => m.audio_format_aac(),
	opus: () => m.audio_format_opus(),
	flac: () => m.audio_format_flac(),
	wav: () => m.audio_format_wav(),
};

/** What a bitrate sounds like. Opus reaches the same quality at about two thirds of the bitrate. */
function bitrateHint(format: AudioFormat, kbps: number): string {
	const equivalent = format === 'opus' ? kbps * 1.5 : format === 'aac' ? kbps * 1.2 : kbps;
	if (equivalent >= 256) return m.bitrate_transparent();
	if (equivalent >= 180) return m.bitrate_high();
	if (equivalent >= 120) return m.bitrate_medium();
	return m.bitrate_low();
}

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

export function ExportPanel({ source, cover }: { source: SourceFormat; cover: ImageBitmap | null }) {
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
	const bitrates = availableBitrates(settings.format, rate);
	const bitrate = outputBitrate(settings, rate);

	return (
		<>
			<PanelTitle>{m.export_audio_title()}</PanelTitle>

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
				<p className="text-small text-muted">{FORMAT_HINTS[settings.format]()}</p>
				{opus === false && <p className="text-small text-muted">{m.opus_unavailable()}</p>}
			</div>

			<div className="grid gap-3.5">
				{info.bitrates.length > 0 && (
					<div className="grid gap-1.5">
						<FieldRow label={m.export_bitrate()} htmlFor={bitrateId}>
							<Select
								id={bitrateId}
								value={String(bitrate)}
								options={bitrates.map((kbps) => ({ value: String(kbps), label: `${kbps} kb/s` }))}
								onChange={(value) => {
									setExport({ bitrate: Number(value) });
								}}
							/>
						</FieldRow>
						<p className="text-small text-muted">{bitrateHint(settings.format, bitrate)}</p>
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
					<p className="text-small text-muted">
						{info.sampleRates.length === 1 ? m.sample_rate_opus() : m.sample_rate_hint()}
					</p>
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
						<p className="text-small text-muted">{m.bit_depth_hint()}</p>
					</div>
				)}
			</div>

			<section className="grid gap-3.5">
				<h3 className="text-ui text-ink-2 font-semibold">{m.export_metadata()}</h3>
				<TextField
					label={m.info_title()}
					value={settings.tags.title}
					onChange={(title) => {
						setExport({ tags: { ...settings.tags, title } });
					}}
				/>
				<TextField
					label={m.info_artist()}
					value={settings.tags.artist}
					onChange={(artist) => {
						setExport({ tags: { ...settings.tags, artist } });
					}}
				/>
				<TextField
					label={m.info_album()}
					value={settings.tags.album}
					onChange={(album) => {
						setExport({ tags: { ...settings.tags, album } });
					}}
				/>
				<CoverField source={cover} />
			</section>
		</>
	);
}

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

export function ExportFooter({ file, source }: { file: File; source: SourceFormat }) {
	const doc = useAudioDoc();
	const settings = useAudioEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [progress, setProgress] = useState(0);
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
		const info = AUDIO_FORMATS[settings.format];
		// The destination is asked first: the file picker only opens from the click itself.
		const save = await openSaveTarget(outputName(file.name, info.extension), {
			mime: info.mime,
			extension: info.extension,
			description: info.label,
		});
		if (!save) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		try {
			await exportAudio({
				file,
				doc,
				settings,
				source,
				save,
				signal: controller.signal,
				onProgress: setProgress,
			});
			setStatus('saved');
		} catch (error) {
			setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		} finally {
			abort.current = null;
		}
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
					onClick={() => void run()}
					disabled={status === 'saving'}
				>
					{status === 'saving' ? (
						m.exporting_percent({ percent: Math.floor(progress * 100) })
					) : status === 'saved' ? (
						<>
							<Check size={17} strokeWidth={2.4} aria-hidden="true" />
							{m.saved()}
						</>
					) : (
						m.export_audio_button()
					)}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.export_audio_failed()}
				</p>
			)}
		</>
	);
}
