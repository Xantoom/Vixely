/**
 * A video with many tracks: Export lists them, one line each, long lists folded, each opening a
 * page of its own where one sound track at a time is the default; the player's menus show
 * four choices before scrolling, sound with its codec, channels and bitrate, subtitles with their
 * kind.
 */
import { engine, BASE } from './engine';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const aside = page.locator('aside');

await page.goto(`${BASE}/video`);
await page.setInputFiles('input[type=file]', 'samples/many-tracks.mkv');
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Export', exact: true }).click();
await page.waitForTimeout(1500);

const lines = async (media: string) => aside.locator(`[data-media=${media}] li`).count();
console.log('lines folded (sound, subtitles):', await lines('audio'), await lines('subtitles'));
await aside.getByRole('button', { name: /^Show \d+ more/ }).first().click();
console.log('lines unfolded (sound, subtitles):', await lines('audio'), await lines('subtitles'));

const defaults = async () =>
	aside
		.locator('[data-media=audio] li')
		.evaluateAll((items) => items.map((item) => item.textContent?.includes('Default') ?? false));
console.log('default sound before:', await defaults());
await aside.locator('[data-media=audio] li button').filter({ hasText: 'Japanese' }).first().click();
await aside.getByRole('switch', { name: 'Played by default' }).click();
await page.screenshot({ path: 'shots/video-track-page.png' });
await aside.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(400);
console.log('default sound after:', await defaults());
console.log('focus back on:', await page.evaluate(() => document.activeElement?.textContent));

const menu = async (label: string) => {
	await page.getByRole('button', { name: label, exact: true }).click();
	const list = page.getByRole('menu');
	await page.waitForTimeout(800);
	const scrolls = await list.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
	const items = await page
		.getByRole('menuitemradio')
		.evaluateAll((all) => all.map((item) => (item as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
	await page.keyboard.press('Escape');
	return { scrolls, items };
};
console.log('audio menu:', await menu('Audio track'));
console.log('subtitle menu:', await menu('Subtitles'));

// A sound track left out is no longer offered by the player.
const first = aside.locator('[data-media=audio] li').first().getByRole('switch');
await first.click();
await page.waitForTimeout(300);
console.log('audio menu with one left out:', (await menu('Audio track')).items.length);
await first.click();
await page.waitForTimeout(300);

await page.screenshot({ path: 'shots/video-tracks.png' });
console.log('errors', errors);
await browser.close();
