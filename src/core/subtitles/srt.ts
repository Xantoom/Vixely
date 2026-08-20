import type { SubtitleCue } from "../document/types.ts";
import {
	emptyTrack,
	normaliseNewlines,
	SubtitleParseError,
	stripBom,
	type SubtitleTrack,
} from "./model.ts";

/**
 * SRT.
 *
 * The format has no specification, only a de-facto shape, so the parser is
 * deliberately forgiving: missing indices, a comma or a dot as the decimal
 * separator, blank lines inside a cue, and a final cue without a trailing blank
 * line all occur in real files and all parse.
 */

const TIMING = /^\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/u;

export function parseSrt(input: string): SubtitleTrack {
	const text = normaliseNewlines(stripBom(input));
	const lines = text.split("\n");
	const cues: SubtitleCue[] = [];

	let index = 0;
	let cueNumber = 0;

	while (index < lines.length) {
		while (index < lines.length && (lines[index] ?? "").trim() === "") index += 1;
		if (index >= lines.length) break;

		// The numeric index is optional in the wild, so it is skipped rather
		// than required — rejecting the file over it would help nobody.
		if (/^\s*\d+\s*$/u.test(lines[index] ?? "")) index += 1;

		const timingLine = lines[index];
		if (timingLine === undefined) break;

		const match = TIMING.exec(timingLine);
		if (match === null) {
			throw new SubtitleParseError(`expected a timing line, got "${timingLine.trim()}"`, index + 1);
		}
		index += 1;

		const startMs = toMilliseconds(match[1], match[2], match[3], match[4]);
		const endMs = toMilliseconds(match[5], match[6], match[7], match[8]);

		const body: string[] = [];
		while (index < lines.length) {
			const line = lines[index] ?? "";
			// A blank line ends the cue — unless the next line continues it,
			// which happens in files written by hand.
			if (line.trim() === "") {
				const next = lines[index + 1] ?? "";
				const following = lines[index + 2] ?? "";
				const nextStartsCue = /^\s*\d+\s*$/u.test(next)
					? TIMING.test(following)
					: TIMING.test(next);
				if (nextStartsCue || next.trim() === "") break;
			}
			body.push(line);
			index += 1;
		}

		cueNumber += 1;
		cues.push({
			id: `srt-${cueNumber}`,
			startMs,
			endMs,
			text: body.join("\n").trimEnd(),
			styleName: null,
			layer: 0,
			marginLeft: null,
			marginRight: null,
			marginVertical: null,
			effect: null,
		});
	}

	return { ...emptyTrack("srt"), cues };
}

export function serialiseSrt(track: Pick<SubtitleTrack, "cues">): string {
	return (
		track.cues
			.map(
				(cue, index) =>
					`${index + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}`,
			)
			.join("\n\n") + "\n"
	);
}

export function formatSrtTime(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1000);
	const millis = total % 1000;
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function toMilliseconds(
	hours: string | undefined,
	minutes: string | undefined,
	seconds: string | undefined,
	fraction: string | undefined,
): number {
	// A two-digit fraction means hundredths, which some writers emit.
	const raw = fraction ?? "0";
	const millis = Number(raw.padEnd(3, "0").slice(0, 3));
	return (
		Number(hours ?? 0) * 3_600_000 +
		Number(minutes ?? 0) * 60_000 +
		Number(seconds ?? 0) * 1000 +
		millis
	);
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}
