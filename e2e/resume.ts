/**
 * Work kept across a reload and a closed tab: a turned photo, a video's crop with an edited
 * subtitle track, the Voice equalizer, and a hand translation come back with their undo history;
 * forgotten work stays gone.
 */
import { engine, sample } from './engine';

const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' });
const errors: string[] = [];
const watch = (page: import('playwright-core').Page) => {
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	// "Leave site?" before a reload with edits: yes.
	page.on('dialog', (dialog) => void dialog.accept());
};
let page = await ctx.newPage();
watch(page);
const tools = () => page.locator('nav[aria-label="Editing tools"]');
const aside = () => page.locator('aside');
const undo = () => page.getByRole('button', { name: 'Undo', exact: true });
const settle = () => page.waitForTimeout(1500);

// 1. A photo turned, then the page reloaded: it comes back by itself, undo included.
await page.goto(`${base}/image`);
await page.setInputFiles('input[type=file]', 'samples/photo.heic');
await tools().getByRole('button', { name: 'Crop', exact: true }).click();
// The output size is the last one on the page, in the status bar.
const size = async () => (await page.locator('body').innerText()).match(/\d+\s*×\s*\d+/g)?.at(-1);
await aside().getByRole('button', { name: 'Rotate right' }).click();
await settle();
await page.reload();
await undo().waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/resume-image.png' });
console.log('image after reload (1280 × 854 turned):', await size(), '| undo:', await undo().isEnabled());

// 2. A video cropped and its subtitle track edited; the tab closed and opened again.
await page.goto(`${base}/video`);
await page.setInputFiles('input[type=file]', sample('film.mkv'));
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await page.waitForTimeout(1000);
await tools().getByRole('button', { name: 'Crop', exact: true }).click();
await aside().getByRole('button', { name: 'Rotate right' }).click();
await tools().getByRole('button', { name: 'Subtitles', exact: true }).click();
await aside().getByRole('button', { name: /Edit/ }).first().click();
await page.waitForURL('**/subtitles**');
await page.getByRole('grid').getByRole('row').nth(1).click();
await page.getByLabel('Text', { exact: true }).fill('Kept across tabs');
await page.getByLabel('Text', { exact: true }).press('Enter');
await settle();
await page.close();
page = await ctx.newPage();
watch(page);
await page.goto(base);
const card = page.getByRole('button', { name: 'Resume' });
await card.waitFor({ timeout: 10000 });
console.log('home card:', (await card.locator('xpath=../..').innerText()).replace(/\s+/g, ' '));
await card.click();
await page.waitForURL('**/subtitles**');
await page.getByRole('grid').waitFor();
await page.waitForTimeout(1000);
console.log('subtitles:', (await page.getByRole('grid').innerText()).replace(/\s+/g, ' ').slice(0, 120));
await page.getByRole('button', { name: 'Back to the video' }).click();
await page.waitForURL('**/video');
await page.waitForTimeout(1500);
console.log('video undo:', await undo().isEnabled());

// 3. The Voice equalizer on a sound, reloaded.
await page.goto(`${base}/audio`);
await page.setInputFiles('input[type=file]', 'samples/noisy.wav');
await tools().getByRole('button', { name: 'Sound', exact: true }).click();
await aside().getByRole('radio', { name: 'Voice' }).click();
await settle();
await page.reload();
await undo().waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
await tools().getByRole('button', { name: 'Sound', exact: true }).click();
console.log('audio preset after reload:', await aside().getByRole('radio', { name: 'Voice' }).getAttribute('aria-checked'));

// 4. A batch of two photos with a look, reloaded: both files and the look come back.
await page.goto(`${base}/image`);
await page.setInputFiles('input[type=file]', ['../public/samples/lake.jpg', 'samples/photo.heic']);
await tools().getByRole('button', { name: 'Adjust', exact: true }).click();
const vintage = page.getByRole('radiogroup', { name: 'Looks' }).getByRole('radio', { name: 'Vintage' });
await vintage.click();
await settle();
await page.reload();
await undo().waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
await tools().getByRole('button', { name: 'Adjust', exact: true }).click();
console.log(
	'batch after reload:',
	(await page.getByRole('region', { name: 'Batch' }).innerText()).replace(/\s+/g, ' ').slice(0, 80),
	'| Vintage:',
	await vintage.getAttribute('aria-checked'),
);

// 5. A hand translation, then the work forgotten.
await page.goto(`${base}/subtitles`);
await page.setInputFiles('input[type=file]', 'samples/extra.fr.srt');
await page.waitForSelector('[role=grid]');
await tools().getByRole('button', { name: 'Translate', exact: true }).click();
await aside().getByLabel('Into').click();
await page.getByRole('option', { name: 'English' }).click();
await aside().getByRole('button', { name: 'Start translating' }).click();
await page.getByRole('grid').getByRole('row').nth(1).click();
await page.getByLabel('Text', { exact: true }).fill('Translated line');
await page.getByLabel('Text', { exact: true }).press('Enter');
await settle();
await page.reload();
await page.waitForSelector('[role=grid]', { timeout: 30000 });
await page.waitForTimeout(1000);
console.log('translation after reload:', (await page.getByRole('grid').innerText()).replace(/\s+/g, ' ').slice(0, 140));
await page.goto(base);
await page.getByRole('button', { name: 'Forget this work' }).click();
await page.waitForTimeout(500);
await page.reload();
await page.waitForTimeout(1500);
console.log('after forgetting, card:', await page.getByRole('button', { name: 'Resume' }).count());

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
