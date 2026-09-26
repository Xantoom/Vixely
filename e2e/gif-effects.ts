/** GIF editor, phase 10: looks, text, fades, bands, frames, skip, presets, PNG frames, transparent WebM. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const analyse = async (bytes: Buffer) => page.evaluate(async (data) => {
	const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
	await gif.default();
	const reader = new gif.AnimationReader(new Uint8Array(data), 'gif');
	let frames = 0, total = 0;
	for (let f = reader.next_frame(); f; f = reader.next_frame()) { frames++; total += f.delay; }
	return { width: reader.width(), height: reader.height(), frames, ms: Math.round(total) };
}, Array.from(bytes));
const status = async () => (await page.locator('[data-status]').innerText()).replace(/\n/g, ' ');
const exportNow = async () => {
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()) };
};
const rail = page.locator('nav[aria-label="Editing tools"]');
const tool = async (name: string) => {
	const button = rail.getByRole('button', { name, exact: true });
	if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
};

await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', '../public/samples/sunset.gif');
await page.waitForURL('**/gif');
await page.waitForSelector('[aria-label="Frames"]', { timeout: 20000 });
console.log('opened:', await status());
console.log('analysis:', (await page.locator('aside dl').last().innerText()).replace(/\n/g, ' | '));

await tool('Adjust');
await page.getByRole('radiogroup', { name: 'Looks' }).getByRole('radio', { name: 'Noir' }).click();
await tool('Text');
await page.getByRole('button', { name: 'MEME' }).click();
await page.getByRole('textbox', { name: 'Text' }).fill('SUNSET');
await page.getByRole('textbox', { name: 'Text' }).blur();
await tool('Trim');
await page.getByRole('slider', { name: 'Fade in' }).fill('5');
await page.getByRole('slider', { name: 'Fade out' }).fill('5');
await page.locator('aside').getByRole('radio', { name: 'Transparent' }).click();
await tool('Crop');
await page.locator('#' + (await page.getByText('Bands to').getAttribute('for'))).click();
await page.getByRole('option', { name: '1:1' }).click();
console.log('bands:', await status());
await page.screenshot({ path: 'shots/gif-effects.png' });

await tool('Frames');
await page.getByRole('listbox', { name: 'Frames' }).getByRole('option').nth(3).click();
await page.locator('aside').getByRole('button', { name: 'Delete' }).click();
console.log('one frame deleted:', await status());
await page.screenshot({ path: 'shots/gif-frames.png' });
await tool('Speed');
await page.locator('#' + (await page.getByText('Frames kept').getAttribute('for'))).click();
await page.getByRole('option', { name: '1 in 2' }).click();
console.log('1 in 2:', await status());

await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.getByRole('switch', { name: 'Dithering' }).click();
let out = await exportNow();
writeFileSync('shots/gif-effects.gif', out.data);
console.log('GIF', out.name, out.data.length, JSON.stringify(await analyse(out.data)));

await page.locator('aside').getByRole('radio', { name: /PNG frames/ }).click();
out = await exportNow();
const zip = unzipSync(new Uint8Array(out.data));
console.log('PNG frames', out.name, Object.keys(zip).length, 'files:', Object.keys(zip).slice(0, 3).join(', '), '…', new TextDecoder().decode(zip['delays.txt']).split('\n')[0]);

await page.locator('aside').getByRole('radio', { name: /Video/ }).click();
await page.getByRole('switch', { name: 'Keep transparency' }).click();
out = await exportNow();
writeFileSync('shots/gif-alpha.webm', out.data);
console.log('transparent video', out.name, out.data.length);

// Presets: a Discord emoji is a 128 px square under 256 KB.
await tool('Formats');
await page.getByRole('button', { name: /Discord · Emoji/ }).click();
console.log('preset:', await status());
await page.getByRole('button', { name: 'Export', exact: true }).click();
out = await exportNow();
console.log('Discord emoji', out.name, out.data.length, JSON.stringify(await analyse(out.data)));
console.log('errors', errors);
await browser.close();
