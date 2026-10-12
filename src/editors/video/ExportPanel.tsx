import { useNavigate } from '@tanstack/react-router';
import { Film } from 'lucide-react';
import { useEffect, useId } from 'react';
import { isShortened, keptRanges } from '@/document/kept';
import { PanelTitle } from '@/editor/EditorLayout';
import { Group, Section } from '@/editor/panel-parts';
import { EDITORS } from '@/editors/registry';
import { codecName, formatBytes } from '@/lib/format';
import { detectGpu, type Gpu } from '@/media/gpu';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { BrandLogo } from '@/ui/BrandLogo';
import { Button } from '@/ui/Button';
import { FieldRow, NumberField, OptionList, Select } from '@/ui/fields';
import { carryVideoEdits } from '../gif/from-video';
import { fitRatio } from '../image/crop';
import { type ImageDoc, orientedSize, type Size } from '../image/document';
import { copiedRanges, copiesParts } from './copy-tracks';
import { pictureChange, timeShaped, videoLength } from './document';
import {
	type AudioChoice,
	audioFits,
	bitDepthOf,
	CODEC_LABELS,
	CONTAINERS,
	chooseEncoding,
	FRAME_RATES,
	HEIGHTS,
	outputSize,
	PRESET_ORDER,
	type Preset,
	type PresetId,
	PRESETS,
	planVideo,
	presetSettings,
	QUALITY_LEVELS,
	quantizerFor,
	type RateControl,
	readVideoSource,
	resolveAudio,
	shortSide,
	sizeLimits,
	type VideoCodecId,
	type VideoContainer,
	type VideoEncoderKind,
	type VideoExportSettings,
	videoEncoders,
} from './export';
import { muxContainer } from './mux';
import { MetadataSection } from './panels';
import { useVideoDoc, useVideoEditor } from './store';
import { SoundTracks, SubtitleTracks, TrackPages } from './Tracks';

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
		void Promise.all([
			readVideoSource(opened.file, opened.format),
			videoEncoders({ width, height }),
			detectGpu(),
		]).then(([source, encoders, gpu]) => {
			if (alive && source) {
				adoptSource({ owner: opened.file, source, encoders, gpu, shortSide: Math.min(width, height) });
			}
		});
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
	if (timeShaped(doc)) return m.copy_blocked_time();
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

const QUALITY_LABELS: Record<(typeof QUALITY_LEVELS)[number], () => string> = {
	1: () => m.quality_very_high(),
	0.75: () => m.quality_high(),
	0.5: () => m.quality_medium(),
	0.25: () => m.quality_low(),
	0: () => m.quality_very_low(),
};

const PRESET_GROUPS: Record<Preset['group'], () => string> = {
	messages: () => m.preset_group_messages(),
	vertical: () => m.preset_group_vertical(),
	social: () => m.preset_group_social(),
	video: () => m.preset_group_video(),
	general: () => m.preset_group_general(),
};

/** The encoder in short: its system name on the graphics card (`NVENC`), else "Processor". */
function encoderLabel(encoder: VideoEncoderKind, gpu: Gpu | null): string {
	if (encoder === 'software') return m.encoder_software_short();
	return gpu?.encoder ?? m.encoder_gpu_unknown();
}

/** A setting changed by hand: the settings are no longer a platform's, nor its bitrate ceiling. */
function useChangeExport() {
	const set = useVideoEditor((state) => state.setExport);
	return (change: Partial<VideoExportSettings>) => {
		set({ ...change, preset: null, bitrateCeiling: null });
	};
}

/** The pictures as a preset leaves them: cropped from the middle to its frame, if it has one. */
function presetPicture(picture: ImageDoc, upright: Size, id: PresetId): ImageDoc {
	const { aspect } = PRESETS[id];
	if (!aspect) return picture;
	const [width = 1, height = 1] = aspect.split(':').map(Number);
	const bounds = orientedSize(upright, picture.rotation);
	return { ...picture, crop: fitRatio({ x: 0, y: 0, ...bounds }, width / height) };
}

