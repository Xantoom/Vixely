import { useEffect, useId } from 'react';
import { isShortened } from '@/document/kept';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { codecName } from '@/lib/format';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { FieldRow, NumberField, OptionList, Select } from '@/ui/fields';
import type { Size } from '../image/document';
import { isPictureEdited } from './document';
import {
	type AudioChoice,
	audioFits,
	CODEC_LABELS,
	CONTAINERS,
	encodableCodecs,
	FRAME_RATES,
	HEIGHTS,
	outputSize,
	readVideoSource,
	resolveAudio,
	type VideoContainer,
	type VideoCodecId,
	type VideoExportSettings,
	type VideoSource,
} from './export';
import { MuxTracks } from './MuxPanel';
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
				if (alive && source) adoptSource({ owner: opened.file, source, encodable });
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
	if (isPictureEdited(doc.picture)) return m.copy_blocked_picture();
	// A trim is copied as it is; passages removed inside need the video encoded again for now.
	if (doc.cuts.length > 0) return m.mux_cuts_later();
	return null;
}

/** Copy or convert: converting whenever the edits leave no choice. */
export function useExportMode(): 'copy' | 'encode' {
	const blocker = useCopyBlocker();
	const mode = useVideoEditor((state) => state.exportSettings?.mode ?? 'copy');
	return blocker ? 'encode' : mode;
}

/**
 * The container written: the chosen one when converting, the source's own when copying a trimmed
 * video (it goes through the converter), none when the tracks are simply copied.
 */
export function exportTarget(
	mode: 'copy' | 'encode',
	settings: VideoExportSettings | null,
	source: VideoSource | null,
	shortened: boolean,
): VideoContainer | null {
	if (mode === 'encode') return settings?.container ?? null;
	return shortened ? (source?.container ?? null) : null;
}

const SOURCE = 'source';

const CONTAINER_ORDER: VideoContainer[] = ['mp4', 'mkv', 'webm', 'mov'];

/** Pictures: container, codec, size, rate and bitrate. */
function VideoSettings({ upright }: { upright: Size }) {
	const settings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const set = useVideoEditor((state) => state.setExport);
	const picture = useVideoDoc().picture;
	const ids = { container: useId(), codec: useId(), height: useId(), rate: useId(), bitrate: useId() };
	if (!settings || !exportSource) return null;
	const { source, encodable } = exportSource;
	const full = outputSize(picture, upright, null);
	const size = outputSize(picture, upright, settings.height);

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
				<FieldRow label={m.field_height()} htmlFor={ids.height}>
					<Select
						id={ids.height}
						value={settings.height === null ? SOURCE : String(settings.height)}
						options={[
							{ value: SOURCE, label: `${full.height} p`, detail: m.encoding_copy() },
							...HEIGHTS.filter((height) => height < full.height).map((height) => ({
								value: String(height),
								label: `${height} p`,
								detail: `${outputSize(picture, upright, height).width} × ${height}`,
							})),
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
	const set = useVideoEditor((state) => state.setExport);
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
	const source = useVideoEditor((state) => state.exportSource);
	const set = useVideoEditor((state) => state.setExport);
	const doc = useVideoDoc();
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
					<VideoSettings upright={upright} />
					<AudioSettings />
				</>
			)}
			<MuxTracks
				opened={opened}
				target={exportTarget(mode, settings, source?.source ?? null, isShortened(doc))}
			/>
		</>
	);
}
