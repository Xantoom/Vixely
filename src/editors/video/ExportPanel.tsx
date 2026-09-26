import { useEffect, useId } from 'react';
import { isShortened, keptRanges, outputDuration } from '@/document/kept';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { codecName } from '@/lib/format';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { FieldRow, NumberField, OptionList, Select } from '@/ui/fields';
import { fitRatio } from '../image/crop';
import { type ImageDoc, orientedSize, type Size } from '../image/document';
import { copiedRanges, copiesParts } from './copy-tracks';
import { pictureChange } from './document';
import {
	type AudioChoice,
	audioFits,
	bitrateForSize,
	CODEC_LABELS,
	CONTAINERS,
	encodableCodecs,
	FRAME_RATES,
	HEIGHTS,
	outputSize,
	PRESET_ORDER,
	type PresetId,
	PRESETS,
	presetSettings,
	QUALITY_LEVELS,
	readVideoSource,
	resolveAudio,
	shortSide,
	SIZE_LIMITS,
	type VideoContainer,
	type VideoCodecId,
	type VideoExportSettings,
} from './export';
import { MetadataSection, TrackSummary } from './panels';
import { useVideoDoc, useVideoEditor } from './store';

/** Reads what the export starts from, once per file: the source's codec, bitrate and rate. */
export function useExportSource(opened: OpenedFile | null, upright: Size | null) {
	const owner = useVideoEditor((state) => state.owner);
	const adoptSource = useVideoEditor((state) => state.adoptSource);
	const width = upright?.width ?? 0;
	const height = upright?.height ?? 0;
	useEffect(() => {
		if (!opened || width === 0 || owner !== opened.file) return;
		if (useVideoEditor.getState().exportSource?.owner === opened.file) return;
		let alive = true;
		void Promise.all([readVideoSource(opened.file, opened.format), encodableCodecs({ width, height })]).then(
			([source, encodable]) => {
				if (alive && source) {
					adoptSource({ owner: opened.file, source, encodable, shortSide: Math.min(width, height) });
				}
			},
		);
		return () => {
			alive = false;
		};
	}, [opened, width, height, owner, adoptSource]);
}

/** Why the video can't be written as it is, without encoding it again; null when it can. */
export function useCopyBlocker(): string | null {
	const doc = useVideoDoc();
	const burn = useVideoEditor((state) => state.exportSettings?.burn ?? null);
	if (pictureChange(doc.picture) === 'drawn') return m.copy_blocked_picture();
	return burn ? m.copy_blocked_burn() : null;
}

/**
 * While exporting as it is, reads what the copy will really hold, for the timeline to show what
 * the key frames keep of the passages removed.
 */
