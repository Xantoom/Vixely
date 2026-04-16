/**
 * Lightweight subtitle-burn-in helpers. Parses SRT, WebVTT and plain-text ASS
 * dialogue into a uniform cue timeline, then renders the currently-active cues
 * onto a 2D canvas. Designed to be plugged into Mediabunny's Conversion `process`
 * callback so subtitles can be baked into the exported video frames using only
 * browser-native APIs — no WebAssembly.
 */

export interface SubtitleCue {
	/** Inclusive start time in seconds. */
	start: number;
	/** Exclusive end time in seconds. */
	end: number;
	/** Cue text, with `\n` used to separate wrapped lines. */
	text: string;
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass';

export interface SubtitleBurnInStyle {
	/** Font family (CSS). Defaults to a web-safe stack. */
	fontFamily?: string;
	/** Base font size in pixels at 1080p reference height. Defaults to 44. */
	fontSizePx?: number;
	/** Fill color for the text. Defaults to white. */
	color?: string;
	/** Stroke color. Defaults to black. */
	strokeColor?: string;
	/** Stroke width in pixels. Defaults to 4. */
	strokeWidthPx?: number;
	/** Shadow color. Defaults to rgba(0,0,0,0.8). */
	shadowColor?: string;
	/** Shadow blur in pixels. Defaults to 6. */
	shadowBlurPx?: number;
	/**
	 * Vertical offset from the bottom edge in pixels (reference 1080p height).
	 * Defaults to 72.
	 */
	marginBottomPx?: number;
}

const DEFAULT_STYLE: Required<SubtitleBurnInStyle> = {
	fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, "Noto Sans", "Liberation Sans", sans-serif',
	fontSizePx: 44,
	color: '#ffffff',
	strokeColor: '#000000',
	strokeWidthPx: 4,
	shadowColor: 'rgba(0, 0, 0, 0.8)',
	shadowBlurPx: 6,
	marginBottomPx: 72,
};

const SRT_TIMESTAMP = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function parseSrtTimestamp(value: string): number | null {
	const match = value.match(SRT_TIMESTAMP);
	if (!match) return null;
	const [, h, m, s, ms] = match;
	return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number((ms ?? '0').padEnd(3, '0').slice(0, 3)) / 1000;
}

function parseSrt(text: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
	for (const block of blocks) {
		const lines = block.split('\n').filter(Boolean);
		if (lines.length < 2) continue;
		const timingIdx = lines.findIndex((line) => line.includes('-->'));
		if (timingIdx === -1) continue;
		const [startStr, endStr] = lines[timingIdx]!.split('-->').map((s) => s.trim());
		const start = parseSrtTimestamp(startStr ?? '');
		const end = parseSrtTimestamp(endStr ?? '');
		if (start == null || end == null || end <= start) continue;
		const cueText = lines
			.slice(timingIdx + 1)
			.join('\n')
			.replace(/<[^>]+>/g, '')
			.replace(/\{[^}]+\}/g, '')
			.trim();
		if (cueText) cues.push({ start, end, text: cueText });
	}
	return cues;
}

function parseVtt(text: string): SubtitleCue[] {
	const normalized = text.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/i, '');
	return parseSrt(normalized);
}

function parseAssDialogues(text: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	let format: string[] | null = null;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith('Format:')) {
			format = line
				.slice('Format:'.length)
				.split(',')
				.map((s) => s.trim().toLowerCase());
			continue;
		}
		if (!line.startsWith('Dialogue:') || !format) continue;
		const fields = line.slice('Dialogue:'.length).split(',');
		if (fields.length < format.length) continue;
		const startIdx = format.indexOf('start');
		const endIdx = format.indexOf('end');
		const textIdx = format.indexOf('text');
		if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;
		const start = parseSrtTimestamp(fields[startIdx]!.trim());
		const end = parseSrtTimestamp(fields[endIdx]!.trim());
		// Text may contain commas; rejoin everything from textIdx onward.
		const rawText = fields.slice(textIdx).join(',').trim();
		if (start == null || end == null || end <= start) continue;
		const cueText = rawText
			.replace(/\\N/g, '\n')
			.replace(/\\n/g, '\n')
			.replace(/\{[^}]*\}/g, '')
			.trim();
		if (cueText) cues.push({ start, end, text: cueText });
	}
	return cues;
}

export function parseSubtitles(content: string, format?: SubtitleFormat): SubtitleCue[] {
	const trimmed = content.trim();
	const resolved: SubtitleFormat =
		format ?? (/^WEBVTT/i.test(trimmed) ? 'vtt' : /\[Script Info\]|Dialogue:/i.test(trimmed) ? 'ass' : 'srt');
	switch (resolved) {
		case 'vtt':
			return parseVtt(trimmed);
		case 'ass':
			return parseAssDialogues(trimmed);
		case 'srt':
		default:
			return parseSrt(trimmed);
	}
}

interface CueIndex {
	cues: SubtitleCue[];
}

export function indexCues(cues: SubtitleCue[]): CueIndex {
	return { cues: cues.slice().sort((a, b) => a.start - b.start) };
}

export function cuesAt(index: CueIndex, timeSec: number): SubtitleCue[] {
	// Small N per typical subtitle track, linear scan is fine.
	return index.cues.filter((cue) => timeSec >= cue.start && timeSec < cue.end);
}

export interface SubtitleBurnInRenderer {
	render(
		ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
		timeSec: number,
		width: number,
		height: number,
	): void;
}

export function createSubtitleBurnInRenderer(
	cues: SubtitleCue[],
	style: SubtitleBurnInStyle = {},
): SubtitleBurnInRenderer {
	const index = indexCues(cues);
	const merged: Required<SubtitleBurnInStyle> = { ...DEFAULT_STYLE, ...style };

	return {
		render(ctx, timeSec, width, height) {
			const active = cuesAt(index, timeSec);
			if (active.length === 0) return;
			const scale = height / 1080;
			const fontSize = Math.max(14, Math.round(merged.fontSizePx * scale));
			const strokeWidth = Math.max(1, merged.strokeWidthPx * scale);
			const shadowBlur = merged.shadowBlurPx * scale;
			const marginBottom = merged.marginBottomPx * scale;

			ctx.save();
			ctx.font = `bold ${fontSize}px ${merged.fontFamily}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.lineJoin = 'round';
			ctx.shadowColor = merged.shadowColor;
			ctx.shadowBlur = shadowBlur;

			const lines: string[] = [];
			for (const cue of active) lines.push(...cue.text.split('\n'));
			const lineHeight = fontSize * 1.2;
			const centerX = width / 2;
			let y = height - marginBottom;
			for (let i = lines.length - 1; i >= 0; i -= 1) {
				const line = lines[i]!;
				ctx.lineWidth = strokeWidth;
				ctx.strokeStyle = merged.strokeColor;
				ctx.strokeText(line, centerX, y);
				ctx.fillStyle = merged.color;
				ctx.fillText(line, centerX, y);
				y -= lineHeight;
			}
			ctx.restore();
		},
	};
}
