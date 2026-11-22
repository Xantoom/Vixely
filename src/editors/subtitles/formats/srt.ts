import { type Cue, newCueId, type SubtitleDoc } from '../document';

/** `00:01:02,345 --> 00:01:04,000`, also with dots, one-digit parts or no hours. */
const TIMING = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-+>\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

function ms(hours: string | undefined, minutes: string, seconds: string, fraction: string): number {
	return (
		(Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0'))
	);
}

/**
 * Reads SRT. Forgiving, like players are: cue numbers may be missing or wrong, times may use dots,
 * blank lines may be doubled. A cue runs from its times to the next cue's number, or the next
 * blank line followed by times.
 */
export function parseSrt(text: string): SubtitleDoc {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const timings: number[] = [];
	for (let i = 0; i < lines.length; i++) if (TIMING.test(lines[i] ?? '')) timings.push(i);
	const cues: Cue[] = [];
	for (let k = 0; k < timings.length; k++) {
		const at = timings[k] ?? 0;
		const match = TIMING.exec(lines[at] ?? '');
		if (!match) continue;
		const [, h1, m1, s1, f1 = '0', h2, m2, s2, f2 = '0'] = match;
		let stop = timings[k + 1] ?? lines.length;
		// The next cue's number belongs to it.
		if (k + 1 < timings.length && /^\s*\d+\s*$/.test(lines[stop - 1] ?? '')) stop -= 1;
		const body = lines.slice(at + 1, stop);
		while (body.length > 0 && (body.at(-1) ?? '').trim() === '') body.pop();
		const start = ms(h1, m1 ?? '0', s1 ?? '0', f1);
		const end = ms(h2, m2 ?? '0', s2 ?? '0', f2);
		cues.push({ id: newCueId(), start, end: Math.max(end, start), text: body.join('\n') });
	}
	return { format: 'srt', cues, ass: null, vttHeader: null };
}

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

/** `01:02:03,456`. */
export function srtTime(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const h = Math.floor(total / 3_600_000);
	const m = Math.floor(total / 60_000) % 60;
	const s = Math.floor(total / 1000) % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(total % 1000, 3)}`;
}

/**
 * Writes SRT from cues already in SRT markup, in time order, numbered from 1. Blank lines inside
 * a cue would end it early in every player, so they are removed.
 */
export function writeSrt(cues: readonly { start: number; end: number; text: string }[]): string {
	return cues
		.map((cue, index) => {
			const text = cue.text.replace(/\n\s*\n/g, '\n').trim();
			return `${index + 1}\r\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\r\n${text.replace(/\n/g, '\r\n')}\r\n`;
		})
		.join('\r\n');
}
