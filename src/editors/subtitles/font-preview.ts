import { bundledFont } from './font-catalog';
import { type FontChoice, fileFamilies, useAddedFonts } from './font-sources';

/**
 * Font names written in their own font in the lists of the editor. The page draws them with the
 * same files libass gets: the computer's by name, the others loaded into the page under a name of
 * their own, a Vixely file only once a name in it is drawn.
 */

const loaded = new Map<string, string>();
let next = 0;

function register(key: string, source: string | ArrayBuffer): string {
	let name = loaded.get(key);
	if (name) return name;
	name = `vixely-preview-${next++}`;
	const face = new FontFace(name, typeof source === 'string' ? `url(${JSON.stringify(source)})` : source);
	document.fonts.add(face);
	// Bytes are read at once; a file fetched only when a name is drawn with it.
	if (typeof source !== 'string') void face.load().catch(() => undefined);
	loaded.set(key, name);
	return name;
}

/** The regular face of a Vixely font, Latin. */
function bundledFile(family: string): string | undefined {
	const files = bundledFont(family)?.files ?? [];
	return files.find((file) => /-latin-(400|wght)-normal/.test(file)) ?? files[0];
}

function fileFamily(bytes: Uint8Array, key: string): string {
	return register(key, bytes.slice().buffer);
}

/** A CSS `font-family` showing `choice` as the subtitles will. */
export function previewFont(choice: FontChoice, videoFonts: readonly Uint8Array[]): string | undefined {
	const named = (bytes: Uint8Array[]) =>
		bytes.find((font) => fileFamilies(font).some((name) => same(name, choice.family)));
	switch (choice.origin) {
		case 'file': {
			const bytes = named([...videoFonts]);
			return bytes ? fileFamily(bytes, `video:${choice.family.toLowerCase()}`) : undefined;
		}
		case 'added': {
			const bytes = named(useAddedFonts.getState().files.map((font) => font.bytes));
			return bytes ? fileFamily(bytes, `added:${choice.family.toLowerCase()}`) : undefined;
		}
		case 'system':
			return JSON.stringify(choice.family);
		case 'vixely':
		case 'equivalent': {
			const family = choice.shownAs ?? choice.family;
			const file = bundledFile(family);
			return file ? register(`vixely:${family}`, file) : undefined;
		}
		case 'missing':
			return undefined;
	}
}

function same(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}
