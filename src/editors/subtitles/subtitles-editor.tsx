import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubtitleDocument, SubtitleFormat } from "~/core/document";
import { createSubtitleDocument } from "~/core/document";
import {
	charactersPerSecond,
	convertTrack,
	findOverlaps,
	serialiseSubtitles,
} from "~/core/subtitles";
import { formatTimecode } from "~/i18n/format.ts";
import { AppShell } from "~/ui/app-shell.tsx";
import { useTranslate } from "~/ui/hooks/use-translate.ts";
import { Button } from "~/ui/primitives/button.tsx";
import { CollapsibleSection } from "~/ui/primitives/collapsible-section.tsx";
import { Field } from "~/ui/primitives/field.tsx";
import { NumberInput } from "~/ui/primitives/number-input.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Toggle } from "~/ui/primitives/toggle.tsx";
import { DropZone } from "../shared/drop-zone.tsx";
import { EditorLayout } from "../shared/editor-layout.tsx";
import { HistoryControls } from "../shared/history-controls.tsx";
import { useDocumentHistory } from "../shared/use-document-history.ts";
import * as commands from "./commands.ts";
import { CueList } from "./cue-list.tsx";
import { useSubtitleSource } from "./use-subtitle-source.ts";

const ACCEPTED = [".srt", ".vtt", ".ass", ".ssa", ".sup", ".mkv", ".webm"] as const;
const TEXT_FORMATS: readonly SubtitleFormat[] = ["srt", "vtt", "ass"];

const EMPTY_SOURCE = { id: "", name: "", byteLength: 0, mimeType: "" };

