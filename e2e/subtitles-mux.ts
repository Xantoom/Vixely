/**
 * Subtitles put back into videos, nothing re-encoded: an edited SRT track in an MKV, new lines in
 * an MP4 (written as timed text), a shifted PGS track; each file is opened again to check its
 * tracks and lines. Optional: a large MKV as the first argument times the whole export, written
 * to a file picker that throws the bytes away.
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const big = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const aside = page.locator('aside');
mkdirSync('shots', { recursive: true });

const open = async (path: string | { name: string; mimeType: string; buffer: Buffer }) => {
	await page.goto('http://localhost:5173/subtitles');
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=grid]', { timeout: 60000 });
};
const exportVideo = async (from: 'subtitles' | 'video') => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	if (from === 'subtitles') await aside.getByRole('radio', { name: /The video/ }).click();
	await page.waitForTimeout(500);
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 60000 }),
		page.locator('aside + div').getByRole('button').first().click(),
	]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()) };
};
const tracks = async () => (await aside.getByRole('radiogroup').innerText()).replace(/\n/g, ' | ');
const grid = async () => (await page.getByRole('grid').innerText()).replace(/\n/g, ' ').slice(0, 160);

// 1. MKV: the first line of the French SRT retyped, exported from the subtitle editor.
await open('samples/film.mkv');
await page.getByRole('grid').getByRole('row').nth(1).click();
await page.getByLabel('Text', { exact: true }).fill('Edited in Vixely');
await page.getByLabel('Text', { exact: true }).blur();
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /The video/ }).click();
await page.waitForTimeout(300);
await aside.screenshot({ path: 'shots/mux-panel.png' });
const mkv = await exportVideo('video');
writeFileSync('shots/mux-film.mkv', mkv.data);
console.log('exported', mkv.name, mkv.data.length, 'bytes');
await open({ name: 'mux-film.mkv', mimeType: 'video/x-matroska', buffer: mkv.data });
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Info' }).click();
console.log('reopened tracks:', await tracks());
console.log('reopened lines:', await grid());

// 2. MP4 without subtitles: new lines marked on the audio box, exported from the video editor.
await open('samples/h264.mp4');
const box = await page.getByRole('application', { name: 'Sound of the line' }).boundingBox();
if (box) {
	await page.mouse.move(box.x + 60, box.y + 40);
	await page.mouse.down();
	await page.mouse.move(box.x + 200, box.y + 40, { steps: 5 });
	await page.mouse.up();
}
await page.getByLabel('Text', { exact: true }).fill('New line in MP4');
await page.getByLabel('Text', { exact: true }).blur();
await page.getByRole('button', { name: 'Back to the video' }).click();
const mp4 = await exportVideo('video');
console.log('exported', mp4.name, mp4.data.length, 'bytes');
await open({ name: 'mux-h264.mp4', mimeType: 'video/mp4', buffer: mp4.data });
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Info' }).click();
console.log('reopened tracks:', await tracks());
console.log('reopened lines:', await grid());

// 3. The PGS track of an mkvmerge file shifted by half a second.
await open('samples/sample.mkv');
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Timing' }).click();
await aside.getByLabel('Shift by').fill('0.5');
await aside.getByLabel('Shift by').press('Enter');
await aside.getByRole('button', { name: /^Shift \+0\.500 s/ }).click();
const pgs = await exportVideo('subtitles');
await open({ name: 'mux-pgs.mkv', mimeType: 'video/x-matroska', buffer: pgs.data });
console.log('reopened pgs:', await grid());

// 4. A large MKV, written to a file that throws the bytes away: how long the export takes.
if (big) {
	const discard = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
	await discard.addInitScript(() => {
		let written = 0;
		Object.defineProperty(window, 'showSaveFilePicker', {
			value: async () => ({
				createWritable: async () => ({
					write: async (data: { byteLength?: number }) => {
						written += data.byteLength ?? 0;
					},
					close: async () => {
						console.log(`written ${written}`);
					},
					abort: async () => {},
				}),
			}),
		});
	});
	const large = await discard.newPage();
	const closed = new Promise<string>((resolve) => {
		large.on('console', (m) => {
			if (m.text().startsWith('written')) resolve(m.text());
		});
	});
	await large.goto('http://localhost:5173/subtitles');
	await large.setInputFiles('input[type=file]', big);
	await large.waitForSelector('[role=grid]', { timeout: 60000 });
	await large.getByRole('button', { name: 'Export', exact: true }).click();
	await large.locator('aside').getByRole('radio', { name: /The video/ }).click();
	const start = Date.now();
	await large.locator('aside + div').getByRole('button').first().click();
	console.log(await closed, 'bytes in', Date.now() - start, 'ms');
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
