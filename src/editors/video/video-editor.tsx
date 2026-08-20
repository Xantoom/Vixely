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
	renderAndEncodeVideo,
	runConversion,
	type ContainerFormat,
} from "~/core/media";
import {
	codecIdFor,
	cuesAt,
	parseSubtitles,
	renderCues,
	serialiseSubtitles,
} from "~/core/subtitles";
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
			const container = doc.export.container as ContainerFormat;
			const name = outputName(doc.source.name, container);
			const destination = await pickSaveDestination(name, "video/mp4", container);
			if (destination === null) {
				setExporting(null);
				return;
			}

			const plan = planExportPath(doc);
			const embedding =
				doc.export.subtitleMode === "embed" && doc.subtitleTracks.some((track) => track.enabled);

			let result;
			if (plan.kind === "manual") {
				// Pixels change, so the export goes decode → graph → encode, which
				// is the same path the preview draws with (I1).
				const burnIn =
					doc.export.subtitleMode === "burn-in" && file !== null
						? await loadBurnInSubtitles(doc, file)
						: null;

				result = await renderAndEncodeVideo({
					document: doc,
					source: source.opened,
					container,
					destination,
					...(burnIn === null ? {} : { subtitleOverlayAt: burnIn }),
					onProgress: setExporting,
				});
			} else if (embedding && container === "mkv") {
				// Nothing touches the picture and subtitles have to be embedded:
				// our muxer copies video and audio byte for byte and writes the
				// subtitle tracks alongside them.
				result = await muxWithSubtitles(doc, source.opened, file, destination, setExporting);
			} else {
				result = await runConversion({
					source: source.opened,
					container,
					destination,
					trim: { startSec: doc.trimStartSec, endSec: doc.trimEndSec },
					onProgress: ({ ratio }) => setExporting(ratio),
				});
			}

			// A stream target already wrote to the file the user picked; only a
			// buffer target has anything left to hand over.
			if (result.blob !== null) download(result.blob, name);

			if (doc.export.subtitleMode === "sidecar" && file !== null) {
				await exportSidecarSubtitles(doc, file);
			}
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

							{/* Embedding only works in MKV; MP4 standardises neither
							    ASS nor PGS (ADR 004d), so the alternative is named
							    rather than the tracks being dropped quietly. */}
							{doc.export.subtitleMode === "embed" &&
								doc.export.container !== "mkv" &&
								doc.subtitleTracks.some((track) => track.enabled) && (
									<p className="text-xs text-[var(--warning)]">
										{t("video.embedNeedsMkv", {
											container: doc.export.container.toUpperCase(),
										})}
									</p>
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
	edit: VideoDocument,
	opened: Parameters<typeof extractPassthroughTracks>[0],
	file: File | null,
	destination: Awaited<ReturnType<typeof pickSaveDestination>>,
	onProgress: (ratio: number) => void,
): Promise<{ blob: Blob | null; bytes: number }> {
	onProgress(0.1);
	const passthrough = await extractPassthroughTracks(opened);
	onProgress(0.5);

	const startMs = edit.trimStartSec * 1000;
	const endMs = edit.trimEndSec * 1000;

	// The document's track switches decide what is written, and the trim decides
	// what survives: writing every packet would ignore both.
	const keptTracks = passthrough.tracks.filter((track) => {
		const selections = track.kind === "video" ? edit.videoTracks : edit.audioTracks;
		const selection = selections.find((candidate) => candidate.trackId === track.number);
		return selection === undefined ? true : selection.enabled && selection.action !== "drop";
	});
	const keptNumbers = new Set(keptTracks.map((track) => track.number));

	const packets = passthrough.packets
		.filter(
			(packet) =>
				keptNumbers.has(packet.trackNumber) &&
				packet.timestampMs >= startMs &&
				packet.timestampMs <= endMs,
		)
		// Rebased so the output starts at zero rather than at the in point.
		.map((packet) => ({ ...packet, timestampMs: packet.timestampMs - startMs }));

	const backend = createContainerBackend();
	const subtitlePackets = [];
	const subtitleTracks = [];

	if (file !== null) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		let number = Math.max(0, ...keptTracks.map((track) => track.number)) + 1;

		for (const selection of edit.subtitleTracks) {
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
				if (entry.timestampMs < startMs || entry.timestampMs > endMs) continue;
				// Shifted by the same amount as the picture, or they desync.
				subtitlePackets.push({
					trackNumber: number,
					timestampMs: entry.timestampMs - startMs,
					durationMs: entry.durationMs ?? 2000,
					isKeyframe: true,
					data: entry.payload,
				});
			}
			number += 1;
		}
	}

	onProgress(0.8);
	const blob = await backend.write({
		tracks: [...keptTracks, ...subtitleTracks],
		packets: [...packets, ...subtitlePackets],
		durationMs: endMs - startMs,
	});

	// Our muxer builds the file in memory, so a stream destination is written
	// here rather than by the muxer itself.
	if (destination !== null && destination.kind === "stream") {
		const writable = await destination.handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return { blob: null, bytes: blob.size };
	}

	return { blob, bytes: blob.size };
}

