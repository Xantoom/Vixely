/**
 * The styles of an ASS file, as Aegisub's style manager edits them: read from the `[V4+ Styles]`
 * section of the header and written back there, every field kept as written but for the ones
 * changed. Lines refer to their style by name, so renaming or deleting a style follows through.
 */
import { type AssHeader, defaultAssFields, type SubtitleDoc } from './document';
import { defaultAssHeader } from './formats/ass';
import { convertText } from './formats/markup';

/** A style: its fields by lowercase name, values as written. */
export type AssStyle = Readonly<Record<string, string>>;

/** Fields of a style, in the order ASS writes them. */
const STYLE_FORMAT = [
	'Name',
	'Fontname',
	'Fontsize',
	'PrimaryColour',
	'SecondaryColour',
	'OutlineColour',
	'BackColour',
	'Bold',
	'Italic',
	'Underline',
	'StrikeOut',
	'ScaleX',
	'ScaleY',
	'Spacing',
	'Angle',
	'BorderStyle',
	'Outline',
	'Shadow',
	'Alignment',
	'MarginL',
	'MarginR',
	'MarginV',
	'Encoding',
];

const SECTION = /^\[V4\+? Styles\]\s*$/im;

interface StyleSection {
	/** Field names as written on the `Format:` line. */
	format: string[];
	styles: AssStyle[];
}

