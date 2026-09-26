/**
 * Keyboard audit: walks every page and editor (a file open, each tool) with Tab, and reports
 * what takes the focus without showing it, and what reacts to the mouse but can't be reached
 * with the keyboard.
 */
import { chromium, type Page } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';

const noRing = new Map<string, Set<string>>();
const unreachable = new Map<string, Set<string>>();
const add = (map: Map<string, Set<string>>, key: string, where: string) => {
	const set = map.get(key) ?? new Set();
	set.add(where);
	map.set(key, set);
};

async function walk(page: Page, where: string) {
	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur();
		window.scrollTo(0, 0);
	});
	const seen = new Set<string>();
	let last: string | null = null;
	for (let i = 0; i < 400; i++) {
		await page.keyboard.press('Tab');
		const info = await page.evaluate(() => {
			const el = document.activeElement as HTMLElement | null;
			if (!el || el === document.body) return null;
			const style = getComputedStyle(el);
			const ring =
				(style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
				style.boxShadow !== 'none' ||
				// A field whose frame changes colour when focused.
				el.matches(':focus-within') && el.closest('label,[data-focus-frame]') !== null;
			const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
			const key = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${name}"`;
			return { key, ring, id: el.dataset.walk ?? (el.dataset.walk = String(Math.random())) };
		});
		if (!info) continue;
		// A date field takes a Tab per part: the same element again is not the walk looping.
		if (info.id === last) continue;
		if (seen.has(info.id)) break;
		last = info.id;
		seen.add(info.id);
		if (!info.ring) add(noRing, info.key, where);
	}
	// Things that look clickable (pointer cursor) the Tab walk never reached.
	const missed = await page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>('body *')) {
			if (getComputedStyle(el).cursor !== 'pointer') continue;
			if (el.dataset.walk) continue;
			if (el.closest('[data-walk]')) continue;
			if (el.closest('[aria-hidden=true],[inert]')) continue;
			if ((el as HTMLButtonElement).disabled) continue;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) continue;
			// A label whose field was reached.
			if (el instanceof HTMLLabelElement && (el.control as HTMLElement | null)?.dataset.walk) continue;
			// Inside a label whose field was reached.
			if (el.closest('label')?.querySelector('[data-walk]')) continue;
			// Its parent is also pointer: report the outermost only.
			if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
			out.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`);
		}
		return out;
	});
	for (const key of missed) add(unreachable, key, where);
}

const EDITORS: [string, string, string][] = [
	['/video', 'samples/film.mkv', '[role=group][aria-label="Tracks"]'],
	['/image', 'samples/photo.heic', 'nav[aria-label="Editing tools"]'],
	['/gif', 'samples/anim.gif', 'nav[aria-label="Editing tools"]'],
	['/audio', 'samples/film.mp4', 'nav[aria-label="Editing tools"]'],
	['/subtitles', 'samples/sample.mkv', 'nav[aria-label="Editing tools"]'],
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' })).newPage();
for (const path of ['/', '/about', '/system', '/tools/compress-video']) {
	await page.goto(`${BASE}${path}`);
	await page.waitForTimeout(800);
	await walk(page, path);
}
for (const [path, file, ready] of EDITORS) {
	await page.goto(`${BASE}${path}`);
	await page.setInputFiles('input[type=file]', file);
	await page.waitForSelector(ready, { timeout: 30000 });
	await page.waitForTimeout(2500);
	const tools = page.locator('nav[aria-label="Editing tools"] button');
	for (let i = 0; i < (await tools.count()); i++) {
		const tool = tools.nth(i);
		if (await tool.isDisabled()) continue;
		const name = await tool.innerText();
		await tool.click();
		await page.waitForTimeout(600);
		await walk(page, `${path} ${name}`);
	}
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.waitForTimeout(1000);
	await walk(page, `${path} export`);
}
await browser.close();

const print = (title: string, map: Map<string, Set<string>>) => {
	console.log(`\n${title} (${map.size})`);
	for (const [key, where] of map) console.log(`  ${key}  ← ${[...where].slice(0, 4).join(' | ')}${where.size > 4 ? ` (+${where.size - 4})` : ''}`);
};
print('Focused without a visible ring', noRing);
print('Clickable but never reached with Tab', unreachable);
