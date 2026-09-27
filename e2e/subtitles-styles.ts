/**
 * Find and replace, styles and sorting in the subtitle editor: an SRT with lines out of order is
 * searched (whole words, then an expression), a match replaced, then all; it becomes ASS to be
 * styled (size, bold, colour, position, margins, a copy renamed); its lines are sorted by time;
 * the ASS written out has all of it.
 */
import { engine, BASE } from './engine';
import { readFileSync } from 'node:fs';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
const grid = async () => (await page.getByRole('grid').innerText()).replace(/\s+/g, ' ');

const srt = [
	'1\n00:00:05,000 --> 00:00:07,000\nThe cat and the catalogue.\n',
	'2\n00:00:01,000 --> 00:00:03,000\nA cat sat.\n',
	'3\n00:00:09,000 --> 00:00:11,000\nNo cats here, only dogs.\n',
].join('\n');

await page.goto(`${BASE}/subtitles`);
await page.setInputFiles('input[type=file]', { name: 'pets.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
await page.getByRole('grid').waitFor({ timeout: 20000 });

// 1. Find: Ctrl + F opens it; whole words find two "cat", then the second is replaced.
await page.getByRole('grid').click();
await page.keyboard.press('Control+f');
const find = aside.getByLabel('Find', { exact: true });
await find.fill('cat');
console.log('"cat":', await aside.getByRole('status').innerText());
await aside.getByRole('switch', { name: 'Whole words' }).click();
await find.press('Enter');
await find.press('Enter');
console.log('whole words:', await aside.getByRole('status').innerText(), '| focused', await page.evaluate(() => document.activeElement?.id));
await aside.getByLabel('Replace with').fill('dog');
await aside.getByRole('button', { name: 'Replace', exact: true }).click();
console.log('after one:', await grid());

// 2. An expression with a group, everywhere.
await aside.getByRole('switch', { name: 'Whole words' }).click();
await aside.getByRole('switch', { name: 'Regular expression' }).click();
await find.fill('(dog)s?');
await aside.getByLabel('Replace with').fill('[$1]');
console.log('expression:', await aside.getByRole('status').innerText());
await aside.getByRole('button', { name: /^Replace all/ }).click();
console.log('after all:', await grid());

// 3. Styles: the SRT becomes ASS, its style made larger, bold, yellow, on top, with margins.
await tools.getByRole('button', { name: 'Styles' }).click();
await aside.getByRole('button', { name: 'Use styles' }).click();
await aside.getByLabel('Size').fill('80');
await aside.getByLabel('Size').press('Enter');
await aside.getByRole('button', { name: 'Bold' }).click();
await aside.getByRole('radio', { name: 'Top', exact: true }).click();
await aside.getByLabel('Vertical').fill('120');
await aside.getByLabel('Vertical').press('Enter');
await aside.getByRole('button', { name: 'Text', exact: true }).click();
await page.getByRole('dialog').or(page.locator('[role=dialog], [data-popover]')).first().waitFor({ timeout: 5000 }).catch(() => {});
const hex = page.getByRole('textbox', { name: /hex|colour|color/i }).first();
if (await hex.count()) {
	await hex.fill('FFD60A');
	await hex.press('Enter');
}
await page.keyboard.press('Escape');
// A copy of the style, renamed.
await aside.getByRole('button', { name: 'Duplicate' }).click();
await aside.getByLabel('Name').fill('Signs');
await aside.getByLabel('Name').blur();
console.log('styles:', (await aside.getByRole('radiogroup', { name: 'Styles' }).innerText()).replace(/\s+/g, ' '));
await page.screenshot({ path: 'shots/subtitles-styles.png' });

// 4. Sorted by time.
await tools.getByRole('button', { name: 'Timing' }).click();
await aside.getByRole('button', { name: 'Sort by time' }).click();
console.log('sorted:', await grid());

// 5. Written out as ASS.
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /^ASS/ }).click();
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 60000 }),
	page.locator('aside + div').getByRole('button').first().click(),
]);
const ass = readFileSync(await download.path(), 'utf8');
console.log('ass styles:', ass.split('\n').filter((line) => line.startsWith('Style:')).join(' || '));
console.log('ass events:', ass.split('\n').filter((line) => line.startsWith('Dialogue:')).map((line) => line.split(',').slice(1, 3).join('-') + ' ' + line.split(',').slice(9).join(',').trim()).join(' | '));

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
