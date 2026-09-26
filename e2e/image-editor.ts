/** Image editor: looks, the 13 adjustments, export matching the preview. */
import { engine } from './engine';
import { readFileSync } from 'node:fs';

const browser = await engine.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 1.5, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/image');
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
await page.getByRole('button', { name: 'Export', exact: true }).click();
console.log('source defaults:', await page.locator('#export-format').innerText(), await page.getByRole('slider', { name: 'Quality' }).inputValue());

await rail.getByRole('button', { name: 'Formats' }).click();
await page.screenshot({ path: 'shots/image-presets.png' });
await page.getByRole('button', { name: /^Instagram Story/ }).click();
console.log('preset status:', await page.locator('[data-status]').innerText());
await page.screenshot({ path: 'shots/image-preset-story.png' });
await page.getByRole('button', { name: 'Export', exact: true }).click();
let out = await exportNow();
console.log('story', out.name, out.data.length);
for (const format of ['TIFF', 'BMP', 'ICO']) {
	await page.locator('#export-format').click();
	await page.getByRole('option', { name: format, exact: true }).click();
	out = await exportNow();
	require('node:fs').writeFileSync(`shots/out-${out.name}`, out.data);
	console.log(format, out.name, out.data.length);
}
console.log('errors', errors);
await browser.close();
