import { useCallback, useEffect, useMemo, useState } from "react";
import type { GifDither, GifDocument } from "~/core/document";
import { exportExceedsCeiling } from "~/core/environment";
import { formatBytes, formatTimecode } from "~/i18n/format.ts";
import { AppShell } from "~/ui/app-shell.tsx";
import { useLocale, useTranslate } from "~/ui/hooks/use-translate.ts";
import { Button } from "~/ui/primitives/button.tsx";
import { CollapsibleSection } from "~/ui/primitives/collapsible-section.tsx";
import { IconButton } from "~/ui/primitives/icon-button.tsx";
import { Progress } from "~/ui/primitives/progress.tsx";
import { SegmentedControl } from "~/ui/primitives/segmented-control.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { DropZone } from "../shared/drop-zone.tsx";
import { EditorLayout } from "../shared/editor-layout.tsx";
import { EnvironmentNotice } from "../shared/environment-notice.tsx";
import { FrameStrip } from "../shared/frame-strip.tsx";
import { HistoryControls } from "../shared/history-controls.tsx";
import { MediaCanvas } from "../shared/media-canvas.tsx";
import { useDocumentHistory } from "../shared/use-document-history.ts";
import { useEnvironment } from "../shared/use-environment.ts";
import * as commands from "./commands.ts";
import {
	estimateGifBytes,
	extractFrame,
	renderAndEncodeGif,
	useGifPlayback,
	useGifSource,
} from "./use-gif-source.ts";
import { GifPreview } from "./gif-preview.tsx";

const ACCEPTED = [".gif"] as const;
const EMPTY_SOURCE = { id: "", name: "", byteLength: 0, mimeType: "" };