/**
 * Chooses a platform's settings. Those with a frame of their own (9:16 for TikTok) crop the
 * pictures to it from the middle; the size then follows from the crop.
 */
function useChoosePreset(upright: Size) {
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
		const encoder = useVideoEditor.getState().exportSettings?.encoder ?? null;
		set(presetSettings(id, exportSource.source, exportSource.encoders, height, encoder));
	};
}

/** What a preset gives, in short: the size limit, else the picture size. */
function presetDetail(id: PresetId, height: number): string {
	const { sizeLimit, maxHeight } = PRESETS[id];
	return sizeLimit && sizeLimit < 1000 ? m.size_mb({ size: sizeLimit }) : `${Math.min(height, maxHeight)} p`;
}

/** Why a preset sets what it does, in a sentence. */
function presetReason(id: PresetId): string {
	const preset = PRESETS[id];
	if (preset.group === 'messages')
		return preset.sizeLimit && preset.sizeLimit < 1000
			? m.preset_reason_limit({ name: preset.label, size: m.size_mb({ size: preset.sizeLimit }) })
			: m.preset_reason_plays({ name: preset.label });
	if (id === 'youtube' || id === 'shorts') return m.preset_reason_youtube();
	if (preset.group === 'general') return preset.codec === 'av1' ? m.preset_reason_web() : m.preset_reason_uhd();
	return m.preset_reason_upload({ name: preset.label });
}

/**
 * Everything worked out for the panel: the plan of the pictures, the sound's bitrate it leaves
 * room for, and what the source is.
 */
function usePlan(upright: Size) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const doc = useVideoDoc();
	if (!settings || !exportSource) return null;
	const { source } = exportSource;
	const sound = settings.audio === 'copy' ? (source.audioBitrate ?? settings.audioBitrate) : settings.audioBitrate;
	const audio = source.audioCodec ? sound : 0;
	const plan = planVideo({ settings, picture: doc.picture, upright, seconds: videoLength(doc), audio, source });
	return { settings, exportSource, plan, audio };
}

/** Where the video goes: a platform's settings in one choice, and why they are what they are. */
function Destination({ upright, batch = false }: { upright: Size; batch?: boolean }) {
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
	const preset = settings.preset ? PRESETS[settings.preset] : null;
	return (
		<Section title={m.export_destination()}>
			<div className="grid gap-2">
				<label htmlFor={id} className="sr-only">
					{m.export_destination()}
				</label>
				<Select
					id={id}
					label={m.export_destination()}
					value={settings.preset ?? NONE}
					options={[
						{ value: NONE, label: m.preset_custom(), detail: m.preset_custom_detail() },
						...presets.map((value) => ({
							value,
							label: PRESETS[value].label,
							detail: presetDetail(value, height),
							leading: <BrandLogo logo={PRESETS[value].logo} size={18} />,
							group: PRESET_GROUPS[PRESETS[value].group](),
						})),
					]}
					onChange={(value) => {
						if (value === NONE) set({ preset: null, bitrateCeiling: null });
						else choose(value);
					}}
				/>
				<p className="text-small text-muted text-pretty">
					{settings.preset && preset ? presetReason(settings.preset) : m.preset_custom_reason()}
				</p>
			</div>
		</Section>
	);
}

