import { useCallback, useEffect, useMemo, useState } from "react";
import {
	chainIsPassthrough,
	defaultEqualizer,
	limitGainToPeak,
	measureLoudness,
	renderAudioDocument,
	totalDuration,
	type LoudnessMeasurement,
} from "~/core/audio";
import {
	createAudioDocument,
	type AudioCodec,
	type AudioDocument,
	type AudioExportSpec,
} from "~/core/document";
import { exportExceedsCeiling } from "~/core/environment";
import { createAnalysisWorker, spawn, type AnalysisWorkerApi } from "~/core/workers";
import {
	channelsOf,
	CONTAINER_AUDIO_CODECS,
	encodeAudioBuffer,
	outputName,
	planExportPath,
	pickSaveDestination,
	runConversion,
	type ContainerFormat,
} from "~/core/media";
import { formatBytes, formatTimecode } from "~/i18n/format.ts";
import { AppShell } from "~/ui/app-shell.tsx";
import { useLocale, useTranslate } from "~/ui/hooks/use-translate.ts";
import { Button } from "~/ui/primitives/button.tsx";
import { CollapsibleSection } from "~/ui/primitives/collapsible-section.tsx";
import { Field } from "~/ui/primitives/field.tsx";
import { Progress } from "~/ui/primitives/progress.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { Toggle } from "~/ui/primitives/toggle.tsx";
import { DropZone } from "../shared/drop-zone.tsx";
import { EditorLayout } from "../shared/editor-layout.tsx";
import { EnvironmentNotice } from "../shared/environment-notice.tsx";
import { HistoryControls } from "../shared/history-controls.tsx";
import { PlayerTransport } from "../shared/player-transport.tsx";
import { SpectrumAnalyzer } from "../shared/spectrum-analyzer.tsx";
import { useDocumentHistory } from "../shared/use-document-history.ts";
import { useEnvironment } from "../shared/use-environment.ts";
import { Waveform } from "../shared/waveform.tsx";
import * as commands from "./commands.ts";
import { useAudioPlayback, useAudioSource } from "./use-audio-source.ts";

const ACCEPTED = [
	".mp3",
	".aac",
	".flac",
	".wav",
	".ogg",
	".opus",
	".m4a",
	".ac3",
	".dts",
	".mka",
] as const;

/** Audio-only containers; `mov` is video territory and is not offered here. */
type AudioContainer = AudioExportSpec["container"];

const CONTAINERS: readonly AudioContainer[] = ["mp4", "mkv", "ogg", "mp3", "wav", "flac"];

const CODEC_LABELS: Record<AudioCodec, string> = {
	aac: "AAC",
	opus: "Opus",
	mp3: "MP3",
	vorbis: "Vorbis",
	flac: "FLAC",
	ac3: "AC-3",
	eac3: "E-AC-3",
	dts: "DTS",
	"pcm-s16": "PCM 16-bit",
	"pcm-s24": "PCM 24-bit",
	"pcm-f32": "PCM float",
};

const EMPTY_SOURCE = { id: "", name: "", byteLength: 0, mimeType: "" };

