import { useCallback, useState } from "react";
import {
	createImageDocument,
	FILTER_RANGES,
	isIdentityFilters,
	NEUTRAL_FILTERS,
	type FilterParams,
	type ImageDocument,
	type ImageFormat,
} from "~/core/document";
import { decodeImage, encodeImage, IMAGE_INPUT_EXTENSIONS, outputFileName } from "~/core/image";
import { exportExceedsCeiling } from "~/core/environment";
import { clampCrop, fitAspect } from "~/core/render";

import { AppShell } from "~/ui/app-shell.tsx";
import { EnvironmentNotice } from "../shared/environment-notice.tsx";
import { useEnvironment } from "../shared/use-environment.ts";
import { useLocale, useTranslate } from "~/ui/hooks/use-translate.ts";
import { formatBytes } from "~/i18n/format.ts";
import { Button } from "~/ui/primitives/button.tsx";
import { CollapsibleSection } from "~/ui/primitives/collapsible-section.tsx";
import { IconButton } from "~/ui/primitives/icon-button.tsx";
import { NumberInput } from "~/ui/primitives/number-input.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { Toggle } from "~/ui/primitives/toggle.tsx";
import { Field } from "~/ui/primitives/field.tsx";
import { CompareSlider } from "../shared/compare-slider.tsx";
import { DropZone } from "../shared/drop-zone.tsx";
import { EditorLayout } from "../shared/editor-layout.tsx";
import { HistoryControls } from "../shared/history-controls.tsx";
import { MediaCanvas } from "../shared/media-canvas.tsx";
import { useDocumentHistory } from "../shared/use-document-history.ts";
import * as commands from "./commands.ts";
import { useImageRender } from "./use-image-render.ts";

/** Filter labels never interpolate, so `t` takes no second argument here. */
type FilterLabelKey = `filter.${keyof FilterParams}`;

const FILTER_GROUPS: ReadonlyArray<{
	readonly titleKey: FilterLabelKey;
	readonly keys: ReadonlyArray<keyof FilterParams>;
	readonly open: boolean;
}> = [
	{
		titleKey: "filter.brightness",
		keys: ["exposure", "brightness", "contrast", "highlights", "shadows", "gamma"],
		open: true,
	},
	{
		titleKey: "filter.saturation",
		keys: ["saturation", "vibrance", "temperature", "tint", "hueRotate"],
		open: false,
	},
	{
		titleKey: "filter.sharpen",
		keys: ["sharpen", "blur", "vignette", "grayscale", "sepia", "invert", "opacity"],
		open: false,
	},
];

