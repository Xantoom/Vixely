/**
 * After the build: one HTML file per public page and language (French under /fr), its head filled
 * in (title, description, canonical address, other languages, link previews, structured data) so
 * search engines and link previews read it without running the app, and the sitemap and robots.txt
 * listing them. The app itself then takes over as usual.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { homeCopy } from '../src/app/home/copy';
import { localePath } from '../src/app/locale';
import { PAGES } from '../src/app/pages/content';
import { TASKS } from '../src/app/tasks';
import { m } from '../src/paraglide/messages.js';
import { type Locale, locales, overwriteGetLocale } from '../src/paraglide/runtime.js';

const SITE = 'https://vixely.app';
/**
 * Where this build is served, for link previews: a preview deployment shows its own picture, not
 * the site's. The workflow gives the address (see .github/workflows/ci.yml).
 */
const HERE = process.env.PUBLIC_DOMAIN ? `https://${process.env.PUBLIC_DOMAIN}` : SITE;
const DIST = 'dist';

interface Page {
	/** Its address without the language: /video. */
	path: string;
	title: string;
	description: string;
	/** Pages of little interest to search engines, such as the legal notice. */
	index?: boolean;
	/** Its text, for those who read the page without running the app. */
	sections?: ReturnType<typeof PAGES.about>['sections'];
	/** Described to search engines as an application that runs in the browser. */
	app?: boolean;
	/**
	 * Its page component, whose code is announced to the browser early. An editor's own code is
	 * left out: the empty editor doesn't need it, and it would slow the first picture down.
	 */
	sources: string[];
}

/** A route's page component, as the router splits it (see vite.config.ts). */
const route = (name: string) => `src/routes/${name}.tsx?tsr-split=component`;

/** The pages, with their text in the language being written. */
function pagesInLanguage(): Page[] {
	const editors = [
		['/video', m.editor_page_video(), m.editor_page_video_desc()],
		['/image', m.editor_page_image(), m.editor_page_image_desc()],
		['/gif', m.editor_page_gif(), m.editor_page_gif_desc()],
		['/audio', m.editor_page_audio(), m.editor_page_audio_desc()],
		['/subtitles', m.editor_page_subtitles(), m.editor_page_subtitles_desc()],
	] as const;
	const home = homeCopy();
	return [
		{
			path: '/',
			title: `Vixely | ${m.home_title()}`,
			description: m.site_description(),
			app: true,
			sections: [{ title: home.faqTitle, body: home.faq.map(([question, answer]) => <p key={question}><strong>{question}</strong> {answer}</p>) }],
			sources: [route('index')],
		},
		...editors.map(([path, title, description]) => ({
			path,
			title: `${title} | Vixely`,
			description,
			app: true,
			sources: [route(path.slice(1))],
		})),
		...TASKS.map((task) => ({
			path: `/tools/${task.slug}`,
			title: `${task.title()} | Vixely`,
			description: task.description(),
			app: true,
			sources: [route('tools.$task')],
		})),
		...(['about', 'privacy', 'terms', 'legal'] as const).map((name) => {
			const content = PAGES[name]();
			return {
				path: `/${name}`,
				title: `${content.title} | Vixely`,
				description: content.description,
				index: name === 'about',
				sections: content.sections,
				sources: [route(name)],
			};
		}),
		// What the browser supports: useful to its reader, of no use to search engines.
		{ path: '/system', title: `${m.system_title()} | Vixely`, description: m.system_lede(), index: false, sources: [route('system')] },
	];
}

