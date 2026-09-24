import { readFileSync } from 'node:fs';
/**
 * Subtitles from video files: tracks of an MKV (SRT, ASS with an embedded font), a track of an
 * MP4 (tx3g), PGS pictures from an mkvmerge file and from a .sup, exported back. Optional: a large
 * MKV given as the first argument, to time how fast its track is read.
 */
import { chromium } from 'playwright-core';

const big = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	locale: 'en-US',
	acceptDownloads: true,
});
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const aside = page.locator('aside');
const tool = (name: string) => page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name }).click();
const exportAs = async (format: RegExp) => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await aside.getByRole('radio', { name: format }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.locator('aside + div').getByRole('button').first().click(),
	]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()) };
};
const open = async (path: string) => {
	await page.goto('http://localhost:5173/subtitles');
	const t0 = Date.now();
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=grid]', { timeout: 60000 });
	return Date.now() - t0;
};
const seekTo = async (seconds: number) => {
	await page.getByLabel('Playhead', { exact: true }).fill(String(seconds));
	await page.waitForTimeout(900);
};

// 1. MKV made by FFmpeg: SRT (French, default) and ASS (English) with an embedded font.
console.log('mkv opened in', await open('samples/film.mkv'), 'ms');
await tool('Info');
console.log('tracks:', (await aside.getByRole('radiogroup').innerText()).replace(/\n/g, ' | '));
console.log('lines:', (await aside.innerText()).match(/Lines\n(\d+)/)?.[1]);
await seekTo(2.5);
await page.screenshot({ path: 'shots/tracks-srt.png' });
const switchStart = Date.now();
await aside.getByRole('radio', { name: /English/ }).click();
await page.waitForFunction(() => document.querySelector('[role=grid]')?.textContent?.includes('Style'), null, {
	timeout: 15000,
});
console.log('track switched in', Date.now() - switchStart, 'ms');
console.log(
	'after switch:',
	(await aside.innerText()).match(/Format[\s\S]*?Embedded fonts\n\d+/)?.[0].replace(/\n/g, ' | '),
);
await seekTo(4.6);
await page.screenshot({ path: 'shots/tracks-ass.png' });
const ass = await exportAs(/^ASS/);
const assText = ass.data.toString('utf8');
console.log(
	'exported',
	ass.name,
	assText.length,
	'chars;',
	assText.split('\r\n').filter((l) => l.startsWith('Dialogue')).length,
	'events; first:',
	assText.split('\r\n').find((l) => l.startsWith('Dialogue')),
);
await tool('Info');
await aside.getByRole('radio', { name: 'New subtitles' }).click();
console.log('new subtitles lines:', (await aside.innerText()).match(/Lines\n(\d+)/)?.[1]);

// 2. The same film without cues (live mode): the clusters are walked.
console.log(
	'live mkv opened in',
	await open('samples/live.mkv'),
	'ms;',
	(await aside.innerText()).match(/Lines\n(\d+)/)?.[1],
	'lines',
);

// 3. MP4 with a timed text track.
console.log('mp4 opened in', await open('samples/film.mp4'), 'ms');
console.log('mp4 tracks:', (await aside.getByRole('radiogroup').innerText()).replace(/\n/g, ' | '));
const srt = await exportAs(/^SRT/);
console.log('exported', srt.name, JSON.stringify(srt.data.toString('utf8').slice(0, 80)));

// 4. mkvmerge file with two PGS tracks and an ASS one.
console.log('pgs mkv opened in', await open('samples/sample.mkv'), 'ms');
console.log('pgs tracks:', (await aside.getByRole('radiogroup').innerText()).replace(/\n/g, ' | '));
await seekTo(1);
await page.screenshot({ path: 'shots/tracks-pgs.png' });
await page.getByRole('grid').getByRole('row').nth(1).click();
await page.waitForTimeout(500);
await page.getByRole('region', { name: 'Selected line' }).screenshot({ path: 'shots/tracks-pgs-line.png' });
await tool('Timing');
await aside.getByLabel('Shift by').fill('0.5');
await aside.getByLabel('Shift by').press('Enter');
await aside.getByRole('button', { name: /^Shift \+0\.500 s/ }).click();
const sup = await exportAs(/^PGS/);
console.log('exported', sup.name, sup.data.length, 'bytes, starts with', sup.data.subarray(0, 2).toString());

// 5. The exported .sup opened again, and a .sup from a disc tool.
await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', {
	name: 'moved.sup',
	mimeType: 'application/octet-stream',
	buffer: sup.data,
});
await page.waitForSelector('[role=grid]', { timeout: 20000 });
console.log('reopened sup:', (await page.getByRole('grid').innerText()).replace(/\n/g, ' ').slice(0, 200));
console.log(
	'sup opened in',
	await open('samples/sup2.sup'),
	'ms;',
	(await aside.innerText()).match(/Lines\n(\d+)/)?.[1],
	'lines',
);

if (big) {
	console.log(
		`large file ${(readFileSync(big, { flag: 'r' }).length / 1e9).toFixed(2)} GB opened in`,
		await open(big),
		'ms;',
		(await aside.innerText()).match(/Lines\n(\d+)/)?.[1],
		'lines',
	);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
