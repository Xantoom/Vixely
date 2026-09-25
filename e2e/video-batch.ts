/**
 * A batch of videos converted with the Discord preset: each under 10 MB, keeping its sound and
 * subtitle tracks. With FFPROBE set, each file is checked by FFmpeg's probe.
 */
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', acceptDownloads: true });
// Downloads rather than the folder picker, which a headless browser can't show.
await ctx.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const aside = page.locator('aside');

await page.goto('http://localhost:5173/video');
await page.setInputFiles('input[type=file]', ['samples/film.mkv', 'samples/h264.mp4', 'samples/rotated.mp4']);
await page.getByRole('region', { name: 'Batch' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Made for').click();
await page.getByRole('option', { name: /Discord/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/video-batch.png' });

const files: string[] = [];
page.on('download', async (download) => {
	const path = `shots/batch-${download.suggestedFilename()}`;
	writeFileSync(path, readFileSync(await download.path()));
	files.push(path);
});
const t0 = Date.now();
await page.locator('aside + div').getByRole('button').first().click();
await page.getByText(/3 files exported/).waitFor({ timeout: 600000 });
await page.waitForTimeout(1000);
console.log(`batch in ${Date.now() - t0} ms`);
await page.screenshot({ path: 'shots/video-batch-done.png' });

for (const path of files.sort()) {
	const size = readFileSync(path).length;
	console.log(`${path}: ${(size / 1e6).toFixed(2)} MB`);
	if (!ffprobe) continue;
	const run = (args: string[]) => spawnSync(ffprobe, ['-v', 'error', ...args, path], { encoding: 'utf8' }).stdout.trim();
	console.log(' ', run(['-show_entries', 'format=duration', '-of', 'csv=p=0']), 's');
	console.log(' ', run(['-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:stream_tags=language', '-of', 'compact']).replace(/\n/g, '\n  '));
}

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