function escape(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** The page without JavaScript: its title, what it is about, and its text when it is all text. */
function fallback(page: Page): string {
	const text = page.sections?.map(({ title, body }) => (
		<section key={title}>
			<h2>{title}</h2>
			{body}
		</section>
	));
	const main = (
		<main>
			<h1>{page.title}</h1>
			<p>{page.description}</p>
			{text}
		</main>
	);
	return `<noscript>${renderToStaticMarkup(main)}</noscript>`;
}

const OG_LOCALE: Record<Locale, string> = { en: 'en_US', fr: 'fr_FR' };

/** What search engines read about the page beyond its text: an application, free, in the browser. */
function structuredData(page: Page, locale: Locale, url: string): string {
	const data: Record<string, unknown>[] = [];
	if (page.app) {
		data.push({
			'@context': 'https://schema.org',
			'@type': 'WebApplication',
			name: page.title.replace(/^Vixely \| | \| Vixely$/g, ''),
			url,
			description: page.description,
			inLanguage: locale,
			applicationCategory: 'MultimediaApplication',
			operatingSystem: 'Any',
			browserRequirements: 'Requires WebAssembly and WebCodecs',
			isAccessibleForFree: true,
			offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
		});
	}
	if (page.path === '/') {
		data.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Vixely', url, inLanguage: locale });
		data.push({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			inLanguage: locale,
			mainEntity: homeCopy().faq.map(([question, answer]) => ({
				'@type': 'Question',
				name: question,
				acceptedAnswer: { '@type': 'Answer', text: answer },
			})),
		});
	}
	return data
		.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll('<', '\\u003c')}</script>`)
		.join('\n\t\t');
}

function head(page: Page, locale: Locale): string {
	const url = `${SITE}${localePath(page.path, locale)}`;
	const title = escape(page.title);
	const description = escape(page.description);
	const alternates =
		page.index === false
			? []
			: [
					...locales.map((other) => `<link rel="alternate" hreflang="${other}" href="${SITE}${localePath(page.path, other)}" />`),
					`<link rel="alternate" hreflang="x-default" href="${SITE}${page.path}" />`,
				];
	return [
		`<title>${title}</title>`,
		`<meta name="description" content="${description}" />`,
		`<link rel="canonical" href="${url}" />`,
		...alternates,
		page.index === false ? '<meta name="robots" content="noindex" />' : '',
		'<meta property="og:type" content="website" />',
		'<meta property="og:site_name" content="Vixely" />',
		`<meta property="og:url" content="${url}" />`,
		`<meta property="og:title" content="${title}" />`,
		`<meta property="og:description" content="${description}" />`,
		`<meta property="og:locale" content="${OG_LOCALE[locale]}" />`,
		...locales.filter((other) => other !== locale).map((other) => `<meta property="og:locale:alternate" content="${OG_LOCALE[other]}" />`),
		`<meta property="og:image" content="${HERE}/og-image.png" />`,
		'<meta property="og:image:width" content="1200" />',
		'<meta property="og:image:height" content="630" />',
		'<meta name="twitter:card" content="summary_large_image" />',
		structuredData(page, locale, url),
	]
		.filter(Boolean)
		.join('\n\t\t');
}

// The interface uses the system's own font: nothing to preload. Geist is only a text layer's.
const template = readFileSync(join(DIST, 'index.html'), 'utf8');
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

/** The file a page is served from: /tools/compress-video is tools/compress-video.html (wrangler.jsonc). */
const fileOf = (path: string) => (path === '/' ? join(DIST, 'index.html') : join(DIST, `${path.slice(1)}.html`));

let listed: { path: string }[] = [];
let count = 0;
for (const locale of locales) {
	overwriteGetLocale(() => locale);
	const pages = pagesInLanguage();
	if (locale === 'en') listed = pages.filter((page) => page.index !== false);
	for (const page of pages) {
		const html = withoutDescription
			.replace('<html lang="en">', `<html lang="${locale}">`)
			.replace(placeholder, `${head(page, locale)}\n\t\t${preloadsOf(page)}\n\t\t`)
			.replace('<div id="root"></div>', `<div id="root"></div>\n\t\t${fallback(page)}`);
		const file = fileOf(localePath(page.path, locale));
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, html);
		count++;
	}
}

// Any other address: the app's page, which says the page doesn't exist, with a 404 (wrangler.jsonc).
writeFileSync(
	join(DIST, '404.html'),
	withoutDescription.replace(placeholder, '<title>Vixely</title>\n\t\t<meta name="robots" content="noindex" />\n\t\t'),
);
// Vite's manifest isn't published.
writeFileSync(join(DIST, '.assetsignore'), '.vite\n');

const alternatesOf = (path: string) =>
	[...locales, 'x-default']
		.map((locale) => {
			const href = `${SITE}${locale === 'x-default' ? path : localePath(path, locale as Locale)}`;
			return `<xhtml:link rel="alternate" hreflang="${locale}" href="${href}"/>`;
		})
		.join('');
writeFileSync(
	join(DIST, 'sitemap.xml'),
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${locales
		.flatMap((locale) => listed.map((page) => `\t<url><loc>${SITE}${localePath(page.path, locale)}</loc>${alternatesOf(page.path)}</url>`))
		.join('\n')}\n</urlset>\n`,
);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Prerendered ${count} pages in ${locales.length} languages, ${listed.length * locales.length} in the sitemap.`);