export function ImageEditor() {
	const t = useTranslate();
	const locale = useLocale();
	const environment = useEnvironment();

	const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [compare, setCompare] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [initial, setInitial] = useState<ImageDocument | null>(null);

	const history = useDocumentHistory<ImageDocument>(
		initial ?? createImageDocument({ id: "", name: "", byteLength: 0, mimeType: "" }, 1, 1),
	);
	const doc = initial === null ? null : history.document;

	// Destructured rather than kept as one object: the canvas ref must not
	// travel next to values that are read during render.
	const {
		canvasRef,
		size: outputSize,
		error: renderError,
		renderToPixels,
	} = useImageRender(doc, bitmap, false);

	// A second run of the same graph with neutral uniforms. Compare mode splits
	// two states of one pipeline, never a filtered render against a raw file.
	const { canvasRef: neutralCanvasRef } = useImageRender(
		compare ? doc : null,
		compare ? bitmap : null,
		true,
	);

	const openFile = useCallback(
		async (file: File) => {
			setLoadError(null);
			try {
				const decoded = await decodeImage(file, file.name);
				const created = createImageDocument(
					{
						id: crypto.randomUUID(),
						name: file.name,
						byteLength: file.size,
						mimeType: file.type,
					},
					decoded.width,
					decoded.height,
				);
				bitmap?.close();
				setBitmap(decoded);
				setInitial(created);
				history.reset(created);
			} catch (error) {
				setLoadError(
					t("error.decodeFailed", {
						name: file.name,
						reason: error instanceof Error ? error.message : String(error),
					}),
				);
			}
		},
		[bitmap, history, t],
	);

	const exportImage = useCallback(async () => {
		if (doc === null) return;
		setExporting(true);
		try {
			const pixels = await renderToPixels();
			const blob = await encodeImage(pixels, doc.export.format, doc.export.quality);
			downloadBlob(blob, outputFileName(doc.source.name, doc.export.format));
		} catch (error) {
			setLoadError(
				t("export.failed", {
					reason: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			setExporting(false);
		}
	}, [doc, renderToPixels, t]);

	if (doc === null || bitmap === null) {
		return (
			<AppShell editor="image">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold">{t("editor.image")}</h1>
						<p className="text-sm text-[var(--text-muted)]">{t("editor.image.description")}</p>
					</div>
					<EnvironmentNotice
						limitations={environment.limitations.filter(
							(limitation) => limitation.key !== "environment.noWebCodecsAudio",
						)}
					/>
					<DropZone
						accept={IMAGE_INPUT_EXTENSIONS}
						onFile={(file) => {
							void openFile(file);
						}}
					/>
					{loadError !== null && (
						<p role="alert" className="text-sm text-[var(--danger)]">
							{loadError}
						</p>
					)}
				</div>
			</AppShell>
		);
	}

	const estimatedBytes = estimateSize(doc, outputSize);

	return (
		<AppShell
			editor="image"
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
						{outputSize.width}×{outputSize.height}
					</span>
				</div>
			}
		>
			<EditorLayout
				rail={
					<>
						<IconButton
							label={t("command.rotate")}
							onPress={() => history.run(commands.rotate(90))}
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
						<IconButton
							label={t("command.flip")}
							onPress={() => history.run(commands.flip("horizontal"))}
						>
							<svg
								aria-hidden
								width="16"
								height="16"
								viewBox="0 0 16 16"
								className="fill-none stroke-current stroke-[1.4]"
							>
								<path d="M8 2v12M3 5.5 3 10.5 6.5 8Z M13 5.5v5L9.5 8Z" strokeLinejoin="round" />
							</svg>
						</IconButton>
					</>
				}
				canvas={
					<MediaCanvas
						contentWidth={outputSize.width}
						contentHeight={outputSize.height}
						description={t("canvas.description", {
							width: outputSize.width,
							height: outputSize.height,
						})}
					>
						{compare ? (
							<CompareSlider
								label={t("action.compare")}
								neutral={
									<canvas
										ref={neutralCanvasRef}
										width={outputSize.width}
										height={outputSize.height}
										className="block h-full w-full"
									/>
								}
								edited={
									<canvas
										ref={canvasRef}
										width={outputSize.width}
										height={outputSize.height}
										className="block h-full w-full"
									/>
								}
							/>
						) : (
							<canvas
								ref={canvasRef}
								width={outputSize.width}
								height={outputSize.height}
								className="block h-full w-full"
							/>
						)}
					</MediaCanvas>
				}
				panel={
					<div className="flex flex-col">
						<CollapsibleSection title={t("command.resize")} defaultOpen>
							<div className="grid grid-cols-2 gap-2">
								<Field label="W">
									<NumberInput
										aria-label={t("command.resize")}
										value={doc.resize?.width ?? outputSize.width}
										min={1}
										max={32_768}
										step={1}
										onChange={(width) => {
											const size = fitAspect(doc.sourceWidth, doc.sourceHeight, {
												width,
											});
											history.run(
												commands.setResize({
													...size,
													algorithm: doc.resize?.algorithm ?? "lanczos",
												}),
											);
										}}
									/>
								</Field>
								<Field label="H">
									<NumberInput
										aria-label={t("command.resize")}
										value={doc.resize?.height ?? outputSize.height}
										min={1}
										max={32_768}
										step={1}
										onChange={(height) => {
											const size = fitAspect(doc.sourceWidth, doc.sourceHeight, {
												height,
											});
											history.run(
												commands.setResize({
													...size,
													algorithm: doc.resize?.algorithm ?? "lanczos",
												}),
											);
										}}
									/>
								</Field>
							</div>
							{doc.resize !== null && (
								<Button
									size="sm"
									variant="ghost"
									onPress={() => history.run(commands.setResize(null))}
								>
									{t("action.reset")}
								</Button>
							)}
						</CollapsibleSection>

						<CollapsibleSection title={t("command.crop")}>
							<div className="grid grid-cols-2 gap-2">
								{(["x", "y", "width", "height"] as const).map((key) => (
									<Field key={key} label={key}>
										<NumberInput
											aria-label={key}
											value={
												doc.crop?.[key] ??
												(key === "width"
													? doc.sourceWidth
													: key === "height"
														? doc.sourceHeight
														: 0)
											}
											min={0}
											step={1}
											onChange={(value) => {
												const base = doc.crop ?? {
													x: 0,
													y: 0,
													width: doc.sourceWidth,
													height: doc.sourceHeight,
												};
												history.run(
													commands.setCrop(
														clampCrop({ ...base, [key]: value }, doc.sourceWidth, doc.sourceHeight),
													),
												);
											}}
										/>
									</Field>
								))}
							</div>
							{doc.crop !== null && (
								<Button
									size="sm"
									variant="ghost"
									onPress={() => history.run(commands.setCrop(null))}
								>
									{t("action.reset")}
								</Button>
							)}
						</CollapsibleSection>

						{FILTER_GROUPS.map((group, index) => (
							<CollapsibleSection
								key={group.titleKey}
								title={t(group.titleKey)}
								defaultOpen={group.open}
								badge={
									index === 0 && !isIdentityFilters(doc.filters) ? (
										<span aria-hidden className="size-1.5 rounded-full bg-[var(--accent)]" />
									) : undefined
								}
							>
								{group.keys.map((key) => (
									<Slider
										key={key}
										label={t(`filter.${key}` as FilterLabelKey)}
										value={doc.filters[key]}
										defaultValue={NEUTRAL_FILTERS[key]}
										min={FILTER_RANGES[key].min}
										max={FILTER_RANGES[key].max}
										step={FILTER_RANGES[key].step}
										onChange={(value) => history.run(commands.setFilter(key, value))}
										onChangeEnd={history.seal}
									/>
								))}
							</CollapsibleSection>
						))}

						<CollapsibleSection title={t("export.title")} defaultOpen>
							<Select<ImageFormat>
								label={t("export.format")}
								value={doc.export.format}
								onChange={(format) => history.run(commands.setExport({ format }))}
								options={[
									{ id: "png", label: "PNG" },
									{ id: "jpeg", label: "JPEG" },
									{ id: "webp", label: "WebP" },
									{ id: "avif", label: "AVIF" },
								]}
							/>
							{doc.export.format !== "png" && (
								<Slider
									label={t("export.quality")}
									value={doc.export.quality}
									defaultValue={0.9}
									min={0.1}
									max={1}
									step={0.01}
									onChange={(quality) => history.run(commands.setExport({ quality }))}
									onChangeEnd={history.seal}
								/>
							)}
							<Toggle
								label={t("export.keepMetadata")}
								description={t("export.keepMetadataHint")}
								isSelected={doc.export.keepMetadata}
								onChange={(keepMetadata) => history.run(commands.setExport({ keepMetadata }))}
							/>
							<Button
								variant="primary"
								isDisabled={exporting}
								onPress={() => {
									void exportImage();
								}}
							>
								{exporting ? t("status.working") : t("action.export")}
							</Button>
							<p className="tabular text-2xs text-[var(--text-subtle)]">
								{t("export.estimatedSize", {
									size: formatBytes(locale, estimatedBytes),
								})}
							</p>

							{/* Stated before the export starts, not after it fails. */}
							{exportExceedsCeiling(environment, estimatedBytes) && (
								<p className="text-xs text-[var(--warning)]">
									{t("environment.exportTooLarge", {
										size: formatBytes(locale, estimatedBytes),
									})}
								</p>
							)}
						</CollapsibleSection>

						<div className="border-t border-[var(--border)] p-3">
							<Toggle
								label={t("action.compare")}
								description={t("action.compareHint")}
								isSelected={compare}
								onChange={setCompare}
								isDisabled={isIdentityFilters(doc.filters)}
							/>
						</div>

						{(renderError !== null || loadError !== null) && (
							<p role="alert" className="px-3 py-2 text-xs text-[var(--danger)]">
								{renderError ?? loadError}
							</p>
						)}
					</div>
				}
			/>
		</AppShell>
	);
}

/** Rough output size, enough to warn before the work rather than after it. */
function estimateSize(doc: ImageDocument, size: { width: number; height: number }): number {
	const pixels = size.width * size.height;
	if (doc.export.format === "png") return pixels * 3;
	return Math.round(pixels * (0.08 + doc.export.quality * 0.5));
}

function downloadBlob(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export { useImageRender };
