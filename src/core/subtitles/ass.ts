import type { AssStyle, SubtitleCue } from "../document/types.ts";
import {
	DEFAULT_ASS_STYLE,
	normaliseNewlines,
	SubtitleParseError,
	stripBom,
	type SubtitleTrack,
} from "./model.ts";

/**
 * ASS / SSA.
 *
 * The format is section-based with a `Format:` line declaring the field order,
 * which is why fields are read by name rather than by position: a file whose
 * `Dialogue` line puts `Text` fourth is legal, and a positional parser silently
 * mangles it.
 *
 * `Text` is always last and may contain commas, so it is taken as the
 * remainder rather than split.
 */

const DIALOGUE_DEFAULT_FORMAT = [
	"Layer",
	"Start",
	"End",
	"Style",
	"Name",
	"MarginL",
	"MarginR",
	"MarginV",
	"Effect",
	"Text",
] as const;

const STYLE_DEFAULT_FORMAT = [
	"Name",
	"Fontname",
	"Fontsize",
	"PrimaryColour",
	"SecondaryColour",
	"OutlineColour",
	"BackColour",
	"Bold",
	"Italic",
	"Underline",
	"StrikeOut",
	"ScaleX",
	"ScaleY",
	"Spacing",
	"Angle",
	"BorderStyle",
	"Outline",
	"Shadow",
	"Alignment",
	"MarginL",
	"MarginR",
	"MarginV",
	"Encoding",
] as const;

export function parseAss(input: string): SubtitleTrack {
	const text = normaliseNewlines(stripBom(input));
	const lines = text.split("\n");

	const scriptInfo: Record<string, string> = {};
	const styles: AssStyle[] = [];
	const cues: SubtitleCue[] = [];

	let section = "";
	let styleFormat: readonly string[] = STYLE_DEFAULT_FORMAT;
	let eventFormat: readonly string[] = DIALOGUE_DEFAULT_FORMAT;
	let cueNumber = 0;
	let sawSection = false;

	for (const [position, rawLine] of lines.entries()) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith(";") || line.startsWith("!:")) continue;

		if (line.startsWith("[") && line.endsWith("]")) {
			section = line.slice(1, -1).toLowerCase();
			sawSection = true;
			continue;
		}

		const separator = line.indexOf(":");
		if (separator === -1) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();

		if (section.startsWith("script info")) {
			scriptInfo[key] = value;
			continue;
		}

		if (section.includes("styles")) {
			if (key === "Format") {
				styleFormat = value.split(",").map((field) => field.trim());
			} else if (key === "Style") {
				styles.push(parseStyle(value, styleFormat));
			}
			continue;
		}

		if (section === "events") {
			if (key === "Format") {
				eventFormat = value.split(",").map((field) => field.trim());
			} else if (key === "Dialogue") {
				cueNumber += 1;
				cues.push(parseDialogue(value, eventFormat, cueNumber, position + 1));
			}
			// Comment lines are events too, but they are not shown, so they are
			// dropped rather than carried as invisible cues.
		}
	}

	if (!sawSection) {
		throw new SubtitleParseError("no ASS section header found", 1);
	}

	return {
		format: "ass",
		cues,
		styles: styles.length > 0 ? styles : [DEFAULT_ASS_STYLE],
		scriptInfo,
		rawHeader: null,
	};
}