export function SubtitlesEditor() {
	const t = useTranslate();

	const [file, setFile] = useState<File | null>(null);
	const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	const source = useSubtitleSource(file);
	const history = useDocumentHistory<SubtitleDocument>(createSubtitleDocument(EMPTY_SOURCE));
	const reset = history.reset;

	useEffect(() => {
		const loaded = source.document;
		if (loaded === null) return;
		const handle = setTimeout(() => {
			reset(loaded);
			setReady(true);
		}, 0);
		return () => clearTimeout(handle);
	}, [source.document, reset]);

	const doc = ready ? history.document : null;

	const overlaps = useMemo(() => (doc === null ? [] : findOverlaps(doc.cues)), [doc]);

	const exportSubtitles = useCallback(() => {
		if (doc === null) return;
		const target = doc.export.format;
		const { track } = convertTrack(
			{
				format: doc.format,
				cues: doc.cues,
				styles: doc.styles,
				scriptInfo: doc.scriptInfo,
				rawHeader: null,
			},
			target,
		);
		const text = serialiseSubtitles(track, target);
		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		download(blob, `${doc.source.name.replace(/\.[^.]+$/u, "")}.${target}`);
	}, [doc]);

	const losses = useMemo(() => {
		if (doc === null || doc.export.format === doc.format) return [];
		return convertTrack(
			{
				format: doc.format,
				cues: doc.cues,
				styles: doc.styles,
				scriptInfo: doc.scriptInfo,
				rawHeader: null,
			},
			doc.export.format,
		).losses;
	}, [doc]);

	if (doc === null) {
		return (
			<AppShell editor="subtitles">
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold">{t("editor.subtitles")}</h1>
						<p className="text-sm text-[var(--text-muted)]">{t("editor.subtitles.description")}</p>
					</div>

					<DropZone accept={ACCEPTED} onFile={setFile} />

					{source.containerTracks.length > 0 && (
						<Select<number>
							label={t("subtitles.track")}
							value={source.containerTracks[0]?.id ?? 0}
							onChange={source.selectTrack}
							options={source.containerTracks.map((track) => ({
								id: track.id,
								label: `${track.name ?? track.language ?? `#${track.id}`} · ${track.format ?? track.codecId}`,
							}))}
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

	const selectedCue = doc.cues.find((cue) => cue.id === selectedCueId) ?? doc.cues[0] ?? null;
	const editable = doc.format !== "pgs";

	return (
		<AppShell
			editor="subtitles"
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
					<span className="tabular text-2xs uppercase text-[var(--text-subtle)]">{doc.format}</span>
					{overlaps.length > 0 && (
						<span className="text-2xs text-[var(--warning)]">
							{t("subtitles.overlaps", { count: overlaps.length })}
						</span>
					)}
				</div>
			}
		>
			<EditorLayout
				canvas={
					<div className="h-full overflow-auto p-3">
						{doc.cues.length === 0 ? (
							<p className="p-6 text-center text-sm text-[var(--text-muted)]">
								{t("subtitles.noCues")}
							</p>
						) : (
							<CueList
								cues={doc.cues}
								selectedId={selectedCue?.id ?? null}
								editable={editable}
								onSelect={setSelectedCueId}
								onChangeText={(id, text) => history.run(commands.updateCue(id, { text }))}
								onSeal={history.seal}
							/>
						)}
					</div>
				}
				panel={
					<div className="flex flex-col">
						{!editable && (
							<p className="border-b border-[var(--border)] p-3 text-xs text-[var(--warning)]">
								{t("subtitles.pgsNotEditable")}
							</p>
						)}

						<CollapsibleSection title={t("subtitles.cues")} defaultOpen>
							{selectedCue !== null && (
								<>
									<div className="grid grid-cols-2 gap-2">
										<Field label={t("subtitles.start")}>
											<NumberInput
												aria-label={t("subtitles.start")}
												value={Math.round(selectedCue.startMs)}
												min={0}
												step={10}
												suffix="ms"
												onChange={(startMs) =>
													history.run(commands.updateCue(selectedCue.id, { startMs }))
												}
											/>
										</Field>
										<Field label={t("subtitles.end")}>
											<NumberInput
												aria-label={t("subtitles.end")}
												value={Math.round(selectedCue.endMs)}
												min={0}
												step={10}
												suffix="ms"
												onChange={(endMs) =>
													history.run(commands.updateCue(selectedCue.id, { endMs }))
												}
											/>
										</Field>
									</div>

									<p className="tabular text-2xs text-[var(--text-subtle)]">
										{formatTimecode(selectedCue.startMs / 1000, true)} →{" "}
										{formatTimecode(selectedCue.endMs / 1000, true)}
									</p>

									<ReadingSpeed cue={selectedCue} />

									<div className="flex gap-2">
										<Button
											size="sm"
											variant="secondary"
											onPress={() =>
												history.run(commands.addCue(selectedCue.endMs, () => crypto.randomUUID()))
											}
										>
											{t("subtitles.addCue")}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onPress={() => history.run(commands.deleteCue(selectedCue.id))}
										>
											{t("subtitles.deleteCue")}
										</Button>
									</div>
								</>
							)}
						</CollapsibleSection>

						<CollapsibleSection title={t("subtitles.shift")}>
							<div className="flex flex-wrap gap-2">
								{[-1000, -100, 100, 1000].map((offset) => (
									<Button
										key={offset}
										size="sm"
										variant="secondary"
										onPress={() => history.run(commands.shiftAll(offset))}
									>
										{offset > 0 ? `+${offset}` : offset} ms
									</Button>
								))}
							</div>
						</CollapsibleSection>

						{doc.styles.length > 0 && (
							<CollapsibleSection title={t("subtitles.styles")}>
								{doc.styles.map((style) => (
									<div
										key={style.name}
										className="flex flex-col gap-2 border-b border-[var(--border)] pb-2 last:border-b-0"
									>
										<p className="text-xs font-medium">{style.name}</p>
										<div className="grid grid-cols-2 gap-2">
											<Field label={t("subtitles.fontSize")}>
												<NumberInput
													aria-label={t("subtitles.fontSize")}
													value={style.fontSize}
													min={4}
													max={400}
													step={1}
													onChange={(fontSize) =>
														history.run(commands.updateStyle(style.name, { fontSize }))
													}
												/>
											</Field>
										</div>
										<Toggle
											label={t("subtitles.bold")}
											isSelected={style.bold}
											onChange={(bold) => history.run(commands.updateStyle(style.name, { bold }))}
										/>
										<Toggle
											label={t("subtitles.italic")}
											isSelected={style.italic}
											onChange={(italic) =>
												history.run(commands.updateStyle(style.name, { italic }))
											}
										/>
									</div>
								))}
							</CollapsibleSection>
						)}

						<CollapsibleSection title={t("export.title")} defaultOpen>
							<Select<SubtitleFormat>
								label={t("subtitles.convertTo")}
								value={doc.export.format}
								onChange={(format) => history.run(commands.setExportFormat(format))}
								options={TEXT_FORMATS.map((format) => ({
									id: format,
									label: format.toUpperCase(),
									disabled: doc.format === "pgs",
									...(doc.format === "pgs" ? { disabledReason: "PGS is images" } : {}),
								}))}
							/>

							{/* Losses are shown before the action, never after it. */}
							{losses.length > 0 && (
								<div className="rounded-[var(--radius-control)] border-l-2 border-[var(--warning)] bg-[var(--warning-surface)] px-2 py-1.5">
									<p className="text-xs font-medium">
										{t("subtitles.willLose", {
											format: doc.export.format.toUpperCase(),
										})}
									</p>
									<ul className="mt-1 list-disc pl-4 text-xs text-[var(--text-muted)]">
										{losses.map((loss) => (
											<li key={`${loss.code}-${loss.detail}`}>{loss.detail}</li>
										))}
									</ul>
								</div>
							)}

							<Button variant="primary" isDisabled={doc.format === "pgs"} onPress={exportSubtitles}>
								{t("action.export")}
							</Button>
						</CollapsibleSection>
					</div>
				}
			/>
		</AppShell>
	);
}

/** Characters per second, the readability check editors are judged on. */
function ReadingSpeed({ cue }: { cue: { startMs: number; endMs: number; text: string } }) {
	const t = useTranslate();
	const cps = charactersPerSecond({
		id: "",
		startMs: cue.startMs,
		endMs: cue.endMs,
		text: cue.text,
		styleName: null,
		layer: 0,
		marginLeft: null,
		marginRight: null,
		marginVertical: null,
		effect: null,
	});

	if (!Number.isFinite(cps)) return null;
	// 21 cps is the usual professional ceiling for comfortable reading.
	const tooFast = cps > 21;

	return (
		<p
			className={`tabular text-2xs ${tooFast ? "text-[var(--warning)]" : "text-[var(--text-subtle)]"}`}
		>
			{t("subtitles.readingSpeed", { value: cps.toFixed(1) })}
			{tooFast ? ` — ${t("subtitles.tooFast")}` : ""}
		</p>
	);
}

function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
