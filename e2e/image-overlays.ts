/** Image editor: text and stickers placed, moved, turned, and found again in the export. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 1.25, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/image');
await page.setInputFiles('input[type=file]', '../public/samples/lake.jpg');
await page.waitForSelector('[data-status]', { timeout: 20000 });
const rail = page.locator('nav[aria-label="Editing tools"]');
await rail.getByRole('button', { name: 'Text' }).click();
await page.getByRole('button', { name: 'MEME' }).click();
const field = page.getByRole('textbox', { name: 'Text' });
await field.fill('WHEN THE EXPORT\nMATCHES THE PREVIEW');
await field.blur();
await page.getByRole('button', { name: 'Caption' }).click();
await page.getByRole('textbox', { name: 'Text' }).fill('Lake at sunset');
await page.getByRole('textbox', { name: 'Text' }).blur();
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/overlay-text.png' });

await rail.getByRole('button', { name: 'Stickers' }).click();
await page.getByRole('button', { name: '🔥' }).click();
await page.getByRole('button', { name: 'Arrow' }).click();
// Drag the arrow to the right and turn it with the knob.
const arrow = page.getByRole('button', { name: 'Shape' });
const box = (await arrow.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 60, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/overlay-stickers.png' });
console.log('undo enabled', await page.getByRole('button', { name: 'Undo' }).isEnabled());

await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.locator('#export-format').click();
await page.getByRole('option', { name: 'PNG', exact: true }).click();
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
const data = readFileSync(await download.path());
writeFileSync('shots/overlay-export.png', data);
console.log('exported', download.suggestedFilename(), data.length);
console.log('errors', errors);
await browser.close();
