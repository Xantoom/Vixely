/**
 * Converting videos in the video editor: an MKV with a passage removed and its colours changed
 * (subtitles moved up, fonts kept), an MP4 with timed text, and a WebM at 480p. With FFPROBE set,
 * each file is checked by FFmpeg's probe.
 */
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', acceptDownloads: true });
// Downloads rather than the file picker, which a headless browser can't show.
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');

const open = async (path: string) => {
	await page.goto('http://localhost:5173/video');
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
	await page.waitForTimeout(1500);
};
const removePassage = async (from: number, to: number, duration: number) => {
	await tools.getByRole('button', { name: 'Trim' }).click();
	const lanes = (await page.getByRole('group', { name: 'Tracks' }).boundingBox())!;
	const x = (t: number) => lanes.x + (t / duration) * lanes.width;
	await page.mouse.move(x(from), lanes.y + 20);
	await page.mouse.down();
	await page.mouse.move(x(to), lanes.y + 20, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.press('Delete');
};
const convert = async (name: string, choose: () => Promise<void> = async () => {}, mode = /Convert/) => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await aside.getByRole('radio', { name: mode }).click();
	await choose();
	await page.waitForTimeout(300);
	await aside.screenshot({ path: `shots/${name}-panel.png` });
	const t0 = Date.now();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 300000 }),
		page.locator('aside + div').getByRole('button').first().click(),
	]);
	const data = readFileSync(await download.path());
	writeFileSync(`shots/${name}`, data);
	console.log(`${download.suggestedFilename()}: ${data.length} bytes in ${Date.now() - t0} ms`);
	return `shots/${name}`;
};
const probe = (path: string) => {
	if (!ffprobe) return;
	const run = (args: string[]) => spawnSync(ffprobe, ['-v', 'error', ...args, path], { encoding: 'utf8' }).stdout.trim();
	console.log(' ', run(['-show_entries', 'format=duration', '-of', 'csv=p=0']), 's');
	console.log(' ', run(['-show_entries', 'stream=index,codec_type,codec_name,width,height:stream_tags=language,filename', '-of', 'compact']).replace(/\n/g, '\n  '));
};
const firstLines = (path: string, stream: string) => {
	if (!ffprobe) return;
	const ffmpeg = ffprobe.replace(/ffprobe$/, 'ffmpeg');
	const srt = spawnSync(ffmpeg, ['-v', 'error', '-i', path, '-map', stream, '-f', 'srt', '-'], { encoding: 'utf8' }).stdout;
	console.log('  lines:', srt.split('\n\n').slice(3, 6).map((cue) => cue.split('\n').slice(1).join(' ')).join(' | '));
};

// 1. MKV: 0:10 → 0:20 removed, colours changed, subtitles and fonts carried over.
await open('samples/film.mkv');
await removePassage(10, 20, 60);
await tools.getByRole('button', { name: 'Adjust' }).click();
await aside.getByLabel('Saturation').focus();
for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowLeft');
const mkv = await convert('converted.mkv');
probe(mkv);
if (ffprobe) console.log('  source lines:');
firstLines('samples/film.mkv', '0:s:0');
firstLines(mkv, '0:s:0');

// 2. MP4 with timed text, kept as MP4.
await open('samples/film.mp4');
await removePassage(10, 20, 60);
probe(await convert('converted.mp4'));

// 3. WebM at 480p.
await open('samples/h264.mp4');
probe(
	await convert('converted.webm', async () => {
		await aside.getByLabel('Container').click();
		await page.getByRole('option', { name: 'WebM' }).click();
		await aside.getByLabel('Height').click();
		await page.getByRole('option', { name: /^480 p/ }).click();
	}),
);

// 4. MKV trimmed and copied: nothing encoded again, subtitles and fonts kept, lines moved to
// where the copy really starts (the key frame before the trim).
await open('samples/film.mkv');
await tools.getByRole('button', { name: 'Trim' }).click();
await aside.getByLabel('Start').fill('0:10.300');
await aside.getByLabel('Start').press('Enter');
await aside.getByLabel('End').fill('0:40.000');
await aside.getByLabel('End').press('Enter');
const copied = await convert('trimmed.mkv', async () => {}, /Original/);
probe(copied);
firstLines(copied, '0:s:0');
if (ffprobe) {
	const packets = (path: string) =>
		spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=size', '-of', 'csv=p=0', '-read_intervals', '%+#5', path], { encoding: 'utf8' }).stdout.trim().replace(/\n/g, ' ');
	console.log('  first video packets:', packets(copied));
}

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