function parseStyle(value: string, format: readonly string[]): AssStyle {
	const parts = value.split(",");
	const field = (name: string): string => {
		const index = format.indexOf(name);
		return index === -1 ? "" : (parts[index] ?? "").trim();
	};

	const numberField = (name: string, fallback: number): number => {
		const raw = Number(field(name));
		return Number.isFinite(raw) ? raw : fallback;
	};

	// ASS writes booleans as 0 / -1, not as 0 / 1.
	const flagField = (name: string): boolean => field(name) === "-1" || field(name) === "1";

	return {
		name: field("Name") || DEFAULT_ASS_STYLE.name,
		fontName: field("Fontname") || DEFAULT_ASS_STYLE.fontName,
		fontSize: numberField("Fontsize", DEFAULT_ASS_STYLE.fontSize),
		primaryColour: field("PrimaryColour") || DEFAULT_ASS_STYLE.primaryColour,
		secondaryColour: field("SecondaryColour") || DEFAULT_ASS_STYLE.secondaryColour,
		outlineColour:
			field("OutlineColour") || field("TertiaryColour") || DEFAULT_ASS_STYLE.outlineColour,
		backColour: field("BackColour") || DEFAULT_ASS_STYLE.backColour,
		bold: flagField("Bold"),
		italic: flagField("Italic"),
		underline: flagField("Underline"),
		strikeOut: flagField("StrikeOut"),
		scaleX: numberField("ScaleX", 100),
		scaleY: numberField("ScaleY", 100),
		spacing: numberField("Spacing", 0),
		angle: numberField("Angle", 0),
		borderStyle: numberField("BorderStyle", 1),
		outline: numberField("Outline", 2),
		shadow: numberField("Shadow", 1),
		alignment: numberField("Alignment", 2),
		marginL: numberField("MarginL", 20),
		marginR: numberField("MarginR", 20),
		marginV: numberField("MarginV", 30),
		encoding: numberField("Encoding", 1),
	};
}

function parseDialogue(
	value: string,
	format: readonly string[],
	cueNumber: number,
	line: number,
): SubtitleCue {
	const textIndex = format.indexOf("Text");
	const fieldCount = textIndex === -1 ? format.length : textIndex;
	const parts: string[] = [];

	// Split only up to the text field: the text itself may contain commas.
	let remaining = value;
	for (let index = 0; index < fieldCount; index++) {
		const comma = remaining.indexOf(",");
		if (comma === -1) {
			parts.push(remaining);
			remaining = "";
			break;
		}
		parts.push(remaining.slice(0, comma));
		remaining = remaining.slice(comma + 1);
	}

	const field = (name: string): string => {
		const index = format.indexOf(name);
		return index === -1 || index >= parts.length ? "" : (parts[index] ?? "").trim();
	};

	const startMs = parseAssTime(field("Start"));
	const endMs = parseAssTime(field("End"));
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
		throw new SubtitleParseError("unreadable dialogue timing", line);
	}

	const margin = (name: string): number | null => {
		const raw = Number(field(name));
		// ASS writes 0 for "use the style's margin", which is not the same as 0px.
		return Number.isFinite(raw) && raw !== 0 ? raw : null;
	};

	return {
		id: `ass-${cueNumber}`,
		startMs,
		endMs,
		text: remaining,
		styleName: field("Style") || null,
		layer: Number(field("Layer")) || 0,
		marginLeft: margin("MarginL"),
		marginRight: margin("MarginR"),
		marginVertical: margin("MarginV"),
		effect: field("Effect") || null,
	};
}

/** ASS times are `h:mm:ss.cc` — centiseconds, not milliseconds. */
export function parseAssTime(value: string): number {
	const match = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/u.exec(value.trim());
	if (match === null) return Number.NaN;
	const fraction = (match[4] ?? "0").padEnd(2, "0").slice(0, 2);
	return (
		Number(match[1]) * 3_600_000 +
		Number(match[2]) * 60_000 +
		Number(match[3]) * 1000 +
		Number(fraction) * 10
	);
}

