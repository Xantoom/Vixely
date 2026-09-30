/**
 * The pages around the editors: task pages set up their editor (Discord preset, GIF to MP4),
 * the pages about the site show, the title follows the page, and the language switches.
 */
import { engine, sample, BASE } from './engine';
import { mkdirSync } from 'node:fs';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const aside = page.locator('aside');

// Home: the tasks link to their pages.
await page.goto(`${BASE}/`);
await page.getByRole('link', { name: 'Compress a video', exact: true }).first().click();
await page.waitForURL('**/tools/compress-video');
await page.getByRole('heading', { name: 'Compress a video' }).waitFor();
console.log('home → compress:', await page.title());
await page.screenshot({ path: 'shots/task-empty.png' });

// Discord: the export opens converted, with the preset.
await page.goto(`${BASE}/tools/compress-video-for-discord`);
await page.setInputFiles('input[type=file]', sample('film.mkv'));
await aside.getByLabel('Made for').waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
console.log('discord preset:', await aside.getByLabel('Made for').textContent(), '|', await aside.getByLabel('Size limit').textContent());
await page.screenshot({ path: 'shots/task-discord.png' });

// GIF to MP4: saved as a video.
await page.goto(`${BASE}/tools/gif-to-mp4`);
await page.setInputFiles('input[type=file]', 'samples/anim.gif');
await page.waitForTimeout(3000);
await aside.screenshot({ path: 'shots/task-gif-to-mp4.png' });

// Pages about the site.
for (const path of ['/about', '/privacy', '/terms', '/legal']) {
	await page.goto(`${BASE}${path}`);
	await page.getByRole('heading', { level: 1 }).waitFor();
	console.log(path, '→', await page.title());
}
await page.screenshot({ path: 'shots/page-legal.png', fullPage: true });

// Language: chosen from a menu, the page changes in place without loading again.
let reloaded = false;
page.once('load', () => {
	reloaded = true;
});
await page.getByRole('button', { name: 'Language' }).click();
await page.getByRole('menuitemradio', { name: 'Français' }).click();
await page.getByRole('heading', { level: 1, name: 'Mentions légales' }).waitFor();
console.log('fr:', await page.title(), await page.evaluate(() => document.documentElement.lang), reloaded ? 'RELOADED' : 'in place');
await page.screenshot({ path: 'shots/page-legal-fr.png', fullPage: true });
await page.getByRole('button', { name: 'Langue' }).click();
await page.getByRole('menuitemradio', { name: 'English' }).click();
await page.getByRole('heading', { level: 1, name: 'Legal notice' }).waitFor();

// Theme: light, dark or the system's.
await page.getByRole('button', { name: 'Theme' }).click();
await page.getByRole('menuitemradio', { name: 'Dark' }).click();
console.log('theme:', await page.evaluate(() => document.documentElement.dataset.theme));
await page.getByRole('button', { name: 'Theme' }).click();
await page.getByRole('menuitemradio', { name: 'System' }).click();
console.log('theme after system:', await page.evaluate(() => document.documentElement.dataset.theme ?? 'system'));

// An unknown task is a 404.
await page.goto(`${BASE}/tools/nothing-here`);
console.log('unknown task:', await page.getByRole('heading', { level: 1 }).textContent());

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