export function AudioEditor() {
	const t = useTranslate();
	const locale = useLocale();
	const environment = useEnvironment();

	const [file, setFile] = useState<File | null>(null);
	const [ready, setReady] = useState<AudioDocument | null>(null);
	const [exporting, setExporting] = useState<number | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [measurement, setMeasurement] = useState<LoudnessMeasurement | null>(null);

	const source = useAudioSource(file);
	const playback = useAudioPlayback(source.buffer, source.reader, source.probe?.durationSec ?? 0);
	const history = useDocumentHistory<AudioDocument>(ready ?? createAudioDocument(EMPTY_SOURCE, 0));
	const doc = ready === null ? null : history.document;

	const openFile = useCallback((next: File) => {
		setFile(next);
		setMeasurement(null);
		setExportError(null);
		setReady(null);
	}, []);

	// Built in an effect, not in the body: `crypto.randomUUID` would make the
	// render impure and StrictMode's double render would produce two documents.
	const reset = history.reset;
	useEffect(() => {
		if (file === null || source.probe === null || source.loading) return;
		const created: AudioDocument = {
			...createAudioDocument(
				{
					id: crypto.randomUUID(),
					name: file.name,
					byteLength: file.size,
					mimeType: file.type,
				},
				source.probe.durationSec,
			),
			segments: [
				{
					id: crypto.randomUUID(),
					sourceId: file.name,
					startSec: 0,
					endSec: source.probe.durationSec,
					gainDb: 0,
					fadeInSec: 0,
					fadeOutSec: 0,
				},
			],
			equalizer: defaultEqualizer((index) => `band-${index}`),
			selectedTrackId: source.probe.audioTracks[0]?.id ?? 0,
		};
		// Queued rather than set synchronously: this runs once per file, and a
		// synchronous pair of setStates inside an effect costs an extra render.
		const handle = setTimeout(() => {
			setReady(created);
			reset(created);
		}, 0);
		return () => clearTimeout(handle);
	}, [file, source.probe, source.loading, reset]);

	const measure = useCallback(async () => {
		const buffer = source.buffer;
		if (buffer === null) return;
		const target = doc?.loudness.targetLufs ?? -14;

		// R128 over an hour of samples is exactly the work that must not sit on
		// the thread drawing the preview (I5).
		try {
			const handle = await spawn<AnalysisWorkerApi>(createAnalysisWorker);
			try {
				// Copies, because the views belong to the live AudioBuffer and
				// transferring them would detach it mid-playback.
				const channels = channelsOf(buffer).map((channel) => new Float32Array(channel));
				setMeasurement(await handle.proxy.measureLoudness(channels, buffer.sampleRate, target));
			} finally {
				handle.terminate();
			}
		} catch {
			// A blocked worker must not cost the feature; the main thread can do it.
			setMeasurement(measureLoudness(channelsOf(buffer), buffer.sampleRate, target));
		}
	}, [source.buffer, doc?.loudness.targetLufs]);

	const exportAudio = useCallback(async () => {
		if (doc === null || source.opened === null) return;
		setExportError(null);
		setExporting(0);

		try {
			const container = doc.export.container;
			const name = outputName(doc.source.name, container);
			const destination = await pickSaveDestination(name, "application/octet-stream", container);
			if (destination === null) {
				setExporting(null);
				return;
			}

			const plan = planExportPath(doc);
			const passthrough =
				plan.kind === "conversion" && chainIsPassthrough(doc, source.probe?.durationSec ?? 0);

			const result = passthrough
				? // Nothing touches the samples: remux instead of re-encoding, so the
					// export costs no generation of quality.
					await runConversion({
						source: source.opened,
						container,
						destination,
						audio: { codec: doc.export.codec, quality: doc.export.quality },
						onProgress: ({ ratio }) => setExporting(ratio),
					})
				: // The document changes the samples, so the very chain the preview
					// plays is rendered offline and encoded (I1 applied to audio).
					await encodeProcessed(doc, source.buffer, container, destination, setExporting);

			if (result.blob !== null) downloadBlob(result.blob, name);
		} catch (cause) {
			setExportError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setExporting(null);
		}
	}, [doc, source.opened, source.buffer, source.probe]);

	const availableCodecs = useMemo(
		() =>
			doc === null
				? []
				: CONTAINER_AUDIO_CODECS[doc.export.container as ContainerFormat].map((codec) => ({
						id: codec,
						label: CODEC_LABELS[codec],
						disabled: !environment.canReencodeAudio,
						...(environment.canReencodeAudio ? {} : { disabledReason: "no encoder" }),
					})),
		[doc, environment.canReencodeAudio],
	);

	if (doc === null) {
		return (
			<AppShell editor="audio">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold">{t("editor.audio")}</h1>
						<p className="text-sm text-[var(--text-muted)]">{t("editor.audio.description")}</p>
					</div>

					<EnvironmentNotice limitations={environment.limitations} />

					<DropZone accept={ACCEPTED} onFile={openFile} />

					{source.loading && (
						<Progress
							label={t("status.decoding", {
								percent: Math.round(source.progress * 100),
							})}
							value={source.progress}
						/>
					)}

					{source.error !== null && (
						<p role="alert" className="text-sm text-[var(--danger)]">
							{t("error.decodeFailed", {
								name: file?.name ?? "",
								reason: source.error,
							})}
						</p>
					)}
				</div>
			</AppShell>
		);
	}

	const duration = totalDuration(doc.segments);
	const path = planExportPath(doc);
	const estimatedBytes = estimateAudioBytes(doc, duration);

	return (
		<AppShell
			editor="audio"
			toolbar={
				<div className="flex items-center gap-2">
					<HistoryControls
						canUndo={history.canUndo}
						canRedo={history.canRedo}
						undoLabel={history.undoLabel}
						redoLabel={history.redoLabel}
						onUndo={history.undo}
						onRedo={history.redo}
					/>
					<span aria-hidden className="h-4 w-px bg-[var(--border)]" />
					<span className="truncate text-xs text-[var(--text-muted)]">{doc.source.name}</span>
					<span className="tabular text-2xs text-[var(--text-subtle)]">
						{formatTimecode(duration)}
					</span>
				</div>
			}
		>
			<EditorLayout
				canvas={
					<div className="flex h-full flex-col gap-3 p-4">
						<div className="min-h-32 flex-1 rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--bg-raised)] p-2">
							<Waveform
								label={t("audio.waveform")}
								peaks={source.peaks}
								positionSec={playback.positionSec}
								durationSec={duration}
								onSeek={playback.seek}
							/>
						</div>
						<div className="h-24 rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--bg-raised)] p-2">
							<SpectrumAnalyzer label={t("audio.spectrum")} data={playback.spectrum} />
						</div>
					</div>
				}
				strip={
					<PlayerTransport
						playing={playback.playing}
						onTogglePlay={playback.togglePlay}
						positionSec={playback.positionSec}
						durationSec={duration}
						onSeek={playback.seek}
						volume={playback.volume}
						muted={playback.muted}
						onVolumeChange={playback.setVolume}
						onToggleMute={playback.toggleMute}
						speed={playback.speed}
						onSpeedChange={playback.setSpeed}
						tracks={source.probe?.audioTracks.map((track) => ({
							id: track.id,
							label: track.name ?? track.languageCode ?? `#${track.id}`,
						}))}
						selectedTrackId={doc.selectedTrackId}
						onTrackChange={(id) => history.run(commands.selectTrack(id))}
					/>
				}
				panel={
					<div className="flex flex-col">
						<CollapsibleSection title={t("audio.segments")} defaultOpen>
							<Button
								size="sm"
								variant="secondary"
								onPress={() => history.run(commands.splitAtTime(playback.positionSec))}
							>
								{t("audio.split")}
							</Button>
							<ul className="flex flex-col gap-2">
								{doc.segments.map((segment, index) => (
									<li
										key={segment.id}
										className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--border)] p-2"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="tabular text-2xs text-[var(--text-muted)]">
												{formatTimecode(segment.startSec)} – {formatTimecode(segment.endSec)}
											</span>
											{doc.segments.length > 1 && (
												<Button
													size="sm"
													variant="ghost"
													onPress={() => history.run(commands.deleteSegment(segment.id))}
												>
													{t("audio.deleteSegment")}
												</Button>
											)}
										</div>
										<Slider
											label={t("audio.gain")}
											value={segment.gainDb}
											defaultValue={0}
											min={-24}
											max={24}
											step={0.5}
											onChange={(gain) => history.run(commands.setSegmentGain(segment.id, gain))}
											onChangeEnd={history.seal}
										/>
										<div className="grid grid-cols-2 gap-2">
											<Slider
												label={t("audio.fadeIn")}
												value={segment.fadeInSec}
												defaultValue={0}
												min={0}
												max={10}
												step={0.1}
												showInput={false}
												onChange={(seconds) =>
													history.run(commands.setSegmentFade(segment.id, "in", seconds))
												}
												onChangeEnd={history.seal}
											/>
											<Slider
												label={t("audio.fadeOut")}
												value={segment.fadeOutSec}
												defaultValue={0}
												min={0}
												max={10}
												step={0.1}
												showInput={false}
												onChange={(seconds) =>
													history.run(commands.setSegmentFade(segment.id, "out", seconds))
												}
												onChangeEnd={history.seal}
											/>
										</div>
										{index > 0 && (
											<Button
												size="sm"
												variant="ghost"
												onPress={() => history.run(commands.reorderSegments(index, index - 1))}
											>
												↑
											</Button>
										)}
									</li>
								))}
							</ul>
						</CollapsibleSection>

						<CollapsibleSection title={t("audio.equalizer")}>
							{doc.equalizer.map((band) => (
								<Slider
									key={band.id}
									label={`${band.frequency} Hz`}
									value={band.gainDb}
									defaultValue={0}
									min={-12}
									max={12}
									step={0.5}
									onChange={(gain) => history.run(commands.setEqualizerBand(band.id, gain))}
									onChangeEnd={history.seal}
								/>
							))}
							<Button
								size="sm"
								variant="ghost"
								onPress={() => history.run(commands.resetEqualizer())}
							>
								{t("action.reset")}
							</Button>
						</CollapsibleSection>

						<CollapsibleSection title={t("audio.normalise")}>
							<Toggle
								label={t("audio.normalise")}
								description={t("audio.normaliseHint")}
								isSelected={doc.loudness.enabled}
								onChange={(enabled) => {
									history.run(commands.setLoudness({ enabled }));
									if (enabled) void measure();
								}}
							/>
							{doc.loudness.enabled && (
								<>
									<Slider
										label={t("audio.targetLoudness")}
										value={doc.loudness.targetLufs}
										defaultValue={-14}
										min={-31}
										max={-5}
										step={0.5}
										onChange={(targetLufs) => history.run(commands.setLoudness({ targetLufs }))}
										onChangeEnd={() => {
											history.seal();
											void measure();
										}}
									/>
									{measurement !== null && (
										<LoudnessReadout
											measurement={measurement}
											ceilingDb={doc.loudness.truePeakDb}
										/>
									)}
								</>
							)}
						</CollapsibleSection>

						<CollapsibleSection title={t("export.title")} defaultOpen>
							<Select<AudioContainer>
								label={t("export.container")}
								value={doc.export.container}
								onChange={(container) => {
									const codecs = CONTAINER_AUDIO_CODECS[container];
									history.run(
										commands.setAudioExport({
											container,
											// Keep the codec only if the new container carries it.
											codec: codecs.includes(doc.export.codec)
												? doc.export.codec
												: (codecs[0] ?? "aac"),
										}),
									);
								}}
								options={CONTAINERS.map((container) => ({
									id: container,
									label: container.toUpperCase(),
								}))}
							/>
							<Select<AudioCodec>
								label={t("export.codec")}
								value={doc.export.codec}
								onChange={(codec) => history.run(commands.setAudioExport({ codec }))}
								options={availableCodecs}
							/>
							<Slider
								label={t("export.quality")}
								value={doc.export.quality}
								defaultValue={0.7}
								min={0.1}
								max={1}
								step={0.05}
								onChange={(quality) => history.run(commands.setAudioExport({ quality }))}
								onChangeEnd={history.seal}
							/>

							{path.kind === "conversion" && (
								<p className="text-xs text-[var(--success)]">{t("audio.remuxOnly")}</p>
							)}

							{/* Processing needs the whole track in memory; remuxing
							    does not, so only the manual path is blocked. */}
							{source.windowed && path.kind === "manual" && (
								<p className="text-xs text-[var(--warning)]">{t("audio.tooLongToProcess")}</p>
							)}

							<Button
								variant="primary"
								isDisabled={exporting !== null || (source.windowed && path.kind === "manual")}
								onPress={() => {
									void exportAudio();
								}}
							>
								{exporting === null ? t("action.export") : t("status.working")}
							</Button>

							{exporting !== null && (
								<Progress
									label={t("export.progress", { percent: Math.round(exporting * 100) })}
									value={exporting}
								/>
							)}

							<p className="tabular text-2xs text-[var(--text-subtle)]">
								{t("export.estimatedSize", {
									size: formatBytes(locale, estimatedBytes),
								})}
							</p>

							{/* The warning has to arrive before the work, never after
							    forty minutes of encoding (plan §10). */}
							{exportExceedsCeiling(environment, estimatedBytes) && (
								<p className="text-xs text-[var(--warning)]">
									{t("environment.exportTooLarge", {
										size: formatBytes(locale, estimatedBytes),
									})}
								</p>
							)}

							{exportError !== null && (
								<p role="alert" className="text-xs text-[var(--danger)]">
									{t("export.failed", { reason: exportError })}
								</p>
							)}
						</CollapsibleSection>

						<div className="border-t border-[var(--border)] p-3">
							<Field label={t("audio.sampleRate")}>
								<span className="tabular text-xs text-[var(--text-muted)]">
									{source.buffer?.sampleRate ?? 0} Hz · {source.buffer?.numberOfChannels ?? 0} ch
								</span>
							</Field>
						</div>
					</div>
				}
			/>
		</AppShell>
	);
}