/** Size and rate of the pictures. */
function PictureFields({ upright }: { upright: Size }) {
	const planned = usePlan(upright);
	const set = useChangeExport();
	const picture = useVideoDoc().picture;
	const ids = { height: useId(), rate: useId() };
	if (!planned) return null;
	const { settings, exportSource, plan } = planned;
	const { source } = exportSource;
	const full = outputSize(picture, upright, null);
	const top = shortSide(outputSize(picture, upright, settings.height));
	const AUTO = 'auto';
	const adaptive = settings.adaptive && settings.sizeLimit !== null;
	return (
		<div className="grid gap-2.5">
			<FieldRow label={m.export_resolution()} htmlFor={ids.height}>
				<Select
					id={ids.height}
					value={adaptive ? AUTO : settings.height === null ? SOURCE : String(settings.height)}
					options={[
						...(settings.sizeLimit === null
							? []
							: [
									{
										value: AUTO,
										label: m.resolution_auto(),
										detail: m.resolution_auto_detail({ height: shortSide(plan.size) }),
									},
								]),
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
						if (value === AUTO) set({ adaptive: true, height: top < shortSide(full) ? top : null });
						else set({ adaptive: false, height: value === SOURCE ? null : Number(value) });
					}}
				/>
			</FieldRow>
			<FieldRow label={m.export_frame_rate()} htmlFor={ids.rate}>
				<Select
					id={ids.rate}
					value={settings.frameRate === null ? SOURCE : String(settings.frameRate)}
					options={[
						{
							value: SOURCE,
							label: source.frameRate ? `${source.frameRate} fps` : m.encoding_copy(),
							detail: source.frameRate ? m.encoding_copy() : undefined,
						},
						...FRAME_RATES.filter((rate) => !source.frameRate || rate < source.frameRate + 0.5).map(
							(rate) => ({ value: String(rate), label: `${rate} fps` }),
						),
					]}
					onChange={(value) => {
						set({ frameRate: value === SOURCE ? null : Number(value) });
					}}
				/>
			</FieldRow>
		</div>
	);
}

/** File format, encoder and codec, the codec with its bit depth. */
function EncodingFields() {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useChangeExport();
	const ids = { container: useId(), codec: useId(), encoder: useId() };
	if (!settings || !exportSource) return null;
	const { encoders, gpu } = exportSource;
	const containerCodecs = CONTAINERS[settings.container].codecs;
	// Codecs the chosen encoder can't write are not offered: AV1 only shows on the cards that
	// encode it.
	const codecs = containerCodecs.filter((codec) => encoders[settings.encoder].includes(codec));
	const gpuCodecs = containerCodecs.filter((codec) => encoders.gpu.includes(codec));
	const gpuBlocker =
		encoders.gpu.length === 0
			? m.encoder_gpu_none()
			: gpuCodecs.length === 0
				? m.encoder_gpu_container({ container: CONTAINERS[settings.container].label })
				: null;

	const chooseContainer = (container: VideoContainer) => {
		const encoding = chooseEncoding(encoders, CONTAINERS[container].codecs, settings.codec, settings.encoder);
		// AAC doesn't go in WebM; whether the sound can be copied follows from the container.
		const audio: AudioChoice = settings.audio === 'aac' && container === 'webm' ? 'opus' : settings.audio;
		set({ container, ...encoding, audio });
	};

	const chooseEncoder = (encoder: VideoEncoderKind) => {
		const offered = containerCodecs.filter((codec) => encoders[encoder].includes(codec));
		const codec = offered.includes(settings.codec) ? settings.codec : (offered[0] ?? settings.codec);
		set({ encoder, codec });
	};

	return (
		<div className="grid gap-2.5">
			<FieldRow label={m.export_format()} htmlFor={ids.container}>
				<Select
					id={ids.container}
					value={settings.container}
					options={CONTAINER_ORDER.map((container) => {
						const usable = CONTAINERS[container].codecs.some(
							(codec) => encoders.gpu.includes(codec) || encoders.software.includes(codec),
						);
						return {
							value: container,
							label: CONTAINERS[container].label,
							detail: CONTAINERS[container].codecs.map((codec) => CODEC_LABELS[codec]).join(' '),
							disabled: !usable,
							reason: usable ? undefined : m.container_unavailable(),
						};
					})}
					onChange={chooseContainer}
				/>
			</FieldRow>
			<FieldRow label={m.export_encoder()} htmlFor={ids.encoder}>
				<Select<VideoEncoderKind>
					id={ids.encoder}
					value={settings.encoder}
					options={[
						{
							value: 'gpu',
							label: gpu?.encoder ?? m.encoder_gpu_unknown(),
							detail: gpu?.name ?? m.encoder_gpu_detail(),
							disabled: gpuBlocker !== null,
							reason: gpuBlocker ?? undefined,
						},
						{
							value: 'software',
							label: m.encoder_software(),
							detail: m.encoder_software_detail(),
							disabled: !containerCodecs.some((codec) => encoders.software.includes(codec)),
							reason: m.encoder_software_none(),
						},
					]}
					onChange={chooseEncoder}
				/>
			</FieldRow>
			<FieldRow label={m.export_codec()} htmlFor={ids.codec}>
				<Select
					id={ids.codec}
					value={settings.codec}
					options={codecs.map((codec) => ({
						value: codec,
						label: CODEC_LABELS[codec],
						detail: `${encoderLabel(settings.encoder, gpu)}, ${m.bit_depth({ bits: bitDepthOf(encoders, codec, settings.encoder) })}`,
					}))}
					onChange={(codec) => {
						set({ codec });
					}}
				/>
			</FieldRow>
		</div>
	);
}

