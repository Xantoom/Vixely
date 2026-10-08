/**
 * A video with many tracks: the Tracks tool lists them as a table, one line each, the default
 * sound track one at a time and every track kept or left out at once; the player's menus show
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
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Tracks', exact: true }).click();
await page.waitForTimeout(1500);

const lines = async (media: string) => aside.locator(`li[data-media=${media}]`).count();
console.log('lines (sound, subtitles):', await lines('audio'), await lines('subtitles'));

const defaults = async () =>
	aside
		.locator('li[data-media=audio]')
		.evaluateAll((items) =>
			items.map((item) => (item.querySelector('input[aria-label^="Default"]') as HTMLInputElement).checked),
		);
console.log('default sound before:', await defaults());
await aside.locator('li[data-media=audio]').getByRole('checkbox', { name: /^Default: Japanese/ }).check();
console.log('default sound after:', await defaults());

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

// Every sound track left out at once, then kept again.
await aside.getByRole('checkbox', { name: 'Keep every track' }).first().uncheck();
await page.waitForTimeout(300);
console.log('audio menu with none kept:', await page.getByRole('button', { name: 'Audio track', exact: true }).count());
await aside.getByRole('checkbox', { name: 'Keep every track' }).first().check();
await page.waitForTimeout(500);
console.log('audio menu kept again:', await page.getByRole('button', { name: 'Audio track', exact: true }).count());

await page.screenshot({ path: 'shots/video-tracks.png' });
console.log('errors', errors);
await browser.close();
