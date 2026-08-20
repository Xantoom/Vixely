import type { SubtitleFormat } from "../document/types.ts";
import { serialiseAss, parseAss, stripAssTags, textToAss } from "./ass.ts";
import { conversionLosses, type ConversionLoss, type SubtitleTrack } from "./model.ts";
import { parseSrt, serialiseSrt } from "./srt.ts";
import { parseVtt, serialiseVtt } from "./vtt.ts";

/**
 * Format detection and conversion.
 *
 * Conversion never happens silently: `conversionLosses` says what a target
 * cannot carry, and the interface shows it before the user commits.
 */

export function detectFormat(text: string, fileName = ""): SubtitleFormat | null {
	const head = text.slice(0, 4096);
	if (head.trimStart().startsWith("WEBVTT")) return "vtt";
	if (/\[Script Info\]/iu.test(head)) return "ass";
	if (/^\s*(\d+\s*\n)?\s*\d+:\d{2}:\d{2}[,.]\d{1,3}\s*-->/mu.test(head)) return "srt";

	const extension = fileName.toLowerCase().split(".").pop();
	if (extension === "ass" || extension === "ssa") return "ass";
	if (extension === "vtt") return "vtt";
	if (extension === "srt") return "srt";
	if (extension === "sup") return "pgs";
	return null;
}

export function parseSubtitles(text: string, format: SubtitleFormat): SubtitleTrack {
	switch (format) {
		case "srt":
			return parseSrt(text);
		case "vtt":
			return parseVtt(text);
		case "ass":
			return parseAss(text);
		case "pgs":
			throw new Error("PGS is binary and is read by parseSupSegments, not as text");
	}
}

export function serialiseSubtitles(track: SubtitleTrack, format: SubtitleFormat): string {
	switch (format) {
		case "srt":
			return serialiseSrt(track);
		case "vtt":
			return serialiseVtt(track);
		case "ass":
			return serialiseAss(track);
		case "pgs":
			throw new Error("PGS cannot be written as text");
	}
}

/**
 * Converts a track between text formats, rewriting the markup each one uses.
 *
 * ASS override tags are stripped rather than approximated when the target
 * cannot carry them: an SRT full of `{\pos(960,120)}` is worse than one without.
 */
export function convertTrack(
	track: SubtitleTrack,
	to: SubtitleFormat,
): { readonly track: SubtitleTrack; readonly losses: readonly ConversionLoss[] } {
	const losses = conversionLosses(track.format, to, track);
	if (track.format === to) return { track, losses };

	const cues = track.cues.map((cue) => {
		if (to === "ass") {
			return { ...cue, text: textToAss(cue.text) };
		}
		if (track.format === "ass") {
			const plain = stripAssTags(cue.text);
			return {
				...cue,
				text: plain,
				styleName: null,
				layer: 0,
				marginLeft: to === "srt" ? null : cue.marginLeft,
				marginRight: to === "srt" ? null : cue.marginRight,
				marginVertical: to === "srt" ? null : cue.marginVertical,
				effect: to === "srt" ? null : cue.effect,
			};
		}
		if (to === "srt") {
			// SRT has no cue settings, so anything positional is dropped.
			return { ...cue, marginLeft: null, marginRight: null, marginVertical: null, effect: null };
		}
		return cue;
	});

	return {
		track: {
			...track,
			format: to,
			cues,
			styles: to === "ass" ? track.styles : [],
			scriptInfo: to === "ass" || to === "vtt" ? track.scriptInfo : {},
		},
		losses,
	};
}

/** Matroska codec ids, which is how a container names a subtitle track. */
export const MATROSKA_SUBTITLE_CODECS: Record<string, SubtitleFormat> = {
	"S_TEXT/UTF8": "srt",
	"S_TEXT/ASCII": "srt",
	"S_TEXT/SSA": "ass",
	"S_TEXT/ASS": "ass",
	"S_TEXT/WEBVTT": "vtt",
	"S_HDMV/PGS": "pgs",
};

export function codecIdFor(format: SubtitleFormat): string {
	switch (format) {
		case "srt":
			return "S_TEXT/UTF8";
		case "ass":
			return "S_TEXT/ASS";
		case "vtt":
			return "S_TEXT/WEBVTT";
		case "pgs":
			return "S_HDMV/PGS";
	}
}

export function formatForCodecId(codecId: string): SubtitleFormat | null {
	return MATROSKA_SUBTITLE_CODECS[codecId.toUpperCase()] ?? null;
}
