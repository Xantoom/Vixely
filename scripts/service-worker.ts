/**
 * After the build and the prerendered pages: the service worker (src/service-worker.ts), given the
 * list of files it caches. Its content changes with every build that changes a file, which is how
 * browsers learn there is a new version.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';

function walk(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const files = walk(DIST)
	.map((path) => `/${relative(DIST, path).replaceAll('\\', '/')}`)
	.filter((path) => !['/sw.js', '/robots.txt', '/sitemap.xml', '/og-image.png'].includes(path) && !path.startsWith('/.vite/'))
	.toSorted();

// Cached once used, not ahead: the fonts of subtitles and the WOFF copies attached to exports, the
// pictures of the home page, what only rare files need (DTS, AC-3) and the builds of the image and
// subtitle engines for browsers without threads or SIMD.
const SUBTITLE_FONTS =
	/\/(arimo|tinos|cousine|gelasio|comic-neue|carlito|geist|geist-mono|oswald|playfair-display|caveat)-latin(-ext)?-(400|700)-(normal|italic)-[^/]+\.woff2$/;
const importsMemory = (path: string) =>
	WebAssembly.Module.imports(new WebAssembly.Module(readFileSync(join(DIST, path)))).some(({ kind }) => kind === 'memory');
const lazy = files.filter(
	(path) =>
		SUBTITLE_FONTS.test(path) ||
		path.endsWith('.woff') ||
		path.startsWith('/shots/') ||
		/\/mediabunny-(dts|ac3)-|\/jassub-worker-[^m/][^/]*\.wasm$/.test(path) ||
		(/\/vixely_image_bg-[^/]+\.wasm$/.test(path) && !importsMemory(path)),
);
// The pages, what the first page loads, and the app's icons.
const index = readFileSync(join(DIST, 'index.html'), 'utf8');
const linked = new Set([...index.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]));
// And the interface's own fonts, which its style sheet names.
for (const sheet of [...linked].filter((path) => path?.endsWith('.css'))) {
	const css = readFileSync(join(DIST, sheet ?? ''), 'utf8');
	for (const match of css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)) linked.add(match[1]);
}
const shell = files.filter(
	(path) => path.endsWith('.html') || linked.has(path) || path.startsWith('/icons/') || path === '/manifest.webmanifest',
);
const rest = files.filter((path) => !shell.includes(path) && !lazy.includes(path));

const built = await Bun.build({
	entrypoints: ['src/service-worker.ts'],
	minify: true,
	target: 'browser',
	define: { SHELL: JSON.stringify(shell), REST: JSON.stringify(rest), LAZY: JSON.stringify(lazy) },
});
const [output] = built.outputs;
if (!built.success || !output) throw new Error(built.logs.join('\n'));
writeFileSync(join(DIST, 'sw.js'), await output.text());

const size = (list: string[]) => (list.reduce((sum, path) => sum + statSync(join(DIST, path)).size, 0) / 1e6).toFixed(1);
console.log(`Service worker: ${shell.length} files at install (${size(shell)} MB), ${rest.length} after (${size(rest)} MB), ${lazy.length} on use (${size(lazy)} MB).`);
