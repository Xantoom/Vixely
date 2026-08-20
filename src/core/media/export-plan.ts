import { isIdentityFilters } from "../document/defaults.ts";
import type { AnyDocument, AudioDocument, VideoDocument } from "../document/types.ts";
import { CONTAINER_SUBTITLE_SUPPORT, containerAccepts, type ContainerFormat } from "./codecs.ts";

/**
 * Which of Mediabunny's two API levels an export should take.
 *
 * The rule is one question: does the edit touch pixels or samples? Converting
 * an MP4 to MKV with no other change must not re-encode, so the facade decides
 * from the document rather than from what the caller happens to ask for.
 */
export type ExportPath =
	| { readonly kind: "conversion"; readonly reason: "no pixel or sample work" }
	| { readonly kind: "manual"; readonly reasons: readonly string[] };

export function planImagePath(): ExportPath {
	// Images never go through Mediabunny; they always take the render graph.
	return { kind: "manual", reasons: ["images always render"] };
}

export function planVideoPath(document: VideoDocument): ExportPath {
	const reasons: string[] = [];
	if (!isIdentityFilters(document.filters)) reasons.push("filters change pixels");
	if (document.crop !== null) reasons.push("crop changes pixels");
	if (document.rotation !== 0) reasons.push("rotation changes pixels");
	if (document.textLayers.length > 0) reasons.push("text layers change pixels");
	if (document.export.subtitleMode === "burn-in") reasons.push("subtitles are burnt in");
	if (document.export.width !== null || document.export.height !== null) {
		reasons.push("scaling changes pixels");
	}
	if (document.videoTracks.some((track) => track.action === "reencode")) {
		reasons.push("a video track is set to re-encode");
	}

	return reasons.length === 0
		? { kind: "conversion", reason: "no pixel or sample work" }
		: { kind: "manual", reasons };
}

export function planAudioPath(document: AudioDocument): ExportPath {
	const reasons: string[] = [];
	if (document.loudness.enabled) reasons.push("normalisation changes samples");
	if (document.equalizer.some((band) => band.enabled && band.gainDb !== 0)) {
		reasons.push("the equaliser changes samples");
	}
	if (document.segments.some((segment) => segment.gainDb !== 0)) {
		reasons.push("a gain adjustment changes samples");
	}
	if (document.segments.some((s) => s.fadeInSec > 0 || s.fadeOutSec > 0)) {
		reasons.push("fades change samples");
	}

	return reasons.length === 0
		? { kind: "conversion", reason: "no pixel or sample work" }
		: { kind: "manual", reasons };
}

export function planExportPath(document: AnyDocument): ExportPath {
	switch (document.kind) {
		case "video":
			return planVideoPath(document);
		case "audio":
			return planAudioPath(document);
		case "image":
		case "gif":
			return planImagePath();
		case "subtitles":
			return { kind: "manual", reasons: ["subtitles are written by core/container"] };
	}
}

/** What a chosen container will silently drop, listed before the user commits. */
export type ExportWarning = {
	readonly code:
		| "subtitles-dropped"
		| "subtitles-downgraded"
		| "codec-incompatible"
		| "reencode-required";
	readonly detail: string;
};

export function collectVideoExportWarnings(
	document: VideoDocument,
	subtitleFormats: readonly ("srt" | "vtt" | "ass" | "pgs")[],
): readonly ExportWarning[] {
	const warnings: ExportWarning[] = [];
	const container = document.export.container as ContainerFormat;
	const support = CONTAINER_SUBTITLE_SUPPORT[container];

	if (document.export.subtitleMode === "embed" && subtitleFormats.length > 0) {
		// This is a format limitation, not a tooling one, and saying so is the
		// difference between an informed choice and a surprise.
		if (subtitleFormats.includes("pgs") && !support.pgs) {
			warnings.push({
				code: "subtitles-dropped",
				detail: `${container.toUpperCase()} cannot carry PGS; use MKV, or export the track as a separate file`,
			});
		}
		if (subtitleFormats.includes("ass") && !support.ass) {
			warnings.push({
				code: "subtitles-downgraded",
				detail: `${container.toUpperCase()} cannot carry ASS; styling and positioning are lost when converted to WebVTT`,
			});
		}
		if (!support.text) {
			warnings.push({
				code: "subtitles-dropped",
				detail: `${container.toUpperCase()} carries no subtitle track at all`,
			});
		}
	}

	if (!containerAccepts(container, document.export.codec)) {
		warnings.push({
			code: "codec-incompatible",
			detail: `${container.toUpperCase()} does not accept ${document.export.codec.toUpperCase()}`,
		});
	}

	const path = planVideoPath(document);
	if (path.kind === "manual") {
		warnings.push({ code: "reencode-required", detail: path.reasons.join(", ") });
	}

	return warnings;
}

/** Suggested output name: the source stem plus the container's extension. */
export function outputName(sourceName: string, container: ContainerFormat): string {
	return `${sourceName.replace(/\.[^.]+$/u, "")}.${container}`;
}
