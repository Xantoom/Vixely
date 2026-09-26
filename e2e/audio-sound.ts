/**
 * The audio editor's Sound tool: a voice-like buzz in white noise, played with noise reduction and
 * a Voice equalizer, then exported as WAV. With FFPROBE set, FFmpeg measures the noise left
 * between the bursts, the length, and the level of the voice.
 */
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const ffmpeg = ffprobe?.replace(/ffprobe$/, 'ffmpeg');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
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

await page.goto('http://localhost:5173/audio');
await page.setInputFiles('input[type=file]', 'samples/noisy.wav');
await tools.getByRole('button', { name: 'Sound', exact: true }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await tools.getByRole('button', { name: 'Sound', exact: true }).click();
const strength = aside.getByRole('slider', { name: 'Strength' });
await strength.focus();
await page.keyboard.press('End');
await aside.getByRole('radio', { name: 'Voice' }).click();
await page.waitForTimeout(300);
await aside.screenshot({ path: 'shots/sound-panel.png' });

// Played for two seconds with both on: nothing fails and time moves.
await page.keyboard.press('Space');
await page.waitForTimeout(2000);
await page.keyboard.press('Space');

await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /WAV/ }).click();
const t0 = Date.now();
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 120000 }),
	page.locator('aside + div').getByRole('button').first().click(),
]);
const data = readFileSync(await download.path());
writeFileSync('shots/denoised.wav', data);
console.log(`${download.suggestedFilename()}: ${data.length} bytes in ${Date.now() - t0} ms`);

const level = (path: string, from: number, length: number) => {
	if (!ffmpeg) return '';
	const out = spawnSync(ffmpeg, ['-ss', String(from), '-t', String(length), '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
	return /mean_volume: (\S+ dB)/.exec(out)?.[1] ?? '?';
};
if (ffprobe) {
	const duration = (path: string) => spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=duration_ts,sample_rate', '-of', 'csv=p=0', path], { encoding: 'utf8' }).stdout.trim();
	console.log('samples (source, export):', duration('samples/noisy.wav'), '|', duration('shots/denoised.wav'));
	// Between bursts (0.65 → 0.95 s of each second) only noise; in a burst, voice and noise.
	console.log('gap level (source, export):', level('samples/noisy.wav', 4.7, 0.25), '|', level('shots/denoised.wav', 4.7, 0.25));
	console.log('burst level (source, export):', level('samples/noisy.wav', 4.1, 0.4), '|', level('shots/denoised.wav', 4.1, 0.4));
}

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
