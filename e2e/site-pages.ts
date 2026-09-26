/**
 * The pages around the editors: task pages set up their editor (Discord preset, GIF to MP4),
 * the pages about the site show, the title follows the page, and the language switches.
 */
import { engine, sample } from './engine';
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
await page.goto('http://localhost:5173/');
await page.getByRole('link', { name: /^Compress a video Video/ }).click();
await page.waitForURL('**/tools/compress-video');
await page.getByRole('heading', { name: 'Compress a video' }).waitFor();
console.log('home → compress:', await page.title());
await page.screenshot({ path: 'shots/task-empty.png' });

// Discord: the export opens converted, with the preset.
await page.goto('http://localhost:5173/tools/compress-video-for-discord');
await page.setInputFiles('input[type=file]', sample('film.mkv'));
await aside.getByLabel('Made for').waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
console.log('discord preset:', await aside.getByLabel('Made for').textContent(), '|', await aside.getByLabel('Size limit').textContent());
await page.screenshot({ path: 'shots/task-discord.png' });

// GIF to MP4: saved as a video.
await page.goto('http://localhost:5173/tools/gif-to-mp4');
await page.setInputFiles('input[type=file]', 'samples/anim.gif');
await page.waitForTimeout(3000);
await aside.screenshot({ path: 'shots/task-gif-to-mp4.png' });

// Pages about the site.
for (const path of ['/about', '/privacy', '/terms', '/legal']) {
	await page.goto(`http://localhost:5173${path}`);
	await page.getByRole('heading', { level: 1 }).waitFor();
	console.log(path, '→', await page.title());
}
await page.screenshot({ path: 'shots/page-legal.png', fullPage: true });

// Language.
// The page loads again in the other language.
await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Français' }).click()]);
await page.getByRole('heading', { level: 1 }).waitFor();
console.log('fr:', await page.title());
await page.screenshot({ path: 'shots/page-legal-fr.png', fullPage: true });
await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'English' }).click()]);

// An unknown task is a 404.
await page.goto('http://localhost:5173/tools/nothing-here');
console.log('unknown task:', await page.getByRole('heading', { level: 1 }).textContent());

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