/**
 * Prepares the burn-in renderer.
 *
 * Cues are loaded once and drawn per frame into the same texture the preview
 * composites, so what is burnt in is what was on screen.
 */
async function loadBurnInSubtitles(
	edit: VideoDocument,
	file: File,
): Promise<((timeSec: number) => OffscreenCanvas | null) | null> {
	const backend = createContainerBackend();
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!backend.canRead(bytes)) return null;

	const selection = edit.subtitleTracks.find((track) => track.enabled);
	if (selection === undefined) return null;

	const payload = await backend.readSubtitlePayload(bytes, selection.trackId);
	// PGS would need its display sets composited rather than laid out as text.
	if (payload.track.format === null || payload.track.format === "pgs") return null;

	const decoder = new TextDecoder();
	const cues = payload.entries.map((entry, index) => ({
		id: `burn-${index}`,
		startMs: entry.timestampMs,
		endMs: entry.timestampMs + (entry.durationMs ?? 2000),
		text: decoder.decode(entry.payload),
		styleName: null,
		layer: 0,
		marginLeft: null,
		marginRight: null,
		marginVertical: null,
		effect: null,
	}));

	const header =
		payload.header === null || payload.track.format !== "ass"
			? null
			: parseSubtitles(decoder.decode(payload.header), "ass");

	const cache: { canvas: OffscreenCanvas | null } = { canvas: null };

	return (timeSec: number) => {
		const active = cuesAt(cues, timeSec * 1000);
		const rendered = renderCues(
			active,
			{
				width: edit.sourceWidth,
				height: edit.sourceHeight,
				playResX: Number(header?.scriptInfo["PlayResX"] ?? edit.sourceWidth),
				playResY: Number(header?.scriptInfo["PlayResY"] ?? edit.sourceHeight),
				styles: header?.styles ?? [],
			},
			cache.canvas ?? undefined,
		);
		if (rendered !== null) cache.canvas = rendered;
		return rendered;
	};
}

/**
 * Writes the subtitle tracks as separate files.
 *
 * The way to keep ASS styling when the container is MP4, which standardises
 * neither ASS nor PGS.
 */
async function exportSidecarSubtitles(edit: VideoDocument, file: File): Promise<void> {
	const backend = createContainerBackend();
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!backend.canRead(bytes)) return;

	const stem = edit.source.name.replace(/\.[^.]+$/u, "");
	const decoder = new TextDecoder();

	for (const selection of edit.subtitleTracks) {
		if (!selection.enabled) continue;
		const payload = await backend.readSubtitlePayload(bytes, selection.trackId);
		const format = payload.track.format;
		// PGS is images: there is no text file to write.
		if (format === null || format === "pgs") continue;

		const cues = payload.entries
			.filter((entry) => entry.timestampMs >= edit.trimStartSec * 1000)
			.map((entry, index) => ({
				id: `sidecar-${index}`,
				startMs: entry.timestampMs - edit.trimStartSec * 1000,
				endMs: entry.timestampMs - edit.trimStartSec * 1000 + (entry.durationMs ?? 2000),
				text: decoder.decode(entry.payload),
				styleName: null,
				layer: 0,
				marginLeft: null,
				marginRight: null,
				marginVertical: null,
				effect: null,
			}));

		const header =
			payload.header === null || format !== "ass"
				? null
				: parseSubtitles(decoder.decode(payload.header), "ass");

		const text = serialiseSubtitles(
			{
				format,
				cues,
				styles: header?.styles ?? [],
				scriptInfo: header?.scriptInfo ?? {},
				rawHeader: null,
			},
			format,
		);

		const suffix = payload.track.language === null ? "" : `.${payload.track.language}`;
		download(new Blob([text], { type: "text/plain;charset=utf-8" }), `${stem}${suffix}.${format}`);
	}
}

function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
