#!/usr/bin/env node
/**
 * Post-build SEO pre-render.
 *
 * Non-JS crawlers (Bing, DDG, GPTBot, ClaudeBot, most AI agents) cannot render
 * the SPA. Without per-route HTML files they all receive the same index.html
 * with homepage meta. This script copies dist/index.html into per-route files
 * with the correct <title>, <meta name="description">, <link rel="canonical">,
 * og/twitter tags and route-specific JSON-LD. React-helmet still overrides
 * everything client-side for browsers that do render JS, so crawlers and
 * browsers both get consistent metadata.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	DEFAULT_OG_ALT,
	DEFAULT_OG_IMAGE,
	ORG_SCHEMA,
	SITE_URL,
	breadcrumbSchema,
	routes,
} from './seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeJsonForScript(json) {
	return JSON.stringify(json).replace(/</g, '\\u003c');
}

function buildHead(route) {
	const canonical = `${SITE_URL}${route.path}`;
	const title = route.title;
	const description = route.description;
	const schemas = [ORG_SCHEMA, ...route.schemas];
	if (route.path !== '/') {
		schemas.push(breadcrumbSchema(title, route.path));
	}

	const jsonLd = schemas
		.map(
			(schema) =>
				`		<script type="application/ld+json">${escapeJsonForScript(schema)}</script>`,
		)
		.join('\n');

	return `		<title>${escapeHtml(title)}</title>
		<meta name="description" content="${escapeHtml(description)}" />
		<link rel="canonical" href="${escapeHtml(canonical)}" />
		<meta property="og:title" content="${escapeHtml(title)}" />
		<meta property="og:description" content="${escapeHtml(description)}" />
		<meta property="og:url" content="${escapeHtml(canonical)}" />
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content="Vixely" />
		<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />
		<meta property="og:image:secure_url" content="${DEFAULT_OG_IMAGE}" />
		<meta property="og:image:type" content="image/png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content="${DEFAULT_OG_ALT}" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${escapeHtml(title)}" />
		<meta name="twitter:description" content="${escapeHtml(description)}" />
		<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />
		<meta name="twitter:image:alt" content="${DEFAULT_OG_ALT}" />
		<meta name="robots" content="index, follow, max-image-preview:large" />
${jsonLd}`;
}

function rewriteHead(html, route) {
	let output = html;
	const stripPatterns = [
		/\s*<title>[^<]*<\/title>/i,
		/\s*<meta\s+name="description"[^>]*>/gi,
		/\s*<link\s+rel="canonical"[^>]*>/gi,
		/\s*<meta\s+property="og:[^"]+"[^>]*>/gi,
		/\s*<meta\s+name="twitter:[^"]+"[^>]*>/gi,
		/\s*<meta\s+name="robots"[^>]*>/gi,
	];
	for (const pattern of stripPatterns) {
		output = output.replace(pattern, '');
	}
	const head = buildHead(route);
	output = output.replace(/<\/head>/i, `\n${head}\n\t</head>`);
	return output;
}

async function main() {
	const indexPath = resolve(DIST_DIR, 'index.html');
	const source = await readFile(indexPath, 'utf8');

	for (const route of routes) {
		const html = rewriteHead(source, route);
		if (route.path === '/') {
			await writeFile(indexPath, html, 'utf8');
			console.log(`[prerender] wrote ${indexPath}`);
			continue;
		}
		const targetDir = resolve(DIST_DIR, route.path.replace(/^\//, ''));
		await mkdir(targetDir, { recursive: true });
		const targetPath = resolve(targetDir, 'index.html');
		await writeFile(targetPath, html, 'utf8');
		console.log(`[prerender] wrote ${targetPath}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error('[prerender] failed');
	console.error(message);
	process.exit(1);
});
