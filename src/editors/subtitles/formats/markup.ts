/**
 * Cue text markup, and the conversion between formats.
 *
 * SRT and WebVTT style text with HTML-like tags (`<i>`, `<b>`), ASS with override blocks
 * (`{\i1}`). Both are read into the same short list of tokens: text, and the styles all three
 * formats share (bold, italic, underline, strike, colour). Anything only one format knows, such
 * as ASS positioning or WebVTT voices, is dropped when converting and kept otherwise, because cue
 * text is only converted when it's written in another format.
 */
import type { SubtitleFormat } from '../document';

type Style = 'b' | 'i' | 'u' | 's';

export type Token =
	| { kind: 'text'; text: string }
	| { kind: 'open'; style: Style }
	| { kind: 'close'; style: Style }
	/** A text colour as `#rrggbb`, or null to go back to the default. */
	| { kind: 'color'; color: string | null }
	/** An ASS override block found in SRT text, such as `{\an8}`: kept for ASS and SRT only. */
	| { kind: 'ass'; raw: string };

const STYLES = new Set<string>(['b', 'i', 'u', 's']);

function isStyle(name: string): name is Style {
	return STYLES.has(name);
}

/** Colours named in SRT `<font color>` tags, beyond hexadecimal ones. */
const NAMED_COLORS: Record<string, string> = {
	white: '#ffffff',
	black: '#000000',
	red: '#ff0000',
	lime: '#00ff00',
	green: '#008000',
	blue: '#0000ff',
	yellow: '#ffff00',
	cyan: '#00ffff',
	aqua: '#00ffff',
	magenta: '#ff00ff',
	fuchsia: '#ff00ff',
	silver: '#c0c0c0',
	gray: '#808080',
	grey: '#808080',
	orange: '#ffa500',
};

function htmlColor(value: string): string | null {
	const color = value
		.trim()
		.replace(/^["']|["']$/g, '')
		.toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(color)) return color;
	if (/^#[0-9a-f]{3}$/.test(color)) return `#${color.slice(1).replace(/./g, '$&$&')}`;
	return NAMED_COLORS[color] ?? null;
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	nbsp: '\u00a0',
	lrm: '\u200e',
	rlm: '\u200f',
	quot: '"',
	apos: "'",
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name.startsWith('#x') || name.startsWith('#X'))
			return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
		if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

/** Tags of SRT and WebVTT, a WebVTT timestamp tag, or an ASS block written in SRT. */
const HTML_TOKEN = /<(\/?)([a-z]+)((?:[.\s][^>]*)?)>|<\d[\d:.]*>|\{\\[^}]*\}/gi;

/** Reads SRT or WebVTT cue text. Unknown tags are dropped; WebVTT entities are decoded. */
export function readHtmlMarkup(text: string, format: 'srt' | 'vtt'): Token[] {
	const tokens: Token[] = [];
	// Ruby annotations (<rt>) have no equivalent in other formats and would read as extra words.
	let inRubyText = false;
	const pushText = (raw: string) => {
		if (!raw || inRubyText) return;
		tokens.push({ kind: 'text', text: format === 'vtt' ? decodeEntities(raw) : raw });
	};
	let last = 0;
	for (const match of text.matchAll(HTML_TOKEN)) {
		pushText(text.slice(last, match.index));
		last = match.index + match[0].length;
		const [whole, slash, name, attributes] = match;
		if (whole.startsWith('{')) {
			tokens.push({ kind: 'ass', raw: whole });
			continue;
		}
		if (name === undefined) continue;
		const tag = name.toLowerCase();
		const closing = slash === '/';
		if (isStyle(tag)) {
			tokens.push(closing ? { kind: 'close', style: tag } : { kind: 'open', style: tag });
		} else if (tag === 'font') {
			const color = /color\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(attributes ?? '')?.[1];
			if (closing) tokens.push({ kind: 'color', color: null });
			else if (color) tokens.push({ kind: 'color', color: htmlColor(color) });
		} else if (tag === 'rt') {
			inRubyText = !closing;
		} else if (format === 'srt' && !['c', 'v', 'lang', 'ruby', 'span'].includes(tag)) {
			// In SRT, `<` is not escaped: something that isn't a known tag is text.
			pushText(whole);
		}
	}
	pushText(text.slice(last));
	return tokens;
}

/** ASS colour `&HBBGGRR&` (alpha ignored) as `#rrggbb`. */
function assColor(value: string): string | null {
	const hex = /&?H?([0-9a-f]+)&?/i.exec(value)?.[1];
	if (!hex) return null;
	const bgr = hex.padStart(6, '0').slice(-6);
	return `#${bgr.slice(4, 6)}${bgr.slice(2, 4)}${bgr.slice(0, 2)}`.toLowerCase();
}

/**
 * Reads ASS cue text. `\N` is a line break, `\n` a space (a soft break, which only one wrapping
 * mode honours), `\h` a non-breaking space. Drawings (`\p1` … `\p0`) are shapes, not text: dropped.
 */
export function readAssMarkup(text: string): Token[] {
	const tokens: Token[] = [];
	let drawing = false;
	let buffer = '';
	const flush = () => {
		if (buffer && !drawing) tokens.push({ kind: 'text', text: buffer });
		buffer = '';
	};
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '{') {
			const close = text.indexOf('}', i);
			if (close !== -1) {
				flush();
				readOverrides(text.slice(i + 1, close), tokens, (on) => {
					drawing = on;
				});
				i = close;
				continue;
			}
		}
		if (char === '\\') {
			const next = text[i + 1];
			if (next === 'N' || next === 'n' || next === 'h') {
				buffer += next === 'N' ? '\n' : next === 'n' ? ' ' : '\u00a0';
				i += 1;
				continue;
			}
		}
		buffer += char;
	}
	flush();
	return tokens;
}

