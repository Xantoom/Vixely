/**
 * Accessibility audit: axe-core (WCAG 2.2 A and AA) on every page, and on every editor with a
 * file open, one run per tool panel, in the light and the dark theme. Prints each rule broken
 * once, with where it was seen.
 */
import { chromium, type Page } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

interface Found {
	impact: string;
	help: string;
	where: Set<string>;
	nodes: Set<string>;
}
const found = new Map<string, Found>();
const errors: string[] = [];

async function audit(page: Page, where: string) {
	await page.addScriptTag({ content: axe });
	const result = await page.evaluate(async () => {
		// @ts-expect-error injected
		const run = await window.axe.run(document, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
		});
		return run.violations.map((v: { id: string; impact: string; help: string; nodes: { target: string[]; failureSummary: string }[] }) => ({
			id: v.id,
			impact: v.impact,
			help: v.help,
			nodes: v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary.split('\n').slice(1, 2).join(' ').trim()}`),
		}));
	});
	for (const v of result) {
		const entry = found.get(v.id) ?? { impact: v.impact, help: v.help, where: new Set(), nodes: new Set() };
		entry.where.add(where);
		for (const node of v.nodes.slice(0, 6)) entry.nodes.add(node);
		found.set(v.id, entry);
	}
}

const EDITORS: [string, string, string][] = [
	['/video', 'samples/film.mkv', '[role=group][aria-label="Tracks"]'],
	['/image', 'samples/photo.heic', 'nav[aria-label="Editing tools"]'],
	['/gif', 'samples/anim.gif', 'nav[aria-label="Editing tools"]'],
	['/audio', 'samples/film.mp4', 'nav[aria-label="Editing tools"]'],
	['/subtitles', 'samples/sample.mkv', 'nav[aria-label="Editing tools"]'],
];

const browser = await chromium.launch();
for (const scheme of ['light', 'dark'] as const) {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', colorScheme: scheme });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	for (const path of ['/', '/about', '/privacy', '/terms', '/legal', '/system', '/tools/compress-video', '/tools/nothing']) {
		await page.goto(`${BASE}${path}`);
		await page.waitForTimeout(800);
		await audit(page, `${scheme} ${path}`);
	}
	for (const [path, file, ready] of EDITORS) {
		await page.goto(`${BASE}${path}`);
		await page.waitForTimeout(500);
		await audit(page, `${scheme} ${path} empty`);
		await page.setInputFiles('input[type=file]', file);
		await page.waitForSelector(ready, { timeout: 30000 });
		await page.waitForTimeout(2500);
		const tools = page.locator('nav[aria-label="Editing tools"] button');
		const count = await tools.count();
		for (let i = 0; i < count; i++) {
			const tool = tools.nth(i);
			const name = (await tool.getAttribute('aria-label')) ?? (await tool.innerText());
			if (await tool.isDisabled()) continue;
			await tool.click();
			await page.waitForTimeout(600);
			await audit(page, `${scheme} ${path} ${name}`);
		}
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await page.waitForTimeout(1000);
		await audit(page, `${scheme} ${path} export`);
		// A list open, as drawn by the app.
		const lists = page.locator('aside button[aria-haspopup=listbox]');
		for (let i = 0; i < (await lists.count()); i++) {
			const opened = await lists
				.nth(i)
				.click({ timeout: 1500 })
				.then(() => true)
				.catch(() => false);
			if (!opened) continue;
			await page.waitForTimeout(300);
			await audit(page, `${scheme} ${path} export list`);
			await page.keyboard.press('Escape');
			break;
		}
	}
	await ctx.close();
}
await browser.close();

const order = ['critical', 'serious', 'moderate', 'minor'];
const sorted = [...found.entries()].sort((a, b) => order.indexOf(a[1].impact) - order.indexOf(b[1].impact));
for (const [id, f] of sorted) {
	console.log(`\n[${f.impact}] ${id}: ${f.help}`);
	console.log(`  seen: ${[...f.where].slice(0, 8).join(' | ')}${f.where.size > 8 ? ` (+${f.where.size - 8})` : ''}`);
	for (const node of [...f.nodes].slice(0, 10)) console.log(`   · ${node}`);
}
console.log(`\n${found.size} rules broken.`);
console.log(errors.length ? `errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'no errors');
