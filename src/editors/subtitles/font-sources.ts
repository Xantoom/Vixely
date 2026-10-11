import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { type FontAttachment, woffToSfnt } from '@/media/font-attach';
import { fontFamilies } from '@/media/font-names';
import { bundledFont, equivalentFont } from './font-catalog';

/**
 * Where the fonts subtitles name come from, since libass in the browser can't reach the system's
 * by name: the files embedded in the video, those the user adds, the computer's own (Chromium
 * browsers, once allowed) and those Vixely serves. Nothing leaves the computer.
 */

/** A font file and the families it declares. */
export interface FontFile {
	name: string;
	families: string[];
	bytes: Uint8Array;
}

/** Fonts the user added from files, for this visit. */
export const useAddedFonts = create<{ files: FontFile[]; add: (files: readonly File[]) => Promise<FontFile[]> }>(
	(set, get) => ({
		files: [],
		/** Adds the font files among `files`, and gives them. */
		async add(files) {
			const read = await Promise.all(
				files.map(async (file) => {
					const bytes = new Uint8Array(await file.arrayBuffer());
					return { name: file.name, families: fontFamilies(bytes), bytes };
				}),
			);
			const fonts = read.filter((font) => font.families.length > 0);
			const known = new Set(get().files.map((font) => font.name));
			set({ files: [...get().files, ...fonts.filter((font) => !known.has(font.name))] });
			return fonts;
		},
	}),
);

/** Font files Vixely takes from the computer: by type, as the Local Font Access API gives them. */
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.ttc'];

export function isFontFile(file: File): boolean {
	return FONT_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension));
}

// ── The computer's fonts ──

interface LocalFont {
	family: string;
	blob: () => Promise<Blob>;
}

declare global {
	interface Window {
		queryLocalFonts?: () => Promise<LocalFont[]>;
	}
}

type SystemState = 'unsupported' | 'unknown' | 'granted' | 'denied';

interface SystemFonts {
	state: SystemState;
	/** Each family's faces, by family in lower case. */
	families: ReadonlyMap<string, { family: string; faces: LocalFont[] }>;
	/** Asks for the fonts: must run from a click the first time, when the browser asks. */
	request: () => Promise<void>;
}

function byFamily(fonts: readonly LocalFont[]) {
	const families = new Map<string, { family: string; faces: LocalFont[] }>();
	for (const font of fonts) {
		const key = font.family.toLowerCase();
		const entry = families.get(key) ?? { family: font.family, faces: [] };
		entry.faces.push(font);
		families.set(key, entry);
	}
	return families;
}

export const useSystemFonts = create<SystemFonts>((set) => ({
	state: typeof window !== 'undefined' && window.queryLocalFonts ? 'unknown' : 'unsupported',
	families: new Map(),
	async request() {
		if (!window.queryLocalFonts) return;
		try {
			const fonts = await window.queryLocalFonts();
			const families = byFamily(fonts);
			// An empty list is a refusal too: some browsers answer so rather than fail.
			set({ state: families.size > 0 ? 'granted' : 'denied', families });
		} catch {
			set({ state: 'denied' });
		}
	},
}));

/**
 * Reads the computer's fonts at once when they were allowed on an earlier visit. Asked without a
 * click, the browser answers only then: otherwise it refuses without asking, and the fonts are
 * asked for from the button.
 */
async function startSystemFonts() {
	if (!window.queryLocalFonts) return;
	const fonts = await window.queryLocalFonts().catch(() => null);
	if (fonts && fonts.length > 0) useSystemFonts.setState({ state: 'granted', families: byFamily(fonts) });
}

if (typeof window !== 'undefined') void startSystemFonts();

const systemFiles = new Map<string, Promise<Uint8Array[]>>();

function systemFamily(family: string): Promise<Uint8Array[]> | null {
	const key = family.toLowerCase();
	const entry = useSystemFonts.getState().families.get(key);
	if (!entry) return null;
	let files = systemFiles.get(key);
	if (!files) {
		// A face the system won't give is left out: the others, or the fallback, draw the text.
		files = Promise.all(
			entry.faces.map(async (face) =>
				face
					.blob()
					.then(async (blob) => new Uint8Array(await blob.arrayBuffer()))
					.catch(() => null),
			),
		).then((faces) => faces.filter((face) => face !== null));
		systemFiles.set(key, files);
	}
	return files;
}

// ── What a script gets ──

/** A file of this site by its whole address: libass reads it in a worker, elsewhere. */
const siteUrl = (path: string) => new URL(path, location.href).href;

/** Where a font named by the subtitles is drawn from. */
export type FontOrigin = 'file' | 'added' | 'system' | 'vixely' | 'equivalent' | 'missing';

