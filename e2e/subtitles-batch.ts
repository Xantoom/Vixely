/**
 * Several subtitle files at once: SRT, ASS and a .sup dropped together, shifted by two seconds and
 * written as WebVTT (the .sup stays PGS), into a ZIP where folders can't be picked.
 */
import { engine } from './engine';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => {
	Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
	Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
await page.goto('http://localhost:5173/');
const srt = (n: number) => Buffer.from(`1\r\n00:00:0${n},000 --> 00:00:0${n + 1},500\r\nFile ${n}\r\n`);
const ass =
	'[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\i1}ASS{\\i0}\n';
await page.setInputFiles('input[type=file]', [
	{ name: 'a.srt', mimeType: 'text/plain', buffer: srt(1) },
	{ name: 'b.srt', mimeType: 'text/plain', buffer: srt(2) },
	{ name: 'c.ass', mimeType: 'text/plain', buffer: Buffer.from(ass) },
	{ name: 'disc.sup', mimeType: 'application/octet-stream', buffer: readFileSync('samples/sup2.sup') },
]);
await page.waitForURL('**/subtitles');
await page.waitForTimeout(1500);
await page.getByLabel('Shift by').fill('2');
await page.getByLabel('Shift by').press('Enter');
await page.getByRole('radio', { name: /WebVTT/ }).click();
await page.waitForTimeout(300);
console.log('table:', (await page.getByRole('table').innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: 'shots/subtitles-batch.png' });
const [download] = await Promise.all([
	page.waitForEvent('download'),
	page.locator('aside + div').getByRole('button').first().click(),
]);
const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
for (const [name, data] of Object.entries(files)) {
	const text = name.endsWith('.sup') ? `${data.length} bytes` : JSON.stringify(new TextDecoder().decode(data));
	console.log(name, text);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
