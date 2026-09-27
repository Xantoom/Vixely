/**
 * Going from the video editor to others and back keeps everything: a picture captured to the image
 * editor, a GIF made from the video, the browser's Back button, then the video with its trim, crop
 * and playhead as they were. The GIF's frames tool shows its thumbnails at once.
 */
import { engine, sample, BASE } from './engine';
import { mkdirSync } from 'node:fs';

const browser = await engine.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
const header = page.locator('header');
const trimmed = async () => (await page.locator('main').innerText()).match(/Final length\s+([\d:.]+)/)?.[1];

await page.goto(`${BASE}/video`);
await page.setInputFiles('input[type=file]', sample('h264.mp4'));
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await page.waitForTimeout(1200);

// Edits: a 1:1 crop and a passage removed.
await tools.getByRole('button', { name: 'Crop' }).click();
await aside.getByRole('radio', { name: /1:1/ }).click();
await tools.getByRole('button', { name: 'Trim' }).click();
const lanes = (await page.getByRole('group', { name: 'Tracks' }).boundingBox())!;
const x = (t: number) => lanes.x + (t / 12.012) * lanes.width;
await page.mouse.move(x(3), lanes.y + 20);
await page.mouse.down();
await page.mouse.move(x(6), lanes.y + 20, { steps: 6 });
await page.mouse.up();
await page.keyboard.press('Delete');
const before = await trimmed();
console.log('video edited, final length', before);

// A picture captured: the image editor opens it.
await page.getByRole('button', { name: 'Open this picture in the image editor' }).click();
await page.waitForURL('**/image**', { timeout: 20000 });
await page.waitForTimeout(1000);
console.log('image editor:', (await header.innerText()).replace(/\n/g, ' '));

// Back to the video: the same file, the same edits.
await page.goBack();
await page.waitForURL('**/video**');
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 20000 });
await page.waitForTimeout(800);
const afterBack = await trimmed();
console.log('back in the video:', (await header.innerText()).replace(/\n/g, ' '), '| final length', afterBack, afterBack === before ? 'KEPT' : 'LOST');

// A GIF made from the video, its frames shown without a click.
await tools.getByRole('button', { name: 'Info' }).click();
await aside.getByRole('button', { name: 'Make a GIF' }).click();
await page.waitForURL('**/gif**', { timeout: 60000 });
await page.waitForTimeout(2500);
await tools.getByRole('button', { name: 'Frames' }).click();
await page.waitForTimeout(1500);
const drawn = await page.evaluate(() => {
	const canvases = [...document.querySelectorAll<HTMLCanvasElement>('aside [role=listbox] canvas')].slice(0, 8);
	return canvases.filter((canvas) => {
		if (canvas.width < 2) return false;
		const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
		return false;
	}).length;
});
console.log('GIF frames drawn without a click:', drawn, 'of 8');
await page.screenshot({ path: 'shots/roundtrip-frames.png' });

// Back to the video through the editor switcher.
await header.locator('button[aria-haspopup=menu]').first().click();
await page.getByRole('menuitem', { name: /Video/ }).first().click();
await page.waitForURL('**/video**');
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 20000 });
await page.waitForTimeout(800);
const afterGif = await trimmed();
console.log('back from the GIF:', afterGif, afterGif === before ? 'KEPT' : 'LOST');
await tools.getByRole('button', { name: 'Crop' }).click();
console.log('crop kept:', await aside.getByRole('radio', { name: /1:1/ }).getAttribute('aria-checked'));

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
