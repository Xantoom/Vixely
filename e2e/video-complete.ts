/**
 * The complete video editor: a turned video copied without encoding, metadata and a cover, timed
 * text encoded at constant quality, the TikTok format, Dolby Digital and DTS sound decoded, a
 * subtitle file added as a track, and a variable frame rate read. With FFPROBE set, each file is
 * checked by FFmpeg's probe.
 */
import { engine, sample } from './engine';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const ffmpeg = ffprobe?.replace(/ffprobe$/, 'ffmpeg');
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', acceptDownloads: true });
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
const tool = async (name: string) => {
	const button = tools.getByRole('button', { name, exact: true });
	if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
};

const open = async (path: string) => {
	await page.goto('http://localhost:5173/video');
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
	await page.waitForTimeout(1500);
};
const exportAs = async (name: string, mode: RegExp, choose: () => Promise<void> = async () => {}) => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const radio = aside.getByRole('radio', { name: mode });
	if (await radio.isEnabled()) await radio.click();
	console.log(`${name}: ${mode} ${(await radio.getAttribute('aria-checked')) === 'true' ? 'chosen' : 'NOT chosen'}`);
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
	console.log(`  ${download.suggestedFilename()}: ${data.length} bytes in ${Date.now() - t0} ms`);
	return `shots/${name}`;
};
const run = (args: string[], path: string) =>
	ffprobe ? spawnSync(ffprobe, ['-v', 'error', ...args, path], { encoding: 'utf8' }).stdout.trim() : '';
const streams = (path: string) =>
	console.log(
		' ',
		run(
			['-show_entries', 'stream=index,codec_type,codec_name,width,height,channels:stream_side_data=rotation:stream_disposition=attached_pic', '-of', 'compact'],
			path,
		).replace(/\n/g, '\n  '),
	);
const frame = (path: string, time: number, name: string) => {
	if (!ffmpeg) return;
	spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'scale=480:-2', `shots/${name}.png`]);
};

// 1. Turned a quarter and mirrored: copied as it is, the file says how to show it.
await open(sample('film.mp4'));
await tool('Crop');
await aside.getByRole('button', { name: 'Rotate right' }).click();
const turned = await exportAs('turned.mp4', /Original/);
streams(turned);
console.log('  first packets (source, copy):', run(['-select_streams', 'v', '-show_entries', 'packet=size', '-read_intervals', '%+#3', '-of', 'csv=p=0'], sample('film.mp4')).replace(/\n/g, ' '), '|', run(['-select_streams', 'v', '-show_entries', 'packet=size', '-read_intervals', '%+#3', '-of', 'csv=p=0'], turned).replace(/\n/g, ' '));

// 2. Metadata and a cover made from the picture shown, still copied.
await open(sample('film.mkv'));
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Title').fill('Vixely test');
await aside.getByLabel('Artist').fill('Xantoom');
await aside.getByLabel('Artist').press('Tab');
await aside.getByRole('button', { name: 'Current frame' }).click();
await aside.getByRole('img', { name: 'Cover' }).waitFor();
const tagged = await exportAs('tagged.mkv', /Original/);
streams(tagged);
console.log('  tags:', run(['-show_entries', 'format_tags', '-of', 'compact'], tagged));
console.log('  attachments:', run(['-show_entries', 'stream_tags=filename,mimetype', '-select_streams', 't', '-of', 'compact'], tagged).replace(/\n/g, ' '));

// 2b. The same in an MP4, whose timed text goes through the remuxer too.
await open(sample('film.mp4'));
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Title').fill('Vixely MP4');
await aside.getByLabel('Title').press('Tab');
await aside.getByRole('button', { name: 'Current frame' }).click();
await aside.getByRole('img', { name: 'Cover' }).waitFor();
const taggedMp4 = await exportAs('tagged.mp4', /Original/);
streams(taggedMp4);
console.log('  tags:', run(['-show_entries', 'format_tags', '-of', 'compact'], taggedMp4));

// 3. A title for the first two seconds only, encoded at constant quality.
await open(sample('film.mp4'));
await tool('Text');
await aside.getByRole('button', { name: /^Title/ }).click();
await aside.getByRole('switch', { name: 'During the whole video' }).click();
await aside.getByLabel('To', { exact: true }).fill('2');
await aside.getByLabel('To', { exact: true }).press('Enter');
await page.waitForTimeout(300);
await aside.screenshot({ path: 'shots/text-timing.png' });
await page.locator('section[aria-label="Preview"]').screenshot({ path: 'shots/text-preview.png' });
const titled = await exportAs('titled.mp4', /Convert/, async () => {
	await aside.getByLabel('Rate control').click();
	await page.getByRole('option', { name: 'Constant quality' }).click();
});
streams(titled);
frame(titled, 1, 'titled-1s');
frame(titled, 4, 'titled-4s');

// 4. TikTok: cropped to 9:16 from the middle.
await open(sample('film.mp4'));
await tool('Formats');
await aside.getByRole('button', { name: /^TikTok/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/tiktok-editor.png' });
const tiktok = await exportAs('tiktok.mp4', /Convert/);
streams(tiktok);

// 5. Dolby Digital 5.1 and DTS: decoded here, converted to AAC.
for (const name of ['ac3', 'dts']) {
	await open(sample(`${name}.mkv`));
	const decoding = await aside.locator('dl').last().textContent();
	console.log(`${name}.mkv audio:`, decoding?.replace(/\s+/g, ' '));
	await page.locator('[role=group][aria-label="Tracks"]').screenshot({ path: `shots/${name}-timeline.png` });
	const converted = await exportAs(`${name}.mp4`, /Convert/, async () => {
		await aside.getByLabel('Container').click();
		await page.getByRole('option', { name: 'MP4' }).click();
		await aside.getByLabel('Codec').nth(1).click();
		await page.getByRole('option', { name: 'AAC', exact: true }).click();
	});
	streams(converted);
}

// 6. A subtitle file added to the video as a track, copied into it.
await open(sample('film.mkv'));
await tool('Subtitles');
await aside.locator('input[type=file]').setInputFiles('samples/extra.fr.srt');
await page.waitForTimeout(500);
await aside.screenshot({ path: 'shots/subtitles-added.png' });
const added = await exportAs('added.mkv', /Original/);
streams(added);
if (ffmpeg) {
	const srt = spawnSync(ffmpeg, ['-v', 'error', '-i', added, '-map', '0:s:2', '-f', 'srt', '-'], { encoding: 'utf8' }).stdout;
	console.log('  added track:', srt.replace(/\n+/g, ' ').trim());
}

// 7. A variable frame rate.
await open(sample('vfr.mp4'));
console.log('vfr.mp4:', (await aside.locator('dl').nth(1).textContent())?.replace(/\s+/g, ' '));

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
