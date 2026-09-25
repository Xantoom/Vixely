/**
 * After the build: one HTML file per public page, its head filled in (title, description,
 * canonical address, link previews) so search engines and link previews read it without running
 * the app, and the sitemap and robots.txt listing them. The app itself then takes over as usual.
 * Written in English, the default language.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PAGES } from '../src/app/pages/content';
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
}

const editors = [
	['/video', m.editor_page_video(), m.editor_page_video_desc()],
	['/image', m.editor_page_image(), m.editor_page_image_desc()],
	['/gif', m.editor_page_gif(), m.editor_page_gif_desc()],
	['/audio', m.editor_page_audio(), m.editor_page_audio_desc()],
	['/subtitles', m.editor_page_subtitles(), m.editor_page_subtitles_desc()],
] as const;

const pages: Page[] = [
	{ path: '/', title: `Vixely — ${m.home_title()}`, description: m.site_description() },
	...editors.map(([path, title, description]) => ({ path, title: `${title} — Vixely`, description })),
	...TASKS.map((task) => ({
		path: `/tools/${task.slug}`,
		title: `${task.title()} — Vixely`,
		description: task.description(),
	})),
	...(['about', 'privacy', 'terms', 'legal'] as const).map((name) => {
		const content = PAGES[name]();
		return {
			path: `/${name}`,
			title: `${content.title} — Vixely`,
			description: content.description,
			index: name === 'about',
		};
	}),
];

function escape(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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
	]
		.filter(Boolean)
		.join('\n\t\t');
}

const template = readFileSync(join(DIST, 'index.html'), 'utf8');
const placeholder = /<title>[^<]*<\/title>\s*/;
if (!placeholder.test(template)) throw new Error('No <title> in dist/index.html');
const withoutDescription = template.replace(/\s*<meta name="description"[^>]*>/, '');

for (const page of pages) {
	const html = withoutDescription.replace(placeholder, `${head(page)}\n\t\t`);
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