function sectionBounds(head: string): { start: number; end: number } | null {
	const found = SECTION.exec(head);
	if (!found) return null;
	const start = found.index;
	const next = head.slice(start + found[0].length).search(/^\[/m);
	return { start, end: next < 0 ? head.length : start + found[0].length + next };
}

/** The styles of a header, in order. */
export function readStyles(head: string): StyleSection {
	const bounds = sectionBounds(head);
	if (!bounds) return { format: STYLE_FORMAT, styles: [] };
	const text = head.slice(bounds.start, bounds.end);
	const format =
		/^Format\s*:\s*(.*)$/im
			.exec(text)?.[1]
			?.split(',')
			.map((field) => field.trim()) ?? STYLE_FORMAT;
	const styles = [...text.matchAll(/^Style\s*:\s*(.*)$/gim)].map((line) => {
		const values = (line[1] ?? '').split(',');
		// The last field takes any commas left, as the event text does.
		const fields: Record<string, string> = {};
		format.forEach((name, index) => {
			fields[name.toLowerCase()] =
				index === format.length - 1 ? values.slice(index).join(',').trim() : (values[index] ?? '').trim();
		});
		return fields;
	});
	return { format, styles };
}

/** The header with its styles replaced; the section is made when there is none. */
export function writeStyles(head: string, styles: readonly AssStyle[]): string {
	const { format } = readStyles(head);
	const lines = [
		`Format: ${format.join(', ')}`,
		...styles.map((style) => `Style: ${format.map((name) => style[name.toLowerCase()] ?? '').join(',')}`),
	];
	const bounds = sectionBounds(head);
	if (!bounds) return `${head.trimEnd()}\n\n[V4+ Styles]\n${lines.join('\n')}\n`;
	const title = SECTION.exec(head.slice(bounds.start))?.[0] ?? '[V4+ Styles]';
	const rest = head.slice(bounds.end);
	return `${head.slice(0, bounds.start)}${title}\n${lines.join('\n')}\n${rest ? `\n${rest.replace(/^\n+/, '')}` : ''}`;
}

function withHeader(doc: SubtitleDoc, ass: AssHeader, styles: readonly AssStyle[]): SubtitleDoc {
	return {
		...doc,
		ass: { ...ass, head: writeStyles(ass.head, styles), styles: styles.map((style) => style.name ?? '') },
	};
}

/** The document with one style's fields changed; a new name follows through to the lines using it. */
export function updateStyle(doc: SubtitleDoc, index: number, change: Record<string, string>): SubtitleDoc {
	const ass = doc.ass;
	if (!ass) return doc;
	const styles = readStyles(ass.head).styles;
	const before = styles[index];
	if (!before) return doc;
	const after = { ...before, ...change };
	const renamed = after.name !== before.name ? { from: before.name ?? '', to: after.name ?? '' } : null;
	const next = withHeader(
		doc,
		ass,
		styles.map((style, at) => (at === index ? after : style)),
	);
	if (!renamed) return next;
	return {
		...next,
		cues: next.cues.map((cue) =>
			cue.fields?.style === renamed.from ? { ...cue, fields: { ...cue.fields, style: renamed.to } } : cue,
		),
	};
}

/** A name not taken yet, from `base`: `Base`, then `Base 2`, `Base 3`… */
function freeName(styles: readonly AssStyle[], base: string): string {
	const taken = new Set(styles.map((style) => style.name));
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n += 1;
	return `${base} ${n}`;
}

/** The document with a copy of a style added after it. */
export function duplicateStyle(doc: SubtitleDoc, index: number): SubtitleDoc {
	const ass = doc.ass;
	if (!ass) return doc;
	const styles = readStyles(ass.head).styles;
	const source = styles[index];
	if (!source) return doc;
	const copy = { ...source, name: freeName(styles, source.name ?? 'Style') };
	return withHeader(doc, ass, [...styles.slice(0, index + 1), copy, ...styles.slice(index + 1)]);
}

/** The document without a style; its lines take the first style left. The last one stays. */
export function deleteStyle(doc: SubtitleDoc, index: number): SubtitleDoc {
	const ass = doc.ass;
	if (!ass) return doc;
	const styles = readStyles(ass.head).styles;
	const gone = styles[index];
	if (!gone || styles.length <= 1) return doc;
	const left = styles.filter((_, at) => at !== index);
	const fallback = left[0]?.name ?? 'Default';
	const next = withHeader(doc, ass, left);
	return {
		...next,
		cues: next.cues.map((cue) =>
			cue.fields?.style === gone.name ? { ...cue, fields: { ...cue.fields, style: fallback } } : cue,
		),
	};
}

/** How many lines use each style, by name. */
export function styleUse(doc: SubtitleDoc): Map<string, number> {
	const use = new Map<string, number>();
	for (const cue of doc.cues) {
		const name = cue.fields?.style ?? 'Default';
		use.set(name, (use.get(name) ?? 0) + 1);
	}
	return use;
}

/**
 * SRT or WebVTT made into ASS, so its lines can be styled: one Default style, italics and bold
 * kept, sized for the video when there is one.
 */
export function toAssDoc(doc: SubtitleDoc, title: string, playRes?: { width: number; height: number }): SubtitleDoc {
	if (doc.format === 'ass' || doc.format === 'pgs') return doc;
	const defaults = defaultAssFields();
	return {
		format: 'ass',
		cues: doc.cues.map((cue) => ({
			id: cue.id,
			start: cue.start,
			end: cue.end,
			text: convertText(cue.text, doc.format, 'ass'),
			fields: defaults,
		})),
		ass: defaultAssHeader(title, playRes),
		vttHeader: null,
	};
}

// ── Values as the panel shows them ────────────────────────────────────────────────────────────

/** `&HAABBGGRR` (alpha 00 is opaque) as `#rrggbb` and an opacity from 0 to 1. */
export function assColor(value: string | undefined): { hex: string; opacity: number } {
	const digits = (value ?? '').replace(/^&H/i, '').replace(/&$/, '').padStart(8, '0').slice(-8);
	const alpha = Number.parseInt(digits.slice(0, 2), 16);
	const blue = digits.slice(2, 4);
	const green = digits.slice(4, 6);
	const red = digits.slice(6, 8);
	return {
		hex: `#${red}${green}${blue}`.toLowerCase(),
		opacity: Number.isFinite(alpha) ? Math.round((1 - alpha / 255) * 100) / 100 : 1,
	};
}

/** `#rrggbb` and an opacity as `&HAABBGGRR`. */
export function toAssColor(hex: string, opacity: number): string {
	const clean = hex.replace('#', '').padStart(6, '0');
	const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255)
		.toString(16)
		.padStart(2, '0');
	return `&H${alpha}${clean.slice(4, 6)}${clean.slice(2, 4)}${clean.slice(0, 2)}`.toUpperCase();
}

/** ASS writes true as -1. */
export function assFlag(value: string | undefined): boolean {
	return value !== undefined && value.trim() !== '0' && value.trim() !== '';
}
