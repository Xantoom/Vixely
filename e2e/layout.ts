/**
 * Small screens and zoom: every page and editor (a file open, each tool) at phone width, and at
 * 200 % zoom on a laptop, must not scroll sideways nor push anything out of the screen.
 */
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
mkdirSync('shots', { recursive: true });

async function check(page: Page, where: string) {
	const out = await page.evaluate(() => {
		const width = document.documentElement.clientWidth;
		const problems: string[] = [];
		if (document.documentElement.scrollWidth > width + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${width})`);
		for (const el of document.querySelectorAll<HTMLElement>('button, a, input, [role=slider], [role=combobox], label, h1, h2, p')) {
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) continue;
			// Inside something that scrolls sideways on purpose.
			let parent = el.parentElement;
			let scrolls = false;
			while (parent) {
				const style = getComputedStyle(parent);
				if ((style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden' || style.overflowX === 'clip') && parent !== document.body) {
					scrolls = true;
					break;
				}
				parent = parent.parentElement;
			}
			if (scrolls) continue;
			if (rect.right > width + 1 || rect.left < -1)
				problems.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" at ${Math.round(rect.left)}–${Math.round(rect.right)}`);
		}
		return problems.slice(0, 8);
	});
	if (out.length) console.log(`${where}:\n  ${out.join('\n  ')}`);
}

const EDITORS: [string, string][] = [
	['/video', 'samples/film.mkv'],
	['/image', 'samples/photo.heic'],
	['/gif', 'samples/anim.gif'],
	['/audio', 'samples/film.mp4'],
	['/subtitles', 'samples/sample.mkv'],
];

const browser = await chromium.launch();
for (const [name, options] of [
	['phone', { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
	['zoom', { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }],
] as const) {
	const page = await (await browser.newContext({ ...options, locale: 'fr-FR' })).newPage();
	for (const path of ['/', '/about', '/legal', '/system', '/tools/compress-video-for-discord']) {
		await page.goto(`${BASE}${path}`);
		await page.waitForTimeout(800);
		await check(page, `${name} ${path}`);
	}
	for (const [path, file] of EDITORS) {
		await page.goto(`${BASE}${path}`);
		await page.waitForTimeout(500);
		await check(page, `${name} ${path} empty`);
		await page.setInputFiles('input[type=file]', file);
		await page.waitForTimeout(6000);
		const tools = page.locator('nav[aria-label] button[aria-pressed]');
		for (let i = 0; i < (await tools.count()); i++) {
			const tool = tools.nth(i);
			if (await tool.isDisabled()) continue;
			const label = await tool.innerText();
			await tool.click();
			await page.waitForTimeout(500);
			await check(page, `${name} ${path} ${label}`);
		}
		const exp = page.getByRole('button', { name: 'Exporter', exact: true });
		if (await exp.isVisible()) {
			await exp.click();
			await page.waitForTimeout(800);
			await check(page, `${name} ${path} export`);
		} else console.log(`${name} ${path}: no visible Export button`);
		await page.screenshot({ path: `shots/${name}-${path.slice(1)}.png`, fullPage: true });
	}
	await page.context().close();
}
await browser.close();
console.log('done');