export interface FontChoice {
	/** The name the subtitles use. */
	family: string;
	origin: FontOrigin;
	/** The font drawn in its place: an equivalent's name. */
	shownAs?: string;
}

export interface ScriptFonts {
	/** Font files to give libass: bytes, or addresses on this site. */
	fonts: (Uint8Array | string)[];
	/** Families to rename in the script, so libass finds an equivalent under the name it has. */
	renames: Map<string, string>;
	choices: FontChoice[];
}

const familiesOf = new WeakMap<Uint8Array, string[]>();

/** The families a font file declares, read once. */
export function fileFamilies(bytes: Uint8Array): string[] {
	let families = familiesOf.get(bytes);
	if (!families) familiesOf.set(bytes, (families = fontFamilies(bytes)));
	return families;
}

const declares = (families: readonly string[], family: string) =>
	families.some((name) => name.toLowerCase() === family.trim().toLowerCase());

/**
 * Where `family` is drawn from: the first place that has it among the video, the files added, the
 * computer and Vixely, else a free equivalent, else nowhere (libass's fallback draws it).
 */
export function fontOrigin(family: string, videoFonts: readonly Uint8Array[]): FontChoice {
	if (videoFonts.some((bytes) => declares(fileFamilies(bytes), family))) return { family, origin: 'file' };
	if (useAddedFonts.getState().files.some((font) => declares(font.families, family)))
		return { family, origin: 'added' };
	if (useSystemFonts.getState().families.has(family.trim().toLowerCase())) return { family, origin: 'system' };
	if (bundledFont(family)) return { family, origin: 'vixely' };
	const equivalent = equivalentFont(family);
	if (equivalent) return { family, origin: 'equivalent', shownAs: equivalent.family };
	return { family, origin: 'missing' };
}

/**
 * The fonts to draw `families` with, each from where `fontOrigin` finds it. The video's and the
 * added files all go to libass, which picks among them by name, as players do with a film's fonts.
 */
export async function resolveFonts(
	families: readonly string[],
	videoFonts: readonly Uint8Array[],
): Promise<ScriptFonts> {
	const fonts: (Uint8Array | string)[] = [...videoFonts, ...useAddedFonts.getState().files.map((font) => font.bytes)];
	const renames = new Map<string, string>();
	const system: Promise<Uint8Array[]>[] = [];
	const choices = families.map((family) => fontOrigin(family, videoFonts));
	for (const choice of choices) {
		if (choice.origin === 'system') {
			const files = systemFamily(choice.family);
			if (files) system.push(files);
		} else if (choice.origin === 'vixely') {
			fonts.push(...(bundledFont(choice.family)?.files.map(siteUrl) ?? []));
		} else if (choice.origin === 'equivalent' && choice.shownAs) {
			fonts.push(...(bundledFont(choice.shownAs)?.files.map(siteUrl) ?? []));
			renames.set(choice.family.trim().toLowerCase(), choice.shownAs);
		}
	}
	for (const files of await Promise.all(system)) fonts.push(...files);
	return { fonts, renames, choices };
}

/**
 * Font files to carry with subtitles naming `families`, so players have them: those added, and
 * Vixely's named as they are. The video's fonts are there already, the computer's are not Vixely's
 * to hand out, and a name drawn with an equivalent stays for the player's own font.
 */
export async function fontAttachments(
	families: readonly string[],
	videoFonts: readonly Uint8Array[],
): Promise<FontAttachment[]> {
	const files = new Map<string, Promise<Uint8Array | null> | Uint8Array>();
	for (const choice of families.map((family) => fontOrigin(family, videoFonts))) {
		if (choice.origin === 'added') {
			for (const font of useAddedFonts.getState().files)
				if (declares(font.families, choice.family)) files.set(font.name, font.bytes);
		} else if (choice.origin === 'vixely') {
			for (const source of bundledFont(choice.family)?.sources ?? [])
				files.set(
					source.name,
					fetch(source.url)
						.then(async (response) =>
							response.ok ? woffToSfnt(new Uint8Array(await response.arrayBuffer())) : null,
						)
						.catch(() => null),
				);
		}
	}
	const read = await Promise.all([...files].map(async ([name, bytes]) => ({ name, bytes: await bytes })));
	return read.filter((font): font is FontAttachment => font.bytes !== null);
}

// ── Font names in a script ──