export function GifEditor() {
	const t = useTranslate();
	const locale = useLocale();
	const environment = useEnvironment();

	const [file, setFile] = useState<File | null>(null);
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [playing, setPlaying] = useState(true);
	const [exporting, setExporting] = useState<number | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [manualIndex, setManualIndex] = useState<number | null>(null);

	const source = useGifSource(file);
	const history = useDocumentHistory<GifDocument>(createEmpty());
	const [ready, setReady] = useState(false);

	// Seeded in an effect: the decode finishes asynchronously, and resetting the
	// history during render would make the render impure.
	const reset = history.reset;
	useEffect(() => {
		const decoded = source.document;
		if (decoded === null) return;
		const handle = setTimeout(() => {
			reset(decoded);
			setReady(true);
		}, 0);
		return () => clearTimeout(handle);
	}, [source.document, reset]);

	const doc = ready ? history.document : null;

	const playbackIndex = useGifPlayback(doc?.frames ?? [], playing && manualIndex === null);
	const currentIndex = manualIndex ?? playbackIndex;
	const currentFrame = doc?.frames[currentIndex];
	const currentBitmap =
		currentFrame === undefined ? undefined : source.bitmaps.get(currentFrame.id);

	const toggleSelection = useCallback((id: string, additive: boolean) => {
		setSelected((current) => {
			if (!additive) return new Set([id]);
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const exportGif = useCallback(async () => {
		if (doc === null) return;
		setExportError(null);
		setExporting(0);
		try {
			const blob = await renderAndEncodeGif(doc, source.bitmaps, setExporting);
			download(blob, `${doc.source.name.replace(/\.[^.]+$/u, "")}.gif`);
		} catch (cause) {
			setExportError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setExporting(null);
		}
	}, [doc, source.bitmaps]);

	const saveFrame = useCallback(async () => {
		if (doc === null || currentBitmap === undefined) return;
		const blob = await extractFrame(currentBitmap, doc);
		download(blob, `${doc.source.name.replace(/\.[^.]+$/u, "")}-${currentIndex + 1}.png`);
	}, [doc, currentBitmap, currentIndex]);

	const estimatedBytes = useMemo(
		() =>
			doc === null
				? 0
				: estimateGifBytes(
						doc.frames.length,
						doc.resize?.width ?? doc.sourceWidth,
						doc.resize?.height ?? doc.sourceHeight,
						doc.export.colors,
					),
		[doc],
	);

	if (doc === null) {
		return (
			<AppShell editor="gif">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold">{t("editor.gif")}</h1>
						<p className="text-sm text-[var(--text-muted)]">{t("editor.gif.description")}</p>
					</div>

					<EnvironmentNotice limitations={environment.limitations} />

					<DropZone accept={ACCEPTED} onFile={setFile} />

					{source.loading && (
						<Progress label={t("gif.decoding", { count: source.decodedCount })} value={null} />
					)}

					{source.error !== null && (
						<p role="alert" className="text-sm text-[var(--danger)]">
							{source.error === "no-decoder"
								? t("gif.noDecoder")
								: t("error.decodeFailed", {
										name: file?.name ?? "",
										reason: source.error,
									})}
						</p>
					)}
				</div>
			</AppShell>
		);
	}

	const totalMs = commands.totalDurationMs(doc.frames);

	return (
		<AppShell
			editor="gif"
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
						{t("gif.frameCount", {
							count: doc.frames.length,
							duration: formatTimecode(totalMs / 1000, true),
						})}
					</span>
				</div>
			}
		>
			<EditorLayout
				rail={
					<>
						<IconButton
							label={playing ? t("player.pause") : t("player.play")}
							onPress={() => {
								setPlaying((value) => !value);
								setManualIndex(null);
							}}
							active={playing}
						>
							<svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="fill-current">
								{playing ? (
									<>
										<rect x="3.5" y="2.5" width="3.5" height="11" rx="0.5" />
										<rect x="9" y="2.5" width="3.5" height="11" rx="0.5" />
									</>
								) : (
									<path d="M4 2.6a.5.5 0 0 1 .77-.42l8 5.4a.5.5 0 0 1 0 .84l-8 5.4A.5.5 0 0 1 4 13.4Z" />
								)}
							</svg>
						</IconButton>
						<IconButton
							label={t("command.rotate")}
							onPress={() => history.run(commands.rotateGif(90))}
						>
							<svg
								aria-hidden
								width="16"
								height="16"
								viewBox="0 0 16 16"
								className="fill-none stroke-current stroke-[1.4]"
							>
								<path d="M12 6a5 5 0 1 0-1 5" strokeLinecap="round" />
								<path d="M12 2.5V6H8.5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</IconButton>
					</>
				}
				canvas={
					<MediaCanvas
						contentWidth={doc.resize?.width ?? doc.sourceWidth}
						contentHeight={doc.resize?.height ?? doc.sourceHeight}
						description={t("canvas.description", {
							width: doc.resize?.width ?? doc.sourceWidth,
							height: doc.resize?.height ?? doc.sourceHeight,
						})}
					>
						<GifPreview document={doc} bitmap={currentBitmap} />
					</MediaCanvas>
				}
				strip={
					<FrameStrip
						label={t("gif.frames")}
						frames={doc.frames}
						thumbnails={source.bitmaps}
						selectedIds={selected}
						currentIndex={currentIndex}
						onSelect={(id, additive) => {
							toggleSelection(id, additive);
							setManualIndex(doc.frames.findIndex((frame) => frame.id === id));
							setPlaying(false);
						}}
						onMove={(from, to) => history.run(commands.moveFrame(from, to))}
					/>
				}
				panel={
					<div className="flex flex-col">
						<CollapsibleSection title={t("gif.frames")} defaultOpen>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="secondary"
									onPress={() => setSelected(new Set(doc.frames.map((frame) => frame.id)))}
								>
									{t("gif.selectAll")}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									isDisabled={selected.size === 0 || selected.size >= doc.frames.length}
									onPress={() => {
										history.run(commands.removeFrames([...selected]));
										setSelected(new Set());
									}}
								>
									{t("gif.deleteSelected")}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onPress={() => history.run(commands.reverseFrames())}
								>
									{t("gif.reverse")}
								</Button>
							</div>

							<Slider
								label={t("gif.delay")}
								value={currentFrame?.delayMs ?? 100}
								defaultValue={100}
								min={10}
								max={2000}
								step={10}
								onChange={(delay) =>
									history.run(
										commands.setFrameDelay(
											selected.size > 0
												? [...selected]
												: currentFrame === undefined
													? []
													: [currentFrame.id],
											delay,
										),
									)
								}
								onChangeEnd={history.seal}
							/>

							<div className="flex gap-2">
								<Button
									size="sm"
									variant="ghost"
									onPress={() => history.run(commands.setAllDelays(currentFrame?.delayMs ?? 100))}
								>
									{t("gif.delayAll")}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onPress={() => history.run(commands.scaleDelays(0.5))}
								>
									2×
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onPress={() => history.run(commands.scaleDelays(2))}
								>
									0.5×
								</Button>
							</div>

							<Button
								size="sm"
								variant="secondary"
								onPress={() => {
									void saveFrame();
								}}
							>
								{t("gif.extractFrame")}
							</Button>
						</CollapsibleSection>

						<CollapsibleSection title={t("export.title")} defaultOpen>
							<SegmentedControl<"global" | "per-frame">
								label={t("gif.palette")}
								hideLabel={false}
								value={doc.export.paletteScope}
								onChange={(paletteScope) => history.run(commands.setGifExport({ paletteScope }))}
								options={[
									{ id: "global", label: t("gif.paletteGlobal") },
									{ id: "per-frame", label: t("gif.palettePerFrame") },
								]}
							/>

							<Slider
								label={t("gif.colors")}
								value={doc.export.colors}
								defaultValue={256}
								min={2}
								max={256}
								step={2}
								onChange={(colors) => history.run(commands.setGifExport({ colors }))}
								onChangeEnd={history.seal}
							/>

							<Select<GifDither>
								label={t("gif.dither")}
								value={doc.export.dither}
								onChange={(dither) => history.run(commands.setGifExport({ dither }))}
								options={[
									{ id: "none", label: t("gif.dither.none") },
									{ id: "floyd-steinberg", label: t("gif.dither.floydSteinberg") },
									{ id: "bayer", label: t("gif.dither.bayer") },
								]}
							/>

							<Button
								variant="primary"
								isDisabled={exporting !== null}
								onPress={() => {
									void exportGif();
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

							{/* Most people arrive with a GIF believing they have no
							    choice; saying otherwise at the point of export is
							    the only place it helps. */}
							<p className="text-xs text-[var(--info)]">{t("export.gifSuggestion")}</p>

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

function createEmpty(): GifDocument {
	return {
		kind: "gif",
		version: 1,
		source: EMPTY_SOURCE,
		sourceWidth: 1,
		sourceHeight: 1,
		frames: [],
		crop: null,
		resize: null,
		rotation: 0,
		filters: {
			brightness: 0,
			contrast: 0,
			saturation: 0,
			exposure: 0,
			temperature: 0,
			tint: 0,
			gamma: 1,
			highlights: 0,
			shadows: 0,
			vibrance: 0,
			hueRotate: 0,
			sharpen: 0,
			blur: 0,
			vignette: 0,
			grayscale: 0,
			sepia: 0,
			invert: 0,
			opacity: 1,
		},
		textLayers: [],
		export: {
			format: "gif",
			paletteScope: "global",
			colors: 256,
			dither: "floyd-steinberg",
			loop: 0,
			quality: 0.9,
		},
	};
}

function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