function LoudnessReadout({
	measurement,
	ceilingDb,
}: {
	measurement: LoudnessMeasurement;
	ceilingDb: number;
}) {
	const t = useTranslate();
	const limited = limitGainToPeak(measurement.gainToTargetDb, measurement.samplePeakDb, ceilingDb);

	return (
		<div className="flex flex-col gap-1">
			<p className="tabular text-xs text-[var(--text-muted)]">
				{t("audio.measured", { value: measurement.integratedLufs.toFixed(1) })}
			</p>
			{limited.limited && (
				<p className="text-xs text-[var(--warning)]">
					{t("audio.gainLimited", { value: limited.gainDb.toFixed(1) })}
				</p>
			)}
		</div>
	);
}

/**
 * Renders the document's chain offline, then encodes the result.
 *
 * Split out so the export path reads as the two steps it is: process, then
 * write. The processing is the same code the preview uses.
 */
async function encodeProcessed(
	document_: AudioDocument,
	buffer: AudioBuffer | null,
	container: AudioContainer,
	destination: Awaited<ReturnType<typeof pickSaveDestination>>,
	onProgress: (ratio: number) => void,
) {
	if (buffer === null) throw new Error("the audio has not finished decoding");
	if (destination === null) throw new Error("no destination");

	onProgress(0.1);
	const rendered = await renderAudioDocument(document_, buffer);
	onProgress(0.6);

	return encodeAudioBuffer({
		buffer: rendered.buffer,
		container,
		codec: document_.export.codec,
		quality: document_.export.quality,
		destination,
		onProgress: (ratio) => onProgress(0.6 + ratio * 0.4),
	});
}

/** Rough size, enough to warn before the work rather than after it. */
function estimateAudioBytes(document_: AudioDocument, durationSec: number): number {
	const lossless = document_.export.codec === "flac" || document_.export.codec.startsWith("pcm-");
	const bitsPerSecond = lossless ? 900_000 : 64_000 + document_.export.quality * 256_000;
	return Math.round((bitsPerSecond * durationSec) / 8);
}

function downloadBlob(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