/** Each line of a style section, cut into its fields; `fontname` is the field's index. */
function styleFields(script: string): { line: number; fields: string[]; fontname: number }[] {
	const lines = script.split('\n');
	const styles: { line: number; fields: string[]; fontname: number }[] = [];
	let inStyles = false;
	let format: string[] = [];
	for (const [index, raw] of lines.entries()) {
		const line = raw.trim();
		if (line.startsWith('[')) {
			inStyles = /^\[v4\+? styles\]$/i.test(line);
			format = [];
			continue;
		}
		if (!inStyles) continue;
		const colon = line.indexOf(':');
		if (colon < 0) continue;
		const kind = line.slice(0, colon).trim().toLowerCase();
		const value = raw.slice(raw.indexOf(':') + 1);
		if (kind === 'format') format = value.split(',').map((field) => field.trim().toLowerCase());
		else if (kind === 'style') {
			const fontname = format.indexOf('fontname');
			if (fontname >= 0) styles.push({ line: index, fields: value.split(','), fontname });
		}
	}
	return styles;
}

/** Override blocks of the events, and `\fn` in them with where its name sits. */
const BLOCK = /\{[^}]*\}/g;
const FN_TAG = /(\\fn)([^\\}]*)/g;

function eventsStart(script: string): number {
	const match = /^\[events\]/im.exec(script);
	return match ? match.index : script.length;
}

/** A font name as libass reads it: `@` asks for vertical text in the same family. */
function familyName(name: string): string {
	return name.trim().replace(/^@/, '');
}

/** The font families a script names, in styles and `\fn` tags, each once. */
export function scriptFamilies(script: string): string[] {
	const names = new Map<string, string>();
	const add = (name: string) => {
		const family = familyName(name);
		if (family && !names.has(family.toLowerCase())) names.set(family.toLowerCase(), family);
	};
	for (const style of styleFields(script)) add(style.fields[style.fontname] ?? '');
	for (const block of script.slice(eventsStart(script)).matchAll(BLOCK))
		for (const match of block[0].matchAll(FN_TAG)) add(match[2] ?? '');
	return [...names.values()];
}

/** `script` with the families of `renames` (in lower case) called by their new names. */
export function renameFonts(script: string, renames: ReadonlyMap<string, string>): string {
	if (renames.size === 0) return script;
	const renamed = (name: string) => {
		const family = familyName(name);
		const to = renames.get(family.toLowerCase());
		return to ? `${name.trim().startsWith('@') ? '@' : ''}${to}` : name;
	};
	const lines = script.split('\n');
	for (const style of styleFields(script)) {
		const fields = [...style.fields];
		fields[style.fontname] = renamed(fields[style.fontname] ?? '');
		const raw = lines[style.line] ?? '';
		lines[style.line] = `${raw.slice(0, raw.indexOf(':') + 1)}${fields.join(',')}`;
	}
	const joined = lines.join('\n');
	const start = eventsStart(joined);
	return (
		joined.slice(0, start) +
		joined
			.slice(start)
			.replace(BLOCK, (block) =>
				block.replace(FN_TAG, (_, tag: string, name: string) => `${tag}${renamed(name)}`),
			)
	);
}

/** The script as libass should get it, and the fonts to give it. */
export async function scriptFonts(
	script: string,
	videoFonts: readonly Uint8Array[],
): Promise<{ script: string; fonts: (Uint8Array | string)[]; choices: FontChoice[] }> {
	const resolved = await resolveFonts(scriptFamilies(script), videoFonts);
	return { script: renameFonts(script, resolved.renames), fonts: resolved.fonts, choices: resolved.choices };
}

const fileIds = new WeakMap<Uint8Array, number>();
let nextFileId = 0;

/** A name for a set of font files, the same while the files are. */
export function fontsKey(fonts: readonly (Uint8Array | string)[]): string {
	return fonts
		.map((font) => {
			if (typeof font === 'string') return font;
			let id = fileIds.get(font);
			if (id === undefined) fileIds.set(font, (id = nextFileId++));
			return `#${id}`;
		})
		.join('|');
}

/**
 * `script` ready for libass, with the fonts it names: null while they are gathered. Fonts are only
 * looked for again when the names change, or when fonts are added or allowed; edits of the text
 * show at once.
 */
export function useScriptFonts(script: string, videoFonts: readonly Uint8Array[]) {
	const families = useMemo(() => scriptFamilies(script), [script]);
	const familiesKey = families.join('\n');
	const added = useAddedFonts((state) => state.files);
	const system = useSystemFonts((state) => state.families);
	const [resolved, setResolved] = useState<ScriptFonts | null>(null);
	useEffect(() => {
		let alive = true;
		void resolveFonts(familiesKey ? familiesKey.split('\n') : [], videoFonts).then((fonts) => {
			if (alive) setResolved(fonts);
		});
		return () => {
			alive = false;
		};
	}, [familiesKey, videoFonts, added, system]);
	const shown = useMemo(() => (resolved ? renameFonts(script, resolved.renames) : null), [script, resolved]);
	if (!resolved || shown === null) return null;
	return { script: shown, fonts: resolved.fonts, choices: resolved.choices, key: fontsKey(resolved.fonts) };
}
