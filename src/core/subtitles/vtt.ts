import type { SubtitleCue } from "../document/types.ts";
import {
	emptyTrack,
	normaliseNewlines,
	SubtitleParseError,
	stripBom,
	type SubtitleTrack,
} from "./model.ts";

/**
 * WebVTT.
 *
 * Unlike SRT this one has a specification, so the parser is stricter: the
 * `WEBVTT` signature is required, and cue settings are kept rather than
 * discarded — they are the reason a VTT file is not merely an SRT with dots.
 */

const TIMING =
	/^\s*(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s*(.*)$/u;

export function parseVtt(input: string): SubtitleTrack {
	const text = normaliseNewlines(stripBom(input));
	const lines = text.split("\n");

	if (!(lines[0] ?? "").startsWith("WEBVTT")) {
		throw new SubtitleParseError("a WebVTT file must start with WEBVTT", 1);
	}

	const cues: SubtitleCue[] = [];
	const scriptInfo: Record<string, string> = {};

	// Header metadata sits between the signature and the first blank line.
	let index = 1;
	while (index < lines.length && (lines[index] ?? "").trim() !== "") {
		const [key, ...rest] = (lines[index] ?? "").split(":");
		if (key !== undefined && rest.length > 0) scriptInfo[key.trim()] = rest.join(":").trim();
		index += 1;
	}

	let cueNumber = 0;

	while (index < lines.length) {
		while (index < lines.length && (lines[index] ?? "").trim() === "") index += 1;
		if (index >= lines.length) break;

		const line = lines[index] ?? "";

		// NOTE blocks and STYLE blocks are skipped whole.
		if (line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
			while (index < lines.length && (lines[index] ?? "").trim() !== "") index += 1;
			continue;
		}

		// An optional identifier precedes the timing line.
		let identifier: string | null = null;
		if (!TIMING.test(line)) {
			identifier = line.trim();
			index += 1;
		}

		const timingLine = lines[index];
		if (timingLine === undefined) break;
		const match = TIMING.exec(timingLine);
		if (match === null) {
			throw new SubtitleParseError(`expected a timing line, got "${timingLine.trim()}"`, index + 1);
		}
		index += 1;

		const settings = parseSettings(match[9] ?? "");
		const body: string[] = [];
		while (index < lines.length && (lines[index] ?? "").trim() !== "") {
			body.push(lines[index] ?? "");
			index += 1;
		}

		cueNumber += 1;
		cues.push({
			id: identifier ?? `vtt-${cueNumber}`,
			startMs: toMilliseconds(match[1], match[2], match[3], match[4]),
			endMs: toMilliseconds(match[5], match[6], match[7], match[8]),
			text: body.join("\n"),
			styleName: null,
			layer: 0,
			marginLeft: settings.position,
			marginRight: null,
			marginVertical: settings.line,
			effect: settings.raw === "" ? null : settings.raw,
		});
	}

	return { ...emptyTrack("vtt"), cues, scriptInfo };
}

export function serialiseVtt(track: Pick<SubtitleTrack, "cues" | "scriptInfo">): string {
	const header = ["WEBVTT"];
	for (const [key, value] of Object.entries(track.scriptInfo ?? {})) {
		header.push(`${key}: ${value}`);
	}

	const blocks = track.cues.map((cue) => {
		const settings = cue.effect === null ? "" : ` ${cue.effect}`;
		return `${cue.id}\n${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}${settings}\n${cue.text}`;
	});

	return `${header.join("\n")}\n\n${blocks.join("\n\n")}\n`;
}

export function formatVttTime(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1000);
	const millis = total % 1000;
	// The hour field is optional in VTT but always written: it is unambiguous
	// and every player accepts it.
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function parseSettings(raw: string): {
	position: number | null;
	line: number | null;
	raw: string;
} {
	const trimmed = raw.trim();
	const position = /position:(\d+)%/u.exec(trimmed);
	const line = /line:(\d+)%/u.exec(trimmed);
	return {
		position: position === null ? null : Number(position[1]),
		line: line === null ? null : Number(line[1]),
		raw: trimmed,
	};
}

function toMilliseconds(
	hours: string | undefined,
	minutes: string | undefined,
	seconds: string | undefined,
	millis: string | undefined,
): number {
	return (
		Number(hours ?? 0) * 3_600_000 +
		Number(minutes ?? 0) * 60_000 +
		Number(seconds ?? 0) * 1000 +
		Number(millis ?? 0)
	);
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}