export function useCopiedRanges(file: File | null, active: boolean) {
	const doc = useVideoDoc();
	const mode = useExportMode();
	const container = useVideoEditor((state) => state.exportSource?.source.container ?? null);
	const setCopied = useVideoEditor((state) => state.setCopied);
	const wanted =
		active &&
		mode === 'copy' &&
		container !== null &&
		isShortened(doc) &&
		copiesParts(container, doc.cuts.length > 0);
	const key = wanted ? JSON.stringify(keptRanges(doc)) : null;
	useEffect(() => {
		if (!file || key === null) {
			setCopied(null);
			return;
		}
		let alive = true;
		// The key stands for these ranges.
		const ranges = keptRanges(useVideoEditor.getState().history.present);
		const timer = setTimeout(() => {
			void copiedRanges(file, ranges)
				.then((copied) => {
					if (alive) setCopied(copied);
				})
				.catch(() => undefined);
		}, 250);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [file, key, setCopied]);
}

/** Copy or convert: converting whenever the edits leave no choice. */
export function useExportMode(): 'copy' | 'encode' {
	const blocker = useCopyBlocker();
	const mode = useVideoEditor((state) => state.exportSettings?.mode ?? 'copy');
	return blocker ? 'encode' : mode;
}

/**
 * The container written when converting; copying keeps the source's kind (MKV for Matroska and
 * WebM, MP4 for MP4 and QuickTime).
 */
export function exportTarget(mode: 'copy' | 'encode', settings: VideoExportSettings | null): VideoContainer | null {
	return mode === 'encode' ? (settings?.container ?? null) : null;
}

const SOURCE = 'source';

const CONTAINER_ORDER: VideoContainer[] = ['mp4', 'mkv', 'webm', 'mov'];

const NONE = 'none';

/** Below this video bitrate (kb/s), pictures come out blurry. */
const LOW_BITRATE = 300;

const QUALITY_LABELS: Record<(typeof QUALITY_LEVELS)[number], () => string> = {
	1: () => m.quality_very_high(),
	0.75: () => m.quality_high(),
	0.5: () => m.quality_medium(),
	0.25: () => m.quality_low(),
	0: () => m.quality_very_low(),
};

/** A setting changed by hand: the settings are no longer a platform's. */
function useChangeExport() {
	const set = useVideoEditor((state) => state.setExport);
	return (change: Partial<VideoExportSettings>) => {
		set({ ...change, preset: null });
	};
}

/** Settings made for the places videos are sent to, filled in with one choice. */
/**
 * Chooses a platform's settings. Those with a frame of their own (9:16 for TikTok) crop the
 * pictures to it from the middle; the size then follows from the crop.
 */
/** The pictures as a preset leaves them: cropped from the middle to its frame, if it has one. */
export function presetPicture(picture: ImageDoc, upright: Size, id: PresetId): ImageDoc {
	const { aspect } = PRESETS[id];
	if (!aspect) return picture;
	const [width = 1, height = 1] = aspect.split(':').map(Number);
	const bounds = orientedSize(upright, picture.rotation);
	return { ...picture, crop: fitRatio({ x: 0, y: 0, ...bounds }, width / height) };
}

export function useChoosePreset(upright: Size) {
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useVideoEditor((state) => state.setExport);
	const apply = useVideoEditor((state) => state.apply);
	const setAspect = useVideoEditor((state) => state.setCropAspect);
	return (id: PresetId) => {
		if (!exportSource) return;
		const { aspect } = PRESETS[id];
		const picture = presetPicture(useVideoEditor.getState().history.present.picture, upright, id);
		if (aspect) {
			apply((doc) => ({ ...doc, picture: { ...doc.picture, crop: picture.crop } }));
			setAspect(aspect);
		}
		const height = shortSide(outputSize(picture, upright, null));
		set(presetSettings(id, exportSource.source, exportSource.encodable, height));
	};
}

/** What a preset gives, in short: the size limit, else the picture size. */
export function presetDetail(id: PresetId, height: number): string {
	const { sizeLimit, maxHeight } = PRESETS[id];
	return sizeLimit ? m.size_mb({ size: sizeLimit }) : `${Math.min(height, maxHeight)} p`;
}

/** Settings made for the places videos are sent to, filled in with one choice. */
function PresetSettings({ upright, batch = false }: { upright: Size; batch?: boolean }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useVideoEditor((state) => state.setExport);
	const choose = useChoosePreset(upright);
	const picture = useVideoDoc().picture;
	const id = useId();
	if (!settings || !exportSource) return null;
	const height = shortSide(outputSize(picture, upright, null));
	// A batch keeps each video's own frame: presets that crop are chosen per video.
	const presets = batch ? PRESET_ORDER.filter((preset) => !PRESETS[preset].aspect) : PRESET_ORDER;
	return (
		<Section title={m.export_preset()}>
			<FieldRow label={m.export_preset_for()} htmlFor={id}>
				<Select
					id={id}
					value={settings.preset ?? NONE}
					options={[
						{ value: NONE, label: m.preset_custom() },
						...presets.map((preset) => ({
							value: preset,
							label: PRESETS[preset].label,
							detail: presetDetail(preset, height),
						})),
					]}
					onChange={(value) => {
						if (value === NONE) set({ preset: null });
						else choose(value);
					}}
				/>
			</FieldRow>
		</Section>
	);
}

/** Pictures: container, codec, size, rate and bitrate. */
function VideoSettings({ upright }: { upright: Size }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useChangeExport();
	const doc = useVideoDoc();
	const picture = doc.picture;
	const ids = {
		container: useId(),
		codec: useId(),
		height: useId(),
		rate: useId(),
		limit: useId(),
		rateControl: useId(),
		bitrate: useId(),
	};
	if (!settings || !exportSource) return null;
	const { source, encodable } = exportSource;
	const full = outputSize(picture, upright, null);
	const size = outputSize(picture, upright, settings.height);
	// What a size limit leaves the pictures, the main sound track taking its share.
	const sound = settings.audio === 'copy' ? (source.audioBitrate ?? settings.audioBitrate) : settings.audioBitrate;
	const limited =
		settings.sizeLimit === null
			? null
			: bitrateForSize(settings.sizeLimit, outputDuration(doc), source.audioCodec ? sound : 0);

	const chooseContainer = (container: VideoContainer) => {
		const codecs = CONTAINERS[container].codecs;
		const codec: VideoCodecId = codecs.includes(settings.codec)
			? settings.codec
			: (codecs.find((candidate) => encodable.includes(candidate)) ?? codecs[0] ?? 'avc');
		// AAC doesn't go in WebM; whether the sound can be copied follows from the container.
		const audio: AudioChoice = settings.audio === 'aac' && container === 'webm' ? 'opus' : settings.audio;
		set({ container, codec, audio });
	};

	return (
		<Section title={m.mux_video()}>
			<div className="grid gap-2.5">
				<FieldRow label={m.export_container()} htmlFor={ids.container}>
					<Select
						id={ids.container}
						value={settings.container}
						options={CONTAINER_ORDER.map((container) => ({
							value: container,
							label: CONTAINERS[container].label,
						}))}
						onChange={chooseContainer}
					/>
				</FieldRow>
				<FieldRow label={m.export_codec()} htmlFor={ids.codec}>
					<Select
						id={ids.codec}
						value={settings.codec}
						options={CONTAINERS[settings.container].codecs.map((codec) => ({
							value: codec,
							label: CODEC_LABELS[codec],
							disabled: !encodable.includes(codec),
							reason: encodable.includes(codec)
								? undefined
								: m.codec_unavailable({ codec: CODEC_LABELS[codec] }),
						}))}
						onChange={(codec) => {
							set({ codec });
						}}
					/>
				</FieldRow>
				<FieldRow label={m.export_resolution()} htmlFor={ids.height}>
					<Select
						id={ids.height}
						value={settings.height === null ? SOURCE : String(settings.height)}
						options={[
							{ value: SOURCE, label: `${shortSide(full)} p`, detail: m.encoding_copy() },
							...HEIGHTS.filter((height) => height < shortSide(full)).map((height) => {
								const scaled = outputSize(picture, upright, height);
								return {
									value: String(height),
									label: `${height} p`,
									detail: `${scaled.width} × ${scaled.height}`,
								};
							}),
						]}
						onChange={(value) => {
							set({ height: value === SOURCE ? null : Number(value) });
						}}
					/>
				</FieldRow>
				<FieldRow label={m.info_frame_rate()} htmlFor={ids.rate}>
					<Select
						id={ids.rate}
						value={settings.frameRate === null ? SOURCE : String(settings.frameRate)}
						options={[
							{
								value: SOURCE,
								label: source.frameRate ? `${source.frameRate} fps` : m.encoding_copy(),
								detail: source.frameRate ? m.encoding_copy() : undefined,
							},
							...FRAME_RATES.map((rate) => ({ value: String(rate), label: `${rate} fps` })),
						]}
						onChange={(value) => {
							set({ frameRate: value === SOURCE ? null : Number(value) });
						}}
					/>
				</FieldRow>
				<FieldRow label={m.export_size_limit()} htmlFor={ids.limit}>
					<Select
						id={ids.limit}
						value={settings.sizeLimit === null ? NONE : String(settings.sizeLimit)}
						options={[
							{ value: NONE, label: m.size_limit_none() },
							...SIZE_LIMITS.map((limit) => ({
								value: String(limit),
								label: m.size_mb({ size: limit }),
							})),
						]}
						onChange={(value) => {
							set({ sizeLimit: value === NONE ? null : Number(value) });
						}}
					/>
				</FieldRow>
				{limited === null && (
					<FieldRow label={m.export_rate_control()} htmlFor={ids.rateControl}>
						<Select
							id={ids.rateControl}
							value={settings.rateControl}
							options={[
								{ value: 'bitrate' as const, label: m.rate_bitrate() },
								{ value: 'quality' as const, label: m.rate_quality() },
							]}
							onChange={(rateControl) => {
								set({ rateControl });
							}}
						/>
					</FieldRow>
				)}
				{limited === null && settings.rateControl === 'quality' ? (
					<FieldRow label={m.export_quality()} htmlFor={ids.bitrate}>
						<Select
							id={ids.bitrate}
							value={String(settings.quality)}
							options={QUALITY_LEVELS.map((level) => ({
								value: String(level),
								label: QUALITY_LABELS[level](),
							}))}
							onChange={(value) => {
								set({ quality: Number(value) });
							}}
						/>
					</FieldRow>
				) : limited === null ? (
					<FieldRow label={m.export_bitrate()} htmlFor={ids.bitrate}>
						<NumberField
							id={ids.bitrate}
							value={settings.bitrate}
							unit="kb/s"
							min={100}
							max={200_000}
							onCommit={(bitrate) => {
								set({ bitrate });
							}}
						/>
					</FieldRow>
				) : (
					<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
						<span className="text-ui text-ink-2">{m.export_bitrate()}</span>
						<span
							className={`tabular font-mono text-[12.5px] ${limited < LOW_BITRATE ? 'text-danger' : ''}`}
							title={limited < LOW_BITRATE ? m.bitrate_low() : undefined}
						>
							{limited} kb/s
						</span>
					</div>
				)}
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
					<span className="text-ui text-ink-2">{m.export_size()}</span>
					<span className="tabular font-mono text-[12.5px]">
						{size.width} × {size.height}
					</span>
				</div>
			</div>
		</Section>
	);
}

/** Sound: copied as it is where it can be, else encoded again. */
function AudioSettings() {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useChangeExport();
	const cuts = useVideoDoc().cuts.length > 0;
	const ids = { codec: useId(), bitrate: useId() };
	if (!settings || !exportSource) return null;
	const { source } = exportSource;
	const fits = audioFits(source, settings.container);
	const copyBlocker = cuts
		? m.audio_copy_cuts()
		: fits
			? null
			: m.audio_copy_container({ container: CONTAINERS[settings.container].label });
	const choice = resolveAudio(settings, source, cuts);
	return (
		<Section title={m.mux_audio()}>
			<div className="grid gap-2.5">
				<FieldRow label={m.export_codec()} htmlFor={ids.codec}>
					<Select<AudioChoice>
						id={ids.codec}
						value={choice}
						options={[
							{
								value: 'copy',
								label: m.export_original({
									value: source.audioCodec ? codecName(source.audioCodec) : '',
								}),
								disabled: copyBlocker !== null,
								reason: copyBlocker ?? undefined,
							},
							...(settings.container === 'webm' ? [] : [{ value: 'aac' as const, label: 'AAC' }]),
							{ value: 'opus', label: 'Opus' },
						]}
						onChange={(audio) => {
							set({ audio });
						}}
					/>
				</FieldRow>
				<FieldRow label={m.export_bitrate()} htmlFor={ids.bitrate}>
					<NumberField
						id={ids.bitrate}
						value={settings.audioBitrate}
						unit="kb/s"
						min={32}
						max={512}
						onCommit={(audioBitrate) => {
							set({ audioBitrate });
						}}
					/>
				</FieldRow>
			</div>
		</Section>
	);
}

/**
 * Export of the video: as it is (its tracks copied, nothing re-encoded, the subtitles as the
 * subtitle editor left them), or converted with the edits. Every setting starts from the source.
 */
export function VideoExportPanel({ opened, upright }: { opened: OpenedFile; upright: Size }) {
	const blocker = useCopyBlocker();
	const mode = useExportMode();
	const settings = useVideoEditor((state) => state.exportSettings);
	const set = useVideoEditor((state) => state.setExport);
	return (
		<>
			<PanelTitle>{m.export_video_title()}</PanelTitle>
			<OptionList
				label={m.export_encoding()}
				value={mode}
				options={[
					{
						value: 'copy',
						label: m.encoding_copy(),
						detail: opened.format.toUpperCase(),
						disabled: blocker !== null,
						reason: blocker ?? undefined,
					},
					{
						value: 'encode',
						label: m.encoding_convert(),
						detail: settings
							? `${CONTAINERS[settings.container].label} ${CODEC_LABELS[settings.codec]}`
							: undefined,
						disabled: settings === null,
					},
				]}
				onChange={(value) => {
					set({ mode: value });
				}}
			/>
			{mode === 'encode' && (
				<>
					<PresetSettings upright={upright} />
					<VideoSettings upright={upright} />
					<AudioSettings />
				</>
			)}
			<TrackSummary opened={opened} />
			<MetadataSection opened={opened} />
		</>
	);
}

/** The settings every video of a batch is converted with; tracks and edits stay each file's own. */
export function VideoBatchPanel({ upright }: { upright: Size }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const set = useVideoEditor((state) => state.setExport);
	// A batch is always converted: copied as they are, the files would come out unchanged.
	useEffect(() => {
		if (settings && settings.mode !== 'encode') set({ mode: 'encode' });
	}, [settings, set]);
	return (
		<>
			<PanelTitle>{m.export_video_title()}</PanelTitle>
			<PresetSettings upright={upright} batch />
			<VideoSettings upright={upright} />
			<AudioSettings />
		</>
	);
}
