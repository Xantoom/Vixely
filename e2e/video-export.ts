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

// 5. MKV with two passages removed, copied: the parts widened to key frames, lines moved with them.
await open('samples/film.mkv');
await removePassage(12, 21, 60);
await removePassage(33, 44, 60);
const cutCopy = await convert(
	'cut-copy.mkv',
	async () => {
		await page.waitForTimeout(1200);
		await page.screenshot({ path: 'shots/cut-copy-timeline.png' });
	},
	/Original/,
);
probe(cutCopy);
firstLines(cutCopy, '0:s:0');

// 6. The same in an MP4.
await open('samples/film.mp4');
await removePassage(12, 21, 60);
probe(await convert('cut-copy.mp4', async () => {}, /Original/));

const loudness = (path: string, stream: string) => {
	if (!ffprobe) return;
	const ffmpeg = ffprobe.replace(/ffprobe$/, 'ffmpeg');
	const out = spawnSync(ffmpeg, ['-i', path, '-map', stream, '-t', '20', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
	console.log(`  ${stream} mean volume:`, /mean_volume: (\S+ dB)/.exec(out)?.[1]);
};

// 7. MKV as it is, its sound 6 dB louder and a WAV added: pictures copied, sound encoded again.
await open('samples/film.mkv');
const louder = await convert(
	'louder.mkv',
	async () => {
		await aside.getByRole('button', { name: 'Volume' }).first().click();
		await aside.getByLabel('Gain').focus();
		for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
		await aside.locator('input[type=file]').setInputFiles('samples/long.wav');
		await aside.getByText('Audio, long').waitFor();
	},
	/Original/,
);
probe(louder);
loudness('samples/film.mkv', '0:a:0');
loudness(louder, '0:a:0');

// 8. MP4 converted with a passage removed and a WAV added: the sound added follows the cut.
await open('samples/film.mp4');
await removePassage(10, 20, 60);
const dubbed = await convert('dubbed.mp4', async () => {
	await aside.locator('input[type=file]').setInputFiles('samples/long.wav');
	await aside.getByText('Audio, long').waitFor();
});
probe(dubbed);

const frames = (path: string, times: number[], name: string) => {
	if (!ffprobe) return;
	const ffmpeg = ffprobe.replace(/ffprobe$/, 'ffmpeg');
	times.forEach((time, index) => {
		spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'scale=640:-2', `shots/${name}-${index}.png`]);
	});
};

// 9. MKV converted to MP4 with its styled English subtitles burned in.
await open('samples/film.mkv');
const burned = await convert('burned.mp4', async () => {
	await aside.getByLabel('Container').click();
	await page.getByRole('option', { name: 'MP4' }).click();
	await aside.getByLabel('Track', { exact: true }).click();
	await page.getByRole('option', { name: /English \(styled\)/ }).click();
});
probe(burned);
frames(burned, [12.5, 20.5], 'burned');

// 10. PGS burned in.
await open('samples/sample.mkv');
const pgs = await convert('burned-pgs.mp4', async () => {
	await aside.getByLabel('Container').click();
	await page.getByRole('option', { name: 'MP4' }).click();
	await aside.getByLabel('Track', { exact: true }).click();
	await page.getByRole('option').nth(1).click();
});
probe(pgs);
frames(pgs, [1, 3, 5, 7], 'burned-pgs');

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
