/**
 * The subtitle editor's own tools: a video without subtitles transcribed by Whisper, a line
 * corrected, and the result written into the video; an SRT translated by hand into English with
 * the original beside each line; a Blu-ray .sup read into text. With FFPROBE set, FFmpeg reads the
 * subtitles back. Whisper's model and Tesseract's English data are downloaded the first time.
 */
import { engine, sample } from './engine';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const ffmpeg = ffprobe?.replace(/ffprobe$/, 'ffmpeg');
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
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
const grid = async () => (await page.getByRole('grid').innerText()).replace(/\s+/g, ' ').slice(0, 300);
const save = async (name: string) => {
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 120000 }),
		page.locator('aside + div').getByRole('button').first().click(),
	]);
	const data = readFileSync(await download.path());
	writeFileSync(`shots/${name}`, data);
	console.log(`  ${download.suggestedFilename()}: ${data.length} bytes`);
	return { path: `shots/${name}`, name: download.suggestedFilename(), data };
};

// 1. A video without subtitles: speech to text, one line corrected, written into the video.
await page.goto('http://localhost:5173/video');
await page.setInputFiles('input[type=file]', sample('speech.mp4'));
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await tools.getByRole('button', { name: 'Subtitles', exact: true }).click();
await aside.getByRole('button', { name: 'Generate subtitles from speech' }).click();
await page.waitForURL('**/subtitles**');
await aside.getByLabel('Model').click();
await page.getByRole('option', { name: /Fast/ }).click();
await aside.getByLabel('Spoken language').click();
await page.getByRole('option', { name: 'English' }).click();
const t0 = Date.now();
await aside.getByRole('button', { name: 'Transcribe', exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('[role=grid] [role=row]').length > 1, null, { timeout: 600000 });
console.log(`transcribed in ${Date.now() - t0} ms:`, await grid());
await page.screenshot({ path: 'shots/transcribed.png' });
await page.getByRole('grid').getByRole('row').nth(1).click();
const text = page.getByLabel('Text', { exact: true });
await text.fill('And so, my fellow Americans:');
await text.press('Enter');
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /video/i }).first().click();
const muxed = await save('transcribed.mp4');
if (ffmpeg) {
	const srt = spawnSync(ffmpeg, ['-v', 'error', '-i', muxed.path, '-map', '0:s:0', '-f', 'srt', '-'], { encoding: 'utf8' }).stdout;
	console.log('  in the video:', srt.replace(/\n+/g, ' ').slice(0, 300));
}

// 2. An SRT translated by hand into English.
await page.goto('http://localhost:5173/subtitles');
await page.setInputFiles('input[type=file]', 'samples/extra.fr.srt');
await page.waitForSelector('[role=grid]', { timeout: 10000 });
await tools.getByRole('button', { name: 'Translate', exact: true }).click();
await aside.getByLabel('Into').click();
await page.getByRole('option', { name: 'English' }).click();
await aside.getByRole('button', { name: 'Start translating' }).click();
await page.getByRole('grid').getByRole('row').nth(1).click();
await text.fill('First line added');
await text.press('Enter');
await page.waitForTimeout(300);
console.log('translation grid:', await grid());
console.log('progress:', await aside.getByRole('status').or(aside.locator('p.tabular')).first().innerText().catch(() => '?'));
await page.screenshot({ path: 'shots/translation.png' });
await page.getByRole('button', { name: 'Export', exact: true }).click();
const translated = await save('translated.srt');
console.log('  file:', translated.data.toString('utf8').replace(/\s+/g, ' '));

// 3. Blu-ray pictures read into text.
await page.goto('http://localhost:5173/subtitles');
await page.setInputFiles('input[type=file]', 'samples/sup2.sup');
await page.waitForSelector('[role=grid]', { timeout: 30000 });
await tools.getByRole('button', { name: 'Text recognition', exact: true }).click();
await aside.getByLabel('Language').click();
await page.getByRole('option', { name: 'English' }).click();
const t1 = Date.now();
await aside.getByRole('button', { name: 'Read the text' }).click();
await page.waitForFunction(
	() => !document.querySelector('[role=grid]')?.textContent?.includes('Picture'),
	null,
	{ timeout: 300000 },
);
console.log(`read in ${Date.now() - t1} ms:`, await grid());
await page.screenshot({ path: 'shots/ocr.png' });

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
