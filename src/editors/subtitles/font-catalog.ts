/**
 * The fonts Vixely serves itself for subtitles, fetched from this site only when a script uses
 * them: the editor's own faces, and free equivalents of the fonts subtitles usually name, which
 * libass in the browser can't take from the system. Latin and Latin Extended only; other scripts
 * fall back to Liberation Sans, which covers Greek and Cyrillic.
 */

/** WOFF2 files, which libass in the browser draws with. */
const FILES = import.meta.glob<string>(
	'/node_modules/@fontsource/{arimo,tinos,cousine,gelasio,comic-neue,carlito,geist,geist-mono,playfair-display,anton,bebas-neue,oswald,caveat,pacifico,permanent-marker}/files/*-{latin,latin-ext}-{400,700}-{normal,italic}.woff2',
	{ query: '?url', import: 'default', eager: true },
);

/** The same fonts as WOFF, turned into TrueType when attached to a file: players don't read WOFF2. */
const SOURCES = import.meta.glob<string>(
	'/node_modules/@fontsource/{arimo,tinos,cousine,gelasio,comic-neue,carlito,geist,geist-mono,playfair-display,anton,bebas-neue,oswald,caveat,pacifico,permanent-marker}/files/*-{latin,latin-ext}-{400,700}-{normal,italic}.woff',
	{ query: '?url', import: 'default', eager: true },
);

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';

export interface BundledFont {
	family: string;
	category: FontCategory;
	/** Addresses of its files on this site: each weight, style and subset. */
	files: string[];
	/** The same files as WOFF, with the name each takes once turned into TrueType. */
	sources: { name: string; url: string }[];
}

const FAMILIES: [family: string, folder: string, category: FontCategory][] = [
	['Arimo', '@fontsource/arimo', 'sans'],
	['Carlito', '@fontsource/carlito', 'sans'],
	['Geist', '@fontsource/geist', 'sans'],
	['Tinos', '@fontsource/tinos', 'serif'],
	['Gelasio', '@fontsource/gelasio', 'serif'],
	['Playfair Display', '@fontsource/playfair-display', 'serif'],
	['Cousine', '@fontsource/cousine', 'mono'],
	['Geist Mono', '@fontsource/geist-mono', 'mono'],
	['Anton', '@fontsource/anton', 'display'],
	['Bebas Neue', '@fontsource/bebas-neue', 'display'],
	['Oswald', '@fontsource/oswald', 'display'],
	['Comic Neue', '@fontsource/comic-neue', 'handwriting'],
	['Caveat', '@fontsource/caveat', 'handwriting'],
	['Pacifico', '@fontsource/pacifico', 'handwriting'],
	['Permanent Marker', '@fontsource/permanent-marker', 'handwriting'],
];

export const BUNDLED_FONTS: BundledFont[] = FAMILIES.map(([family, folder, category]) => ({
	family,
	category,
	files: inFolder(FILES, folder).map(([, url]) => url),
	sources: inFolder(SOURCES, folder).map(([path, url]) => ({
		name: (path.split('/').pop() ?? '').replace(/\.woff$/, '.ttf'),
		url,
	})),
}));

function inFolder(files: Record<string, string>, folder: string): [path: string, url: string][] {
	return Object.entries(files).filter(([path]) => path.startsWith(`/node_modules/${folder}/files/`));
}

const BY_NAME = new Map(BUNDLED_FONTS.map((font) => [font.family.toLowerCase(), font]));

export function bundledFont(family: string): BundledFont | undefined {
	return BY_NAME.get(family.trim().toLowerCase());
}

/**
 * Fonts of Windows and macOS that subtitles name, and the free font drawn in their place when the
 * system's can't be had. The first ones have the same measurements, so lines break and sit where
 * they will on a screen that has the original; the others only look alike.
 */
const EQUIVALENTS: Record<string, string> = {
	arial: 'Arimo',
	helvetica: 'Arimo',
	'helvetica neue': 'Arimo',
	'liberation sans': 'Arimo',
	'times new roman': 'Tinos',
	times: 'Tinos',
	'liberation serif': 'Tinos',
	'courier new': 'Cousine',
	courier: 'Cousine',
	'liberation mono': 'Cousine',
	georgia: 'Gelasio',
	calibri: 'Carlito',
	'comic sans ms': 'Comic Neue',
	impact: 'Anton',
};

export function equivalentFont(family: string): BundledFont | undefined {
	const name = EQUIVALENTS[family.trim().toLowerCase()];
	return name ? bundledFont(name) : undefined;
}