/** How the bitrate is set, and the size the file may not go over. */
function RateFields({ upright }: { upright: Size }) {
	const planned = usePlan(upright);
	const set = useChangeExport();
	const ids = { rateControl: useId(), level: useId(), limit: useId() };
	if (!planned) return null;
	const { settings, plan } = planned;
	return (
		<div className="grid gap-2.5">
			<FieldRow label={m.export_quality()} htmlFor={ids.rateControl}>
				<Select<RateControl>
					id={ids.rateControl}
					value={settings.rateControl}
					options={[
						{ value: 'auto', label: m.rate_auto(), detail: m.rate_auto_detail() },
						{ value: 'quality', label: m.rate_quality(), detail: m.rate_quality_detail() },
						{ value: 'bitrate', label: m.rate_bitrate(), detail: 'kb/s' },
					]}
					onChange={(rateControl) => {
						// A bitrate set by hand starts from the one the plan gave.
						set(rateControl === 'bitrate' ? { rateControl, bitrate: plan.bitrate } : { rateControl });
					}}
				/>
			</FieldRow>
			{settings.rateControl === 'quality' && (
				<FieldRow label={m.export_level()} htmlFor={ids.level}>
					<Select
						id={ids.level}
						value={String(settings.quality)}
						options={QUALITY_LEVELS.map((level) => ({
							value: String(level),
							label: QUALITY_LABELS[level](),
							detail: `${quantizerName(settings.codec)} ${quantizerFor(settings.codec, level)}`,
						}))}
						onChange={(value) => {
							set({ quality: Number(value) });
						}}
					/>
				</FieldRow>
			)}
			{settings.rateControl === 'bitrate' && (
				<FieldRow label={m.export_bitrate()} htmlFor={ids.level}>
					<NumberField
						id={ids.level}
						value={settings.bitrate}
						unit="kb/s"
						min={100}
						max={200_000}
						onCommit={(bitrate) => {
							set({ bitrate });
						}}
					/>
				</FieldRow>
			)}
			<FieldRow label={m.export_size_limit()} htmlFor={ids.limit}>
				<Select
					id={ids.limit}
					value={settings.sizeLimit === null ? NONE : String(settings.sizeLimit)}
					options={[
						{ value: NONE, label: m.size_limit_none() },
						...sizeLimits(settings.sizeLimit).map((limit) => ({
							value: String(limit),
							label: m.size_mb({ size: limit }),
						})),
					]}
					onChange={(value) => {
						set({ sizeLimit: value === NONE ? null : Number(value) });
					}}
				/>
			</FieldRow>
		</div>
	);
}

/** How the encoder counts its quantizer: QP, or AV1's and VP9's own scale. */
function quantizerName(codec: VideoCodecId): string {
	return codec === 'avc' || codec === 'hevc' ? 'QP' : 'Q';
}

