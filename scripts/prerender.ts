/**
 * After the build: one HTML file per public page, its head filled in (title, description,
 * canonical address, link previews) so search engines and link previews read it without running
 * the app, and the sitemap and robots.txt listing them. The app itself then takes over as usual.
 * Written in English, the default language.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PAGES } from '../src/app/pages/content';
import { taskFaq } from '../src/app/task-faq';
import { TASKS } from '../src/app/tasks';
import { m } from '../src/paraglide/messages.js';

const SITE = 'https://vixely.app';
const DIST = 'dist';

interface Page {
	path: string;
	title: string;
	description: string;
	/** Pages of little interest to search engines, such as the legal notice. */
	index?: boolean;
	/** Questions answered on the page, given to search engines as structured data. */
	faq?: [string, string][];
	/**
	 * Its page component, whose code is announced to the browser early. An editor's own code is
	 * left out: the empty editor doesn't need it, and it would slow the first picture down.
	 */
	sources: string[];
}

/** A route's page component, as the router splits it (see vite.config.ts). */
const route = (name: string) => `src/routes/${name}.tsx?tsr-split=component`;

const editors = [
	['/video', m.editor_page_video(), m.editor_page_video_desc()],
	['/image', m.editor_page_image(), m.editor_page_image_desc()],
	['/gif', m.editor_page_gif(), m.editor_page_gif_desc()],
	['/audio', m.editor_page_audio(), m.editor_page_audio_desc()],
	['/subtitles', m.editor_page_subtitles(), m.editor_page_subtitles_desc()],
] as const;

const pages: Page[] = [
	{ path: '/', title: `Vixely — ${m.home_title()}`, description: m.site_description(), sources: [route('index')] },
	...editors.map(([path, title, description]) => ({
		path,
		title: `${title} — Vixely`,
		description,
		sources: [route(path.slice(1))],
	})),
	...TASKS.map((task) => ({
		path: `/tools/${task.slug}`,
		title: `${task.title()} — Vixely`,
		description: task.description(),
		faq: taskFaq(task.slug, 'en'),
		sources: [route('tools.$task')],
	})),
	...(['about', 'privacy', 'terms', 'legal'] as const).map((name) => {
		const content = PAGES[name]();
		return {
			path: `/${name}`,
			title: `${content.title} — Vixely`,
			description: content.description,
			index: name === 'about',
			sources: [route(name)],
		};
	}),
	// What the browser supports: useful to its reader, of no use to search engines.
	{ path: '/system', title: `${m.system_title()} — Vixely`, description: m.system_lede(), index: false, sources: [route('system')] },
];

function escape(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** A page's questions as schema.org FAQPage data, which search engines may show with the link. */
function structured(faq: [string, string][]): string {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faq.map(([question, answer]) => ({
			'@type': 'Question',
			name: question,
			acceptedAnswer: { '@type': 'Answer', text: answer },
		})),
	};
	return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
}

function head(page: Page): string {
	const url = `${SITE}${page.path}`;
	const title = escape(page.title);
	const description = escape(page.description);
	return [
		`<title>${title}</title>`,
		`<meta name="description" content="${description}" />`,
		`<link rel="canonical" href="${url}" />`,
		page.index === false ? '<meta name="robots" content="noindex" />' : '',
		'<meta property="og:type" content="website" />',
		'<meta property="og:site_name" content="Vixely" />',
		`<meta property="og:url" content="${url}" />`,
		`<meta property="og:title" content="${title}" />`,
		`<meta property="og:description" content="${description}" />`,
		`<meta property="og:image" content="${SITE}/og-image.png" />`,
		'<meta property="og:image:width" content="1200" />',
		'<meta property="og:image:height" content="630" />',
		'<meta name="twitter:card" content="summary_large_image" />',
		page.faq ? structured(page.faq) : '',
	]
		.filter(Boolean)
		.join('\n\t\t');
}

// The interface's font loads with the page rather than once the style sheet asks for it: text is
// drawn once, in its own font, instead of moving when the font arrives. Figures (Geist Mono) wait.
const fonts = readdirSync(join(DIST, 'assets')).filter((name) => /^geist-latin-wght-normal-.*\.woff2$/.test(name));
const preloads = fonts
	.map((name) => `<link rel="preload" href="/assets/${name}" as="font" type="font/woff2" crossorigin />`)
	.join('\n\t\t');
const template = readFileSync(join(DIST, 'index.html'), 'utf8').replace('</head>', `\t${preloads}\n\t</head>`);
const placeholder = /<title>[^<]*<\/title>\s*/;
if (!placeholder.test(template)) throw new Error('No <title> in dist/index.html');
const withoutDescription = template.replace(/\s*<meta name="description"[^>]*>/, '');

interface Chunk {
	file: string;
	imports?: string[];
	css?: string[];
}
const manifest = JSON.parse(readFileSync(join(DIST, '.vite/manifest.json'), 'utf8')) as Record<string, Chunk>;
const first = new Set<string>();
const gather = (key: string, into: Set<string>) => {
	const chunk = manifest[key];
	if (!chunk || into.has(key)) return;
	into.add(key);
	for (const imported of chunk.imports ?? []) gather(imported, into);
};
gather('index.html', first);

/**
 * What a page loads after the app starts, announced in its HTML: the browser fetches it all at
 * once instead of discovering it one step after another.
 */
function preloadsOf(page: Page): string {
	const keys = new Set<string>();
	for (const source of page.sources) {
		if (!manifest[source]) throw new Error(`${source} is not in the build manifest`);
		gather(source, keys);
	}
	const files = [...keys].filter((key) => !first.has(key)).map((key) => manifest[key]?.file ?? '');
	return files.map((file) => `<link rel="modulepreload" href="/${file}" />`).join('\n\t\t');
}

for (const page of pages) {
	const html = withoutDescription.replace(placeholder, `${head(page)}\n\t\t${preloadsOf(page)}\n\t\t`);
	// `/tools/compress-video` is served from `tools/compress-video.html` (see nginx.conf).
	const file = page.path === '/' ? join(DIST, 'index.html') : join(DIST, `${page.path.slice(1)}.html`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, html);
}

const listed = pages.filter((page) => page.index !== false);
writeFileSync(
	join(DIST, 'sitemap.xml'),
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
		.map((page) => `\t<url><loc>${SITE}${page.path}</loc></url>`)
		.join('\n')}\n</urlset>\n`,
);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Prerendered ${pages.length} pages, ${listed.length} in the sitemap.`);
