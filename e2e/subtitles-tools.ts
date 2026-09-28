/**
 * The subtitle editor's own tools: an SRT translated by hand into English with the original beside
 * each line; a Blu-ray .sup read into text. Tesseract's English data is downloaded the first time.
 */
import { engine, BASE } from './engine';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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

// 1. An SRT translated by hand into English.
await page.goto(`${BASE}/subtitles`);
await page.setInputFiles('input[type=file]', 'samples/extra.fr.srt');
await page.waitForSelector('[role=grid]', { timeout: 10000 });
await tools.getByRole('button', { name: 'Translate', exact: true }).click();
await aside.getByLabel('Into').click();
await page.getByRole('option', { name: 'English' }).click();
await aside.getByRole('button', { name: 'Start translating' }).click();
const text = page.getByLabel('Text', { exact: true });
await page.getByRole('grid').getByRole('row').nth(1).click();
await text.fill('First line added');
await text.press('Enter');
await page.waitForTimeout(300);
console.log('translation grid:', await grid());
console.log('progress:', await aside.getByRole('status').or(aside.locator('p.tabular')).first().innerText().catch(() => '?'));
await page.screenshot({ path: 'shots/translation.png' });
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
const translated = await save('translated.srt');
console.log('  file:', translated.data.toString('utf8').replace(/\s+/g, ' '));

// 2. Blu-ray pictures read into text.
await page.goto(`${BASE}/subtitles`);
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