export function formatAssTime(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1000);
	// Centiseconds, rounded down: rounding up can push a cue past its neighbour.
	const centis = Math.floor((total % 1000) / 10);
	return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centis, 2)}`;
}

export function serialiseAss(track: SubtitleTrack): string {
	const info = {
		ScriptType: "v4.00+",
		WrapStyle: "0",
		ScaledBorderAndShadow: "yes",
		...track.scriptInfo,
	};

	const lines: string[] = ["[Script Info]"];
	for (const [key, value] of Object.entries(info)) lines.push(`${key}: ${value}`);

	lines.push("", "[V4+ Styles]", `Format: ${STYLE_DEFAULT_FORMAT.join(", ")}`);
	const styles = track.styles.length > 0 ? track.styles : [DEFAULT_ASS_STYLE];
	for (const style of styles) lines.push(`Style: ${serialiseStyle(style)}`);

	lines.push("", "[Events]", `Format: ${DIALOGUE_DEFAULT_FORMAT.join(", ")}`);
	for (const cue of track.cues) {
		lines.push(
			`Dialogue: ${cue.layer},${formatAssTime(cue.startMs)},${formatAssTime(cue.endMs)},` +
				`${cue.styleName ?? "Default"},,${cue.marginLeft ?? 0},${cue.marginRight ?? 0},` +
				`${cue.marginVertical ?? 0},${cue.effect ?? ""},${cue.text}`,
		);
	}

	return `${lines.join("\n")}\n`;
}

/** ASS writes booleans as 0 / -1, not as 0 / 1. */
function assFlag(value: boolean): string {
	return value ? "-1" : "0";
}

function serialiseStyle(style: AssStyle): string {
	return [
		style.name,
		style.fontName,
		style.fontSize,
		style.primaryColour,
		style.secondaryColour,
		style.outlineColour,
		style.backColour,
		assFlag(style.bold),
		assFlag(style.italic),
		assFlag(style.underline),
		assFlag(style.strikeOut),
		style.scaleX,
		style.scaleY,
		style.spacing,
		style.angle,
		style.borderStyle,
		style.outline,
		style.shadow,
		style.alignment,
		style.marginL,
		style.marginR,
		style.marginV,
		style.encoding,
	].join(",");
}

/** Strips override tags, for converting to a format that cannot carry them. */
export function stripAssTags(text: string): string {
	return text
		.replaceAll(/\{[^}]*\}/gu, "")
		.replaceAll("\\N", "\n")
		.replaceAll("\\n", "\n")
		.replaceAll("\\h", " ");
}

/** Converts SRT/VTT inline markup into the ASS equivalent. */
export function textToAss(text: string): string {
	return text
		.replaceAll(/<i>(.*?)<\/i>/gsu, "{\\i1}$1{\\i0}")
		.replaceAll(/<b>(.*?)<\/b>/gsu, "{\\b1}$1{\\b0}")
		.replaceAll(/<u>(.*?)<\/u>/gsu, "{\\u1}$1{\\u0}")
		.replaceAll(/<[^>]+>/gu, "")
		.replaceAll("\n", "\\N");
}

/** ASS colours are `&HAABBGGRR` — reversed, and with alpha inverted. */
export function assColourToCss(value: string): string {
	const match = /&H([0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})/u.exec(value.trim());
	if (match === null) return "#ffffff";
	const bgr = match[2] ?? "ffffff";
	const b = bgr.slice(0, 2);
	const g = bgr.slice(2, 4);
	const r = bgr.slice(4, 6);
	const alpha = match[1];
	if (alpha === undefined || alpha === "00") return `#${r}${g}${b}`.toLowerCase();
	// In ASS 0 is opaque and 255 transparent, which is the reverse of CSS.
	const opacity = (255 - Number.parseInt(alpha, 16)) / 255;
	return `rgba(${Number.parseInt(r, 16)}, ${Number.parseInt(g, 16)}, ${Number.parseInt(b, 16)}, ${opacity.toFixed(3)})`;
}

export function cssColourToAss(value: string): string {
	const match = /^#?([0-9A-Fa-f]{6})$/u.exec(value.trim());
	if (match === null) return "&H00FFFFFF";
	const rgb = match[1] ?? "ffffff";
	const r = rgb.slice(0, 2);
	const g = rgb.slice(2, 4);
	const b = rgb.slice(4, 6);
	return `&H00${b}${g}${r}`.toUpperCase();
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}
