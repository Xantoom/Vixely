import { type Cue, newCueId, type SubtitleDoc } from '../document';

/** `00:01:02.345 --> 00:01:04.000 line:0 align:start`, hours optional. */
const TIMING = /^\s*(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})(.*)$/;

function ms(hours: string | undefined, minutes: string, seconds: string, fraction: string): number {
	return (Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + Number(fraction);
}

/** Reads WebVTT. Returns null when the file doesn't start with `WEBVTT`. */
export function parseVtt(text: string): SubtitleDoc | null {
	const normalized = text.replace(/\r\n?/g, '\n');
	if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized)) return null;
	const blocks = normalized.split(/\n{2,}/);
	const header = [blocks[0] ?? 'WEBVTT'];
	const cues: Cue[] = [];
	for (const block of blocks.slice(1)) {
		const lines = block.split('\n');
		while (lines[0] === '') lines.shift();
		if (lines.length === 0) continue;
		const timingAt = lines.findIndex((line) => line.includes('-->'));
		if (timingAt === -1 || timingAt > 1) {
			// Style and region blocks only count before the first cue; notes are comments.
			if (cues.length === 0 && /^(STYLE|REGION)\b/.test(lines[0] ?? '')) header.push(lines.join('\n'));
			continue;
		}
		const match = TIMING.exec(lines[timingAt] ?? '');
		if (!match) continue;
		const [, h1, m1 = '0', s1 = '0', f1 = '0', h2, m2 = '0', s2 = '0', f2 = '0', settings = ''] = match;
		const start = ms(h1, m1, s1, f1);
		const end = ms(h2, m2, s2, f2);
		cues.push({
			id: newCueId(),
			start,
			end: Math.max(start, end),
			text: lines.slice(timingAt + 1).join('\n'),
			vtt: { id: timingAt === 1 ? (lines[0] ?? '') : '', settings: settings.trim() },
		});
	}
	return { format: 'vtt', cues, ass: null, vttHeader: header.join('\n\n') };
}

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

/** `01:02:03.456`. */
export function vttTime(milliseconds: number): string {
	const total = Math.max(0, Math.round(milliseconds));
	const h = Math.floor(total / 3_600_000);
	const m = Math.floor(total / 60_000) % 60;
	const s = Math.floor(total / 1000) % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(total % 1000, 3)}`;
}

/** Writes WebVTT from cues already in WebVTT markup, in time order. */
export function writeVtt(cues: readonly Pick<Cue, 'start' | 'end' | 'text' | 'vtt'>[], header: string | null): string {
	const body = cues.map((cue) => {
		// A blank line would end the cue, and `-->` inside text would be read as times.
		const text = cue.text
			.replace(/\n\s*\n/g, '\n')
			.replace(/-->/g, '--&gt;')
			.trim();
		const id = cue.vtt?.id ? `${cue.vtt.id}\n` : '';
		const settings = cue.vtt?.settings ? ` ${cue.vtt.settings}` : '';
		return `${id}${vttTime(cue.start)} --> ${vttTime(cue.end)}${settings}\n${text}\n`;
	});
	return [`${header ?? 'WEBVTT'}\n`, ...body].join('\n');
}
