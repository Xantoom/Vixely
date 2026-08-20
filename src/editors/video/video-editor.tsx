import { useCallback, useEffect, useMemo, useState } from "react";
import { createContainerBackend } from "~/core/container";
import {
	createVideoDocument,
	type TrackSelection,
	type VideoCodec,
	type VideoDocument,
	type VideoExportSpec,
} from "~/core/document";
import { exportExceedsCeiling, estimateExportBytes } from "~/core/environment";
import {
	collectVideoExportWarnings,
	CONTAINER_VIDEO_CODECS,
	extractPassthroughTracks,
	outputName,
	pickSaveDestination,
	planExportPath,
	runConversion,
	type ContainerFormat,
} from "~/core/media";
import { codecIdFor } from "~/core/subtitles";
import { formatBytes, formatTimecode } from "~/i18n/format.ts";
import { AppShell } from "~/ui/app-shell.tsx";
import { useLocale, useTranslate } from "~/ui/hooks/use-translate.ts";
import { Button } from "~/ui/primitives/button.tsx";
import { CollapsibleSection } from "~/ui/primitives/collapsible-section.tsx";
import { Field } from "~/ui/primitives/field.tsx";
import { NumberInput } from "~/ui/primitives/number-input.tsx";
import { Progress } from "~/ui/primitives/progress.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { Toggle } from "~/ui/primitives/toggle.tsx";
import { DropZone } from "../shared/drop-zone.tsx";
import { EditorLayout } from "../shared/editor-layout.tsx";
import { EnvironmentNotice } from "../shared/environment-notice.tsx";
import { HistoryControls } from "../shared/history-controls.tsx";
import { MediaCanvas } from "../shared/media-canvas.tsx";
import { PlayerTransport } from "../shared/player-transport.tsx";
import { useDocumentHistory } from "../shared/use-document-history.ts";
import { useEnvironment } from "../shared/use-environment.ts";
import * as commands from "./commands.ts";
import { useVideoPlayback, useVideoSource } from "./use-video-source.ts";
import { VideoPreview } from "./video-preview.tsx";

const ACCEPTED = [".mp4", ".mkv", ".webm", ".mov", ".m4v", ".ts", ".avi"] as const;
const CONTAINERS: readonly VideoExportSpec["container"][] = ["mp4", "mkv", "webm", "mov"];

const CODEC_LABELS: Record<VideoCodec, string> = {
	avc: "H.264 / AVC",
	hevc: "H.265 / HEVC",
	vp8: "VP8",
	vp9: "VP9",
	av1: "AV1",
	prores: "ProRes",
};

const EMPTY_SOURCE = { id: "", name: "", byteLength: 0, mimeType: "" };