/**
 * What comes out, always in view: the picture's size and depth, the bitrate and the file's
 * weight, or why the weight can't be told before the end.
 */
function Outcome({ upright }: { upright: Size }) {
	const planned = usePlan(upright);
	if (!planned) return null;
	const { settings, exportSource, plan } = planned;
	const depth = bitDepthOf(exportSource.encoders, settings.codec, settings.encoder);
	const rows: { label: string; value: string; tone?: 'danger' }[] = [
		{ label: m.export_size(), value: `${plan.size.width} × ${plan.size.height}, ${m.bit_depth({ bits: depth })}` },
		plan.constantQuality
			? { label: m.export_bitrate(), value: m.rate_follows_picture() }
			: { label: m.export_bitrate(), value: `${plan.bitrate} kb/s`, tone: plan.squeezed ? 'danger' : undefined },
		{
			label: m.export_estimate(),
			value:
				plan.estimate === null
					? m.estimate_unknown()
					: settings.sizeLimit === null
						? `≈ ${formatBytes(Math.round(plan.estimate * 1_000_000))}`
						: m.estimate_within({
								size: formatBytes(Math.round(plan.estimate * 1_000_000)),
								limit: m.size_mb({ size: settings.sizeLimit }),
							}),
		},
	];
	return (
		<section className="border-line grid gap-2 border-t pt-4" aria-label={m.export_outcome()}>
			<dl className="grid gap-1.5">
				{rows.map((row) => (
					<div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
						<dt className="text-ui text-ink-2">{row.label}</dt>
						<dd
							className={`tabular text-small text-right ${row.tone === 'danger' ? 'text-danger' : 'text-ink'}`}
						>
							{row.value}
						</dd>
					</div>
				))}
			</dl>
			{plan.squeezed && <p className="text-small text-danger text-pretty">{m.bitrate_squeezed()}</p>}
			{settings.encoder === 'gpu' && depth === 8 && (settings.codec === 'hevc' || settings.codec === 'av1') && (
				<p className="text-small text-muted text-pretty">{m.bit_depth_unavailable()}</p>
			)}
		</section>
	);
}

/**
 * The conversion's settings under the destination: folded once a platform has chosen them, open
 * when made by hand.
 */
function ConvertSettings({ upright, batch = false }: { upright: Size; batch?: boolean }) {
	// A batch's videos each have their own length and size: what comes out is told per video.
	const preset = useVideoEditor((state) => state.exportSettings?.preset ?? null);
	return (
		<>
			<Destination upright={upright} batch={batch} />
			<Group
				key={preset === null ? 'custom' : 'preset'}
				title={m.export_settings()}
				defaultOpen={preset === null}
			>
				<div className="grid gap-5">
					<div className="grid gap-2.5">
						<h4 className="text-small text-muted font-medium">{m.export_picture()}</h4>
						<PictureFields upright={upright} />
					</div>
					<div className="grid gap-2.5">
						<h4 className="text-small text-muted font-medium">{m.export_encoding()}</h4>
						<EncodingFields />
					</div>
					<div className="grid gap-2.5">
						<h4 className="text-small text-muted font-medium">{m.export_quality_size()}</h4>
						<RateFields upright={upright} />
					</div>
				</div>
			</Group>
			{!batch && <Outcome upright={upright} />}
		</>
	);
}

/**
 * Sound: copied as it is where it can be, else encoded again. `bare` gives the fields alone, for
 * the sound tracks' section to hold.
 */