/** Tags of an override block that other formats understand: styles, colour, reset, drawing. */
function readOverrides(block: string, tokens: Token[], setDrawing: (on: boolean) => void) {
	for (const match of block.matchAll(
		/\\(?:(1?c)(&H[0-9a-f]+&?)?|([bius])(\d*)(?![a-z])|(r)(?![a-z]*\()[^\\]*|(p)(\d+))/gi,
	)) {
		const [, color, colorValue, style, styleValue, reset, drawing, drawingValue] = match;
		if (color) {
			tokens.push({ kind: 'color', color: colorValue ? assColor(colorValue) : null });
		} else if (style) {
			const value = styleValue === '' ? 0 : Number(styleValue);
			// `\b` also takes a font weight: 700 and up is bold.
			const on = style.toLowerCase() === 'b' ? value === 1 || value >= 700 : value === 1;
			const name = style.toLowerCase();
			if (!isStyle(name)) continue;
			tokens.push(on ? { kind: 'open', style: name } : { kind: 'close', style: name });
		} else if (reset) {
			for (const s of ['b', 'i', 'u', 's'] as const) tokens.push({ kind: 'close', style: s });
			tokens.push({ kind: 'color', color: null });
		} else if (drawing) {
			setDrawing(Number(drawingValue) > 0);
		}
	}
}

export function readMarkup(text: string, format: SubtitleFormat): Token[] {
	return format === 'ass' ? readAssMarkup(text) : readHtmlMarkup(text, format);
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Writes tokens as SRT or WebVTT text. Tags are kept properly nested: closing one closes those
 * opened after it and opens them again. WebVTT has no strike or colour tags: those are dropped.
 */
export function writeHtmlMarkup(tokens: readonly Token[], format: 'srt' | 'vtt'): string {
	let out = '';
	/** Open tags, innermost last. A tag is written only once text follows it, so none is empty. */
	const open: { name: string; tag: string; written: boolean }[] = [];
	const close = (name: string) => {
		const index = open.findLastIndex((entry) => entry.name === name);
		if (index === -1) return;
		const closed = open.splice(index);
		for (const entry of closed.toReversed()) if (entry.written) out += `</${entry.name}>`;
		for (const entry of closed.slice(1)) open.push({ ...entry, written: false });
	};
	for (const token of tokens) {
		if (token.kind === 'text') {
			for (const entry of open) {
				if (entry.written) continue;
				out += entry.tag;
				entry.written = true;
			}
			out += format === 'vtt' ? escapeHtml(token.text) : token.text;
		} else if (token.kind === 'open') {
			if (format === 'vtt' && token.style === 's') continue;
			if (open.some((entry) => entry.name === token.style)) continue;
			open.push({ name: token.style, tag: `<${token.style}>`, written: false });
		} else if (token.kind === 'close') {
			close(token.style);
		} else if (token.kind === 'color') {
			if (format === 'vtt') continue;
			close('font');
			if (token.color) open.push({ name: 'font', tag: `<font color="${token.color}">`, written: false });
		} else if (format === 'srt') {
			out += token.raw;
		}
	}
	for (const entry of open.toReversed()) if (entry.written) out += `</${entry.name}>`;
	return out;
}

/** ASS colour of `#rrggbb`: `&HBBGGRR&`. */
function toAssColor(color: string): string {
	const hex = color.slice(1).toUpperCase();
	return `&H${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}&`;
}

/** Writes tokens as ASS text: line breaks as `\N`, styles as override blocks. */
export function writeAssMarkup(tokens: readonly Token[]): string {
	let out = '';
	for (const token of tokens) {
		if (token.kind === 'text') out += token.text.replace(/\r?\n/g, '\\N');
		else if (token.kind === 'open') out += `{\\${token.style}1}`;
		else if (token.kind === 'close') out += `{\\${token.style}0}`;
		else if (token.kind === 'color') out += token.color ? `{\\c${toAssColor(token.color)}}` : '{\\c}';
		else out += token.raw;
	}
	return out.replace(/\}\{/g, '');
}

/** Cue text in another format's markup. Unchanged when the format is the same. */
export function convertText(text: string, from: SubtitleFormat, to: SubtitleFormat): string {
	if (from === to) return text;
	const tokens = readMarkup(text, from);
	return to === 'ass' ? writeAssMarkup(tokens) : writeHtmlMarkup(tokens, to);
}

/** The words of a cue, without markup, lines separated by `\n`. */
export function plainText(text: string, format: SubtitleFormat): string {
	return readMarkup(text, format)
		.map((token) => (token.kind === 'text' ? token.text : ''))
		.join('');
}
