/**
 * Image editor: looks, the 13 adjustments, platform sizes in Crop, straightening, resizing, a
 * file size limit, blurred zones and drawings, export matching the preview.
 */
import { engine, BASE } from './engine';
import { readFileSync } from 'node:fs';

const browser = await engine.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 1.5, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/image`);
await page.setInputFiles('input[type=file]', '../public/samples/lake.jpg');
await page.waitForSelector('[data-status]', { timeout: 20000 });
const rail = page.locator('nav[aria-label="Editing tools"]');
await rail.getByRole('button', { name: 'Adjust' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/image-adjust.png' });

const looks = page.getByRole('radiogroup', { name: 'Looks' });
for (const name of ['Auto', 'Vintage', 'Noir']) {
	await looks.getByRole('radio', { name }).click();
	const values = await page.locator('aside').getByRole('slider').evaluateAll((els) => els.map((e) => `${e.id ? '' : ''}${(e as HTMLInputElement).value}`).join(' '));
	console.log(name, 'checked:', await looks.getByRole('radio', { name }).getAttribute('aria-checked'), 'values', values);
	await page.screenshot({ path: `shots/image-look-${name.toLowerCase()}.png` });
}
await looks.getByRole('radio', { name: 'Original' }).click();
const blur = page.getByRole('slider', { name: 'Blur' });
await blur.fill('60');
await page.getByRole('slider', { name: 'Vignette' }).fill('70');
await page.getByRole('slider', { name: 'Hue' }).fill('90');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/image-effects.png' });

// Export starts from the source: JPEG at the quality it was saved at (90).
const exportNow = async () => {
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()) };
};
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
console.log('source defaults:', await page.locator('#export-format').innerText(), await page.getByRole('slider', { name: 'Quality' }).inputValue());

await rail.getByRole('button', { name: 'Crop' }).click();
await page.getByRole('button', { name: 'Instagram', exact: true }).click();
await page.screenshot({ path: 'shots/image-presets.png' });
await page.getByRole('button', { name: /^Instagram Story/ }).click();
console.log('preset status:', await page.locator('[data-status]').innerText());
await page.screenshot({ path: 'shots/image-preset-story.png' });
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
let out = await exportNow();
console.log('story', out.name, out.data.length);
for (const format of ['TIFF', 'BMP', 'ICO']) {
	await page.locator('#export-format').click();
	await page.getByRole('option', { name: format, exact: true }).click();
	out = await exportNow();
	require('node:fs').writeFileSync(`shots/out-${out.name}`, out.data);
	console.log(format, out.name, out.data.length);
}

// Straightened, halved, and kept under 15 KB.
await rail.getByRole('button', { name: 'Crop' }).click();
await page.getByRole('slider', { name: 'Straighten' }).fill('6');
await rail.getByRole('button', { name: 'Resize' }).click();
await page.getByRole('radio', { name: '50 %' }).click();
console.log('resized:', await page.locator('[data-status]').innerText());
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
await page.locator('#export-format').click();
await page.getByRole('option', { name: 'JPEG', exact: true }).click();
await page.getByRole('switch', { name: 'Limit the file size' }).click();
await page.getByLabel('At most').fill('15');
await page.getByLabel('At most').press('Enter');
out = await exportNow();
console.log('limited', out.name, out.data.length, out.data.length <= 15000 ? 'FITS' : 'TOO BIG', '|', await page.locator('aside + div').innerText().then((t) => t.replace(/\s+/g, ' ')));

// A pixelated zone and a line drawn with the brush, in the file.
await rail.getByRole('button', { name: 'Layers' }).click();
await page.getByRole('tab', { name: 'Blur' }).click();
await page.getByRole('radio', { name: 'Pixelate' }).click();
await page.getByRole('tab', { name: 'Draw' }).click();
const surface = (await page.getByLabel('Drawing surface').boundingBox())!;
await page.mouse.move(surface.x + surface.width * 0.2, surface.y + surface.height * 0.8);
await page.mouse.down();
await page.mouse.move(surface.x + surface.width * 0.8, surface.y + surface.height * 0.7, { steps: 12 });
await page.mouse.up();
console.log('layers:', await page.getByRole('list', { name: 'Layers' }).innerText().then((t) => t.replace(/\s+/g, ' ')));
await page.screenshot({ path: 'shots/image-zone-drawing.png' });
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
out = await exportNow();
require('node:fs').writeFileSync(`shots/out-layers-${out.name}`, out.data);
console.log('layers export', out.name, out.data.length);
console.log('errors', errors);
await browser.close();