function AudioSettings({ bare = false }: { bare?: boolean }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useChangeExport();
	const ids = { codec: useId(), bitrate: useId() };
	if (!settings || !exportSource) return null;
	const { source } = exportSource;
	const copyBlocker = audioFits(source, settings.container)
		? null
		: m.audio_copy_container({ container: CONTAINERS[settings.container].label });
	const choice = resolveAudio(settings, source);
	const fields = (
		<div className="grid gap-2.5">
			<FieldRow label={m.export_codec()} htmlFor={ids.codec}>
				<Select<AudioChoice>
					id={ids.codec}
					value={choice}
					options={[
						{
							value: 'copy',
							label: m.export_original({ value: source.audioCodec ? codecName(source.audioCodec) : '' }),
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
			{choice !== 'copy' && (
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
			)}
		</div>
	);
	return bare ? fields : <Section title={m.mux_audio()}>{fields}</Section>;
}

/** What sound tracks become unless their own page says otherwise: copied, or the encoding chosen. */
function useSoundDefault(mode: 'copy' | 'encode'): string {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	if (mode === 'copy' || !settings || !exportSource) return m.tracks_keep();
	const choice = resolveAudio(settings, exportSource.source);
	return choice === 'copy' ? m.tracks_keep() : `${choice === 'aac' ? 'AAC' : 'Opus'} ${settings.audioBitrate} kb/s`;
}

/** Opens the video in the GIF editor with the edits made here: its passage, speed, crop, looks and text. */
function ToGif({ opened }: { opened: OpenedFile }) {
	const doc = useVideoDoc();
	const navigate = useNavigate();
	const openFrom = useSession((state) => state.openFrom);
	return (
		<section className="border-line border-t pt-4">
			<Button
				className="w-full"
				onClick={() => {
					carryVideoEdits(opened.file, doc);
					openFrom('video', 'gif');
					void navigate({ to: EDITORS.gif.path });
				}}
			>
				<Film className="size-4.5" aria-hidden="true" />
				{m.export_to_gif()}
			</Button>
		</section>
	);
}

/**
 * Export of the video: as it is (its tracks copied, nothing re-encoded, the subtitles as the
 * subtitle editor left them), or converted with the edits. Every setting starts from the source.
 */
export function VideoExportPanel({
	opened,
	upright,
	onSubtitlesAdded,
}: {
	opened: OpenedFile;
	upright: Size;
	/** Subtitle files were added: they show over the video at once. */
	onSubtitlesAdded?: () => void;
}) {
	const blocker = useCopyBlocker();
	const mode = useExportMode();
	const settings = useVideoEditor((state) => state.exportSettings);
	const set = useVideoEditor((state) => state.setExport);
	const target = exportTarget(mode, settings);
	const burned = mode === 'encode' ? (settings?.burn ?? null) : null;
	const soundDefault = useSoundDefault(mode);
	return (
		<TrackPages opened={opened} target={target} burned={burned} soundDefault={soundDefault} editLines>
			{(open) => (
				<>
					<PanelTitle>{m.export()}</PanelTitle>
					<OptionList
						label={m.export_encoding()}
						value={mode}
						options={[
							{
								value: 'copy',
								label: m.encoding_copy(),
								description: blocker ?? m.encoding_copy_description(),
								detail: muxContainer(opened.format).toUpperCase(),
								disabled: blocker !== null,
							},
							{
								value: 'encode',
								label: m.encoding_convert(),
								description: m.encoding_convert_description(),
								detail: settings
									? `${CONTAINERS[settings.container].label}, ${CODEC_LABELS[settings.codec]}`
									: undefined,
								disabled: settings === null,
							},
						]}
						onChange={(value) => {
							set({ mode: value });
						}}
					/>
					{mode === 'encode' && <ConvertSettings upright={upright} />}
					<SoundTracks
						opened={opened}
						target={target}
						onOpen={open}
						settings={mode === 'encode' ? <AudioSettings bare /> : undefined}
					/>
					<SubtitleTracks
						opened={opened}
						target={target}
						burned={burned}
						onOpen={open}
						onAdded={onSubtitlesAdded}
					/>
					<MetadataSection opened={opened} />
					{opened.info?.video && <ToGif opened={opened} />}
				</>
			)}
		</TrackPages>
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
			<PanelTitle>{m.export()}</PanelTitle>
			<ConvertSettings upright={upright} batch />
			<AudioSettings />
		</>
	);
}
