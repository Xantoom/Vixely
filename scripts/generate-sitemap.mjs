#!/usr/bin/env node
/**
 * Generates dist/sitemap.xml from scripts/seo-routes.mjs with today's date
 * as <lastmod>. Runs at build time so submissions always reflect the latest
 * deploy.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL, routes } from './seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');

function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function toIsoDate(date) {
	return date.toISOString().slice(0, 10);
}

function buildSitemap() {
	const today = toIsoDate(new Date());
	const urls = routes
		.map((route) => {
			const loc = `${SITE_URL}${route.path === '/' ? '/' : route.path}`;
			return `	<url>
		<loc>${escapeXml(loc)}</loc>
		<lastmod>${today}</lastmod>
		<changefreq>${route.changefreq ?? 'monthly'}</changefreq>
		<priority>${(route.priority ?? 0.5).toFixed(1)}</priority>
	</url>`;
		})
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function main() {
	const target = resolve(DIST_DIR, 'sitemap.xml');
	await writeFile(target, buildSitemap(), 'utf8');
	console.log(`[sitemap] wrote ${target}`);
}

main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error('[sitemap] failed');
	console.error(message);
	process.exit(1);
});