export function VideoEditor() {
	const t = useTranslate();
	const locale = useLocale();
	const environment = useEnvironment();

	const [file, setFile] = useState<File | null>(null);
	const [ready, setReady] = useState(false);
	const [exporting, setExporting] = useState<number | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);

	const source = useVideoSource(file);
	const history = useDocumentHistory<VideoDocument>(createVideoDocument(EMPTY_SOURCE, 0, 1, 1));
	const reset = history.reset;

	const playback = useVideoPlayback(source.reader, source.probe?.durationSec ?? 0);

	useEffect(() => {
		const probe = source.probe;
		if (probe === null || file === null || probe.videoTracks.length === 0) return;

		const primary = probe.videoTracks[0];
		const created: VideoDocument = {
			...createVideoDocument(
				{
					id: crypto.randomUUID(),
					name: file.name,
					byteLength: file.size,
					mimeType: file.type,
				},
				probe.durationSec,
				primary?.codedWidth ?? 1920,
				primary?.codedHeight ?? 1080,
			),
			videoTracks: probe.videoTracks.map(toSelection),
			audioTracks: probe.audioTracks.map(toSelection),
			// Read by core/container: Mediabunny reports none of these.
			subtitleTracks: source.subtitleTracks.map((track) => ({
				trackId: track.id,
				enabled: true,
				label: track.name,
				language: track.language,
				action: "copy" as const,
			})),
		};

		const handle = setTimeout(() => {
			reset(created);
			setReady(true);
			playback.seek(0);
		}, 0);
		return () => clearTimeout(handle);
		// `playback` changes every render; only the probe should re-seed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source.probe, source.subtitleTracks, file, reset]);

	const doc = ready ? history.document : null;

	const warnings = useMemo(
		() =>
			doc === null
				? []
				: collectVideoExportWarnings(
						doc,
						source.subtitleTracks
							.map((track) => track.format)
							.filter((format): format is "srt" | "vtt" | "ass" | "pgs" => format !== null),
					),
		[doc, source.subtitleTracks],
	);

	const estimatedBytes = useMemo(() => {
		if (doc === null) return 0;
		const kept = doc.trimEndSec - doc.trimStartSec;
		// A rough bitrate from the quality slider; enough to warn before the work.
		const videoBits = 1_000_000 + doc.export.quality * 24_000_000;
		return estimateExportBytes(kept, videoBits, 192_000);
	}, [doc]);

	const exportVideo = useCallback(async () => {
		if (doc === null || source.opened === null) return;
		setExportError(null);
		setExporting(0);

		try {
			const container = doc.export.container;
			const name = outputName(doc.source.name, container as ContainerFormat);
			const destination = await pickSaveDestination(name, "video/mp4", container);
			if (destination === null) {
				setExporting(null);
				return;
			}

			const plan = planExportPath(doc);
			const wantsSubtitles =
				doc.export.subtitleMode === "embed" && doc.subtitleTracks.some((track) => track.enabled);

			if (plan.kind === "conversion" && wantsSubtitles && container === "mkv") {
				// The path that makes the whole container layer worthwhile: the
				// picture and the sound are copied byte for byte and the subtitle
				// tracks are written alongside them.
				const blob = await muxWithSubtitles(doc, source.opened, file, setExporting);
				download(blob, name);
				return;
			}

			const result = await runConversion({
				source: source.opened,
				container: container as ContainerFormat,
				destination,
				...(plan.kind === "manual"
					? {
							video: {
								codec: doc.export.codec,
								quality: doc.export.quality,
								...(doc.export.width === null ? {} : { width: doc.export.width }),
								...(doc.export.height === null ? {} : { height: doc.export.height }),
								...(doc.export.frameRate === null ? {} : { frameRate: doc.export.frameRate }),
							},
						}
					: {}),
				trim: { startSec: doc.trimStartSec, endSec: doc.trimEndSec },
				onProgress: ({ ratio }) => setExporting(ratio),
			});

			if (result.blob !== null) download(result.blob, name);
		} catch (cause) {
			setExportError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setExporting(null);
		}
	}, [doc, source.opened, file]);

	if (doc === null) {
		return (
			<AppShell editor="video">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold">{t("editor.video")}</h1>
						<p className="text-sm text-[var(--text-muted)]">{t("editor.video.description")}</p>
					</div>

					<EnvironmentNotice limitations={environment.limitations} />

					<DropZone accept={ACCEPTED} onFile={setFile} />

					{source.loading && <Progress label={t("status.loading")} value={null} />}

					{source.error !== null && (
						<p role="alert" className="text-sm text-[var(--danger)]">
							{t("error.decodeFailed", { name: file?.name ?? "", reason: source.error })}
						</p>
					)}
				</div>
			</AppShell>
		);
	}

	const keptDuration = doc.trimEndSec - doc.trimStartSec;

	return (
		<AppShell
			editor="video"
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
						{doc.sourceWidth}×{doc.sourceHeight} · {formatTimecode(doc.durationSec)}
					</span>
				</div>
			}
		>
			<EditorLayout
				canvas={
					<MediaCanvas
						contentWidth={doc.sourceWidth}
						contentHeight={doc.sourceHeight}
						description={t("canvas.description", {
							width: doc.sourceWidth,
							height: doc.sourceHeight,
						})}
					>
						<VideoPreview document={doc} frame={playback.frame} />
					</MediaCanvas>
				}
				strip={
					<PlayerTransport
						playing={playback.playing}
						onTogglePlay={playback.togglePlay}
						positionSec={playback.positionSec}
						durationSec={doc.durationSec}
						onSeek={playback.seek}
						volume={1}
						muted={false}
						onVolumeChange={() => undefined}
						onToggleMute={() => undefined}
						speed={1}
						onSpeedChange={() => undefined}
						precision={playback.precision}
						onPrecisionChange={playback.setPrecision}
						onStep={playback.step}
						showMilliseconds
						tracks={doc.audioTracks.map((track) => ({
							id: track.trackId,
							label: track.label ?? track.language ?? `#${track.trackId}`,
						}))}
					/>
				}
				panel={
					<div className="flex flex-col">
						<CollapsibleSection title={t("video.trim")} defaultOpen>
							<div className="grid grid-cols-2 gap-2">
								<Field label={t("video.trimStart")}>
									<NumberInput
										aria-label={t("video.trimStart")}
										value={Number(doc.trimStartSec.toFixed(3))}
										min={0}
										max={doc.durationSec}
										step={0.001}
										suffix="s"
										onChange={(start) => history.run(commands.setTrim(start, doc.trimEndSec))}
									/>
								</Field>
								<Field label={t("video.trimEnd")}>
									<NumberInput
										aria-label={t("video.trimEnd")}
										value={Number(doc.trimEndSec.toFixed(3))}
										min={0}
										max={doc.durationSec}
										step={0.001}
										suffix="s"
										onChange={(end) => history.run(commands.setTrim(doc.trimStartSec, end))}
									/>
								</Field>
							</div>

							<div className="flex gap-2">
								<Button
									size="sm"
									variant="secondary"
									onPress={() =>
										history.run(commands.setTrim(playback.positionSec, doc.trimEndSec))
									}
								>
									{t("video.setIn")}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onPress={() =>
										history.run(commands.setTrim(doc.trimStartSec, playback.positionSec))
									}
								>
									{t("video.setOut")}
								</Button>
							</div>

							<p className="tabular text-2xs text-[var(--text-subtle)]">
								{t("video.trimmedDuration", { duration: formatTimecode(keptDuration, true) })}
							</p>
						</CollapsibleSection>

						<CollapsibleSection title={t("video.tracks")} defaultOpen>
							<TrackGroup
								title={t("video.videoTracks")}
								tracks={doc.videoTracks}
								onToggle={(id) => history.run(commands.toggleTrack("videoTracks", id))}
							/>
							<TrackGroup
								title={t("video.audioTracks")}
								tracks={doc.audioTracks}
								onToggle={(id) => history.run(commands.toggleTrack("audioTracks", id))}
							/>
							<TrackGroup
								title={t("video.subtitleTracks")}
								tracks={doc.subtitleTracks}
								onToggle={(id) => history.run(commands.toggleTrack("subtitleTracks", id))}
							/>
						</CollapsibleSection>

						<CollapsibleSection title={t("export.title")} defaultOpen>
							<Select<VideoExportSpec["container"]>
								label={t("export.container")}
								value={doc.export.container}
								onChange={(container) => history.run(commands.setVideoExport({ container }))}
								options={CONTAINERS.map((container) => ({
									id: container,
									label: container.toUpperCase(),
								}))}
							/>

							<Select<VideoCodec>
								label={t("export.codec")}
								value={doc.export.codec}
								onChange={(codec) => history.run(commands.setVideoExport({ codec }))}
								options={CONTAINER_VIDEO_CODECS[doc.export.container as ContainerFormat].map(
									(codec) => ({ id: codec, label: CODEC_LABELS[codec] }),
								)}
							/>

							<Slider
								label={t("export.quality")}
								value={doc.export.quality}
								defaultValue={0.7}
								min={0.1}
								max={1}
								step={0.05}
								onChange={(quality) => history.run(commands.setVideoExport({ quality }))}
								onChangeEnd={history.seal}
							/>

							<Select<VideoExportSpec["subtitleMode"]>
								label={t("video.subtitleMode")}
								value={doc.export.subtitleMode}
								onChange={(subtitleMode) => history.run(commands.setVideoExport({ subtitleMode }))}
								options={[
									{ id: "embed", label: t("video.subtitleMode.embed") },
									{ id: "burn-in", label: t("video.subtitleMode.burnIn") },
									{ id: "sidecar", label: t("video.subtitleMode.sidecar") },
									{ id: "none", label: t("video.subtitleMode.none") },
								]}
							/>

							<Toggle
								label="Fast start"
								isSelected={doc.export.fastStart}
								onChange={(fastStart) => history.run(commands.setVideoExport({ fastStart }))}
							/>

							{/* Every limitation is stated before the work starts. */}
							{warnings.map((warning) => (
								<p
									key={`${warning.code}-${warning.detail}`}
									className={
										warning.code === "reencode-required"
											? "text-xs text-[var(--text-muted)]"
											: "text-xs text-[var(--warning)]"
									}
								>
									{warning.detail}
								</p>
							))}

							{planExportPath(doc).kind === "conversion" && (
								<p className="text-xs text-[var(--success)]">{t("video.remuxOnly")}</p>
							)}

							<Button
								variant="primary"
								isDisabled={exporting !== null}
								onPress={() => {
									void exportVideo();
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
								{t("export.estimatedSize", { size: formatBytes(locale, estimatedBytes) })}
							</p>

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
					</div>
				}
			/>
		</AppShell>
	);
}

function TrackGroup({
	title,
	tracks,
	onToggle,
}: {
	title: string;
	tracks: readonly TrackSelection[];
	onToggle: (trackId: number) => void;
}) {
	if (tracks.length === 0) return null;

	return (
		<div className="flex flex-col gap-1">
			<p className="text-2xs uppercase tracking-wide text-[var(--text-subtle)]">{title}</p>
			{tracks.map((track) => (
				<Toggle
					key={track.trackId}
					label={track.label ?? track.language ?? `#${track.trackId}`}
					isSelected={track.enabled}
					onChange={() => onToggle(track.trackId)}
				/>
			))}
		</div>
	);
}

function toSelection(track: { id: number; name: string | null; languageCode: string | null }) {
	return {
		trackId: track.id,
		enabled: true,
		label: track.name,
		language: track.languageCode,
		action: "copy" as const,
	};
}

/**
 * Writes the file through our own muxer so subtitle tracks can be embedded.
 *
 * Mediabunny writes no subtitle track other than WebVTT, so this is the only
 * way to produce an MKV carrying ASS or PGS — and it does it without touching
 * the picture or the sound.
 */
async function muxWithSubtitles(
	document_: VideoDocument,
	opened: Parameters<typeof extractPassthroughTracks>[0],
	file: File | null,
	onProgress: (ratio: number) => void,
): Promise<Blob> {
	onProgress(0.1);
	const passthrough = await extractPassthroughTracks(opened);
	onProgress(0.5);

	const backend = createContainerBackend();
	const subtitlePackets = [];
	const subtitleTracks = [];

	if (file !== null) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		let number = passthrough.tracks.length + 1;

		for (const selection of document_.subtitleTracks) {
			if (!selection.enabled) continue;
			const payload = await backend.readSubtitlePayload(bytes, selection.trackId);
			subtitleTracks.push({
				number,
				kind: "subtitle" as const,
				codecId: codecIdFor(payload.track.format ?? "srt"),
				...(payload.header === null ? {} : { codecPrivate: payload.header }),
				...(payload.track.language === null ? {} : { language: payload.track.language }),
				...(payload.track.name === null ? {} : { name: payload.track.name }),
			});

			for (const entry of payload.entries) {
				subtitlePackets.push({
					trackNumber: number,
					timestampMs: entry.timestampMs,
					durationMs: entry.durationMs ?? 2000,
					isKeyframe: true,
					data: entry.payload,
				});
			}
			number += 1;
		}
	}

	onProgress(0.8);
	return backend.write({
		tracks: [...passthrough.tracks, ...subtitleTracks],
		packets: [...passthrough.packets, ...subtitlePackets],
		durationMs: passthrough.durationMs,
	});
}

function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
