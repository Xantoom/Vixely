/**
 * A GIF made from three images of two shapes: reordered with Alt + arrow and by dragging, timed
 * one by one, an image added after the frame chosen, frames chosen together, copied and deleted,
 * resized and exported; then platform formats, the filmstrip reached by keyboard, a GIF made from
 * an image batch, and an image added to a GIF file.
 */
import { engine, BASE } from './engine';
import { readFileSync } from 'node:fs';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/tools/images-to-gif`);

const COLORS: Record<string, [number, number, number]> = { red: [255, 0, 0], green: [0, 160, 0], blue: [0, 0, 255], purple: [128, 0, 128] };
const png = async (width: number, height: number, color: string) => Buffer.from(await page.evaluate(async ([width, height, rgb]) => {
	const canvas = new OffscreenCanvas(width as number, height as number);
	const g = canvas.getContext('2d')!;
	g.fillStyle = `rgb(${(rgb as number[]).join(',')})`;
	g.fillRect(0, 0, width as number, height as number);
	return Array.from(new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()));
}, [width, height, COLORS[color]] as const));

// 1. Three images, the second narrower: it is fitted inside the first one's shape.
await page.setInputFiles('input[type=file]', [
	{ name: 'red.png', mimeType: 'image/png', buffer: await png(640, 360, 'red') },
	{ name: 'green.png', mimeType: 'image/png', buffer: await png(300, 400, 'green') },
	{ name: 'blue.png', mimeType: 'image/png', buffer: await png(640, 360, 'blue') },
]);
const list = page.getByRole('listbox', { name: 'Frames' });
await list.getByRole('option').nth(2).waitFor({ timeout: 20000 });
console.log('frames:', await list.getByRole('option').count(), '| status:', (await page.locator('main').getByText(/× \d+ px/).first().innerText()));

// 2. The third moved before the second with Alt + ←; the focus stays on it.
await list.getByRole('option').nth(2).click();
await page.keyboard.press('Alt+ArrowLeft');
await page.waitForTimeout(300);
console.log('after Alt+←: selected', await list.locator('[aria-selected=true]').getAttribute('aria-label'), '| focused', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));

// 3. The first dragged onto the last: blue, green, red.
await list.getByRole('option').nth(0).dragTo(list.getByRole('option').nth(2));
await page.waitForTimeout(300);

// 4. Durations: 300 ms for all, then 1 s for the first.
await page.getByLabel('Duration').fill('300');
await page.getByLabel('Duration').press('Enter');
await page.getByRole('button', { name: 'Apply to every frame' }).click();
await list.getByRole('option').nth(0).click();
await page.getByLabel('Duration').fill('1000');
await page.getByLabel('Duration').press('Enter');

// 5. One more image, added from the panel: right after the frame chosen, the first.
await page.locator('aside input[type=file]').setInputFiles([{ name: 'purple.png', mimeType: 'image/png', buffer: await png(640, 360, 'purple') }]);
await list.getByRole('option').nth(3).waitFor({ timeout: 10000 });
const durations = async () => (await list.locator('.tabular').allInnerTexts()).map((text) => text.replace('\n', ':')).join(' ');
console.log('durations:', await durations());

// 5b. Frames 3 and 4 chosen with Ctrl, copied (the copies follow each), then the copies deleted.
await list.getByRole('option').nth(2).click();
await list.getByRole('option').nth(3).click({ modifiers: ['Control'] });
console.log('chosen:', await list.locator('[aria-selected=true]').count(), '|', await page.locator('aside h3, aside h2').filter({ hasText: /selected/ }).first().innerText());
await page.getByRole('button', { name: 'Duplicate' }).click();
await list.getByRole('option').nth(5).waitFor({ timeout: 5000 });
console.log('after copying:', await durations(), '| chosen', await list.locator('[aria-selected=true]').count());
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForTimeout(200);
console.log('copies deleted:', await durations());
// A range with Shift, then Escape keeps the frame shown alone.
await list.getByRole('option').nth(0).click();
await list.getByRole('option').nth(2).click({ modifiers: ['Shift'] });
const ranged = await list.locator('[aria-selected=true]').count();
await page.keyboard.press('Escape');
console.log('shift range:', ranged, '| after Escape', await list.locator('[aria-selected=true]').count());

// 6. Resize: 50 %, then the height unlinked and set by hand, sharp pixels.
const tools = page.locator('nav[aria-label="Editing tools"]');
await tools.getByRole('button', { name: 'Resize' }).click();
await page.getByRole('radio', { name: '50 %' }).click();
console.log('50 %:', await page.getByLabel('Width').inputValue(), '×', await page.getByLabel('Height').inputValue());
await page.getByRole('button', { name: 'Keep proportions' }).click();
await page.getByLabel('Height').fill('200');
await page.getByLabel('Height').press('Enter');
await page.getByRole('radio', { name: /^Sharp pixels/ }).click();

// 7. Export as GIF: size, frame count, delays and colours in order.
await page.getByRole('navigation').getByRole('button', { name: 'Export', exact: true }).click();
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
const bytes = readFileSync(await download.path());
const delays: number[] = [];
for (let i = 0; i < bytes.length - 6; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) delays.push((bytes[i + 4] | (bytes[i + 5] << 8)) * 10);
const frames = await page.evaluate(async (data) => {
	const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
	await gif.default();
	const reader = new gif.AnimationReader(new Uint8Array(data), 'gif');
	const colors: string[] = [];
	for (let f = reader.next_frame(); f; f = reader.next_frame()) {
		const middle = ((f.height >> 1) * f.width + (f.width >> 1)) * 4;
		colors.push(Array.from(f.rgba.slice(middle, middle + 3)).join(','));
	}
	return { width: reader.width(), height: reader.height(), colors };
}, Array.from(bytes));
console.log('gif:', `${frames.width}×${frames.height}`, '| delays', delays.join(' '), '| colours', frames.colors.join(' / '));

// 8. Platforms, in the export panel still open: Discord's emoji, from its folded row.
{ const platform = page.getByRole('button', { name: 'Made for a platform' }); if ((await platform.getAttribute('aria-expanded')) === 'false') await platform.click(); }
await page.getByRole('button', { name: 'Discord', exact: true }).click();
await page.getByRole('button', { name: /^Discord Emoji/ }).click();
console.log('discord emoji chosen:', await page.getByRole('button', { name: /^Discord Emoji/ }).getAttribute('aria-pressed'), '| status:', await page.locator('main').getByText(/× \d+ px/).first().innerText());

// 9. The filmstrip takes the focus, and the arrows step through the frames.
await page.getByRole('group', { name: 'Frames' }).focus();
const before = await page.getByLabel('Playhead').innerText();
await page.keyboard.press('ArrowRight');
console.log('filmstrip focused:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '| playhead', before, '→', await page.getByLabel('Playhead').innerText());

// 10. From the image editor: a batch of images made into a GIF.
await page.goto(`${BASE}/image`);
await page.setInputFiles('input[type=file]', [
	{ name: 'one.png', mimeType: 'image/png', buffer: await png(200, 200, 'red') },
	{ name: 'two.png', mimeType: 'image/png', buffer: await png(200, 200, 'blue') },
]);
await page.waitForSelector('section[aria-label="Batch"]', { timeout: 20000 });
await page.getByRole('button', { name: 'Make a GIF' }).click();
await page.waitForURL('**/gif');
await page.getByRole('listbox', { name: 'Frames' }).getByRole('option').nth(1).waitFor({ timeout: 20000 });
console.log('from the batch:', await page.getByRole('listbox', { name: 'Frames' }).getByRole('option').count(), 'frames');

// 11. A GIF file takes images too, after the frame chosen.
await page.goto(`${BASE}/gif`);
await page.setInputFiles('input[type=file]', 'samples/anim.gif');
const gifFrames = page.getByRole('listbox', { name: 'Frames' });
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Frames' }).click();
await gifFrames.getByRole('option').nth(59).waitFor({ timeout: 20000 });
await gifFrames.getByRole('option').nth(9).click();
await page.locator('aside input[type=file]').setInputFiles([{ name: 'red.png', mimeType: 'image/png', buffer: await png(200, 200, 'red') }]);
await gifFrames.getByRole('option').nth(60).waitFor({ timeout: 10000 });
console.log('gif + image:', await gifFrames.getByRole('option').count(), 'frames | 11th lasts', await gifFrames.getByRole('option').nth(10).locator('.tabular').innerText());

console.log(errors.length ? `errors ${JSON.stringify(errors)}` : 'no errors');
await browser.close();
