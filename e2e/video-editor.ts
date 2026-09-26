/**
 * The video editor: pictures drawn as edited (crop, colours, a phone video stored turned), the
 * timeline's pictures, a passage removed and skipped by playback (with and without sound), undo,
 * and a picture opened in the image editor with the video's crop.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
const time = async () => (await page.locator('section[aria-label="Preview"] .tabular').first().innerText()).split(' / ')[0];
const open = async (path: string) => {
	await page.goto('http://localhost:5173/video');
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
	await page.waitForTimeout(1500);
};
/** Mean brightness and the red share of the picture on screen. */
const picture = () =>
	page.evaluate(() => {
		const source = document.querySelector('canvas') as HTMLCanvasElement;
		const probe = document.createElement('canvas');
		probe.width = 32;
		probe.height = 18;
		const context = probe.getContext('2d')!;
		context.drawImage(source, 0, 0, 32, 18);
		const data = context.getImageData(0, 0, 32, 18).data;
		let light = 0;
		let spread = 0;
		for (let i = 0; i < data.length; i += 4) {
			light += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
			spread += Math.max(data[i]!, data[i + 1]!, data[i + 2]!) - Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
		}
		const n = data.length / 4;
		return { width: source.clientWidth, height: source.clientHeight, light: Math.round(light / n), colour: Math.round(spread / n) };
	});
const strip = () =>
	page.evaluate(() => {
		const canvas = document.querySelector('[aria-label="Tracks"] canvas') as HTMLCanvasElement;
		const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		let filled = 0;
		for (let i = 3; i < data.length; i += 4) if (data[i]) filled++;
		return Math.round((filled / (data.length / 4)) * 100);
	});

// 1. Pictures, crop and colours.
await open('samples/h264.mp4');
console.log('picture:', await picture(), '| strip filled:', await strip(), '%');
await tools.getByRole('button', { name: 'Crop' }).click();
await aside.getByRole('radio', { name: /1:1/ }).click();
await tools.getByRole('button', { name: 'Adjust' }).click();
const saturation = aside.getByRole('slider', { name: 'Saturation' });
await saturation.focus();
for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(400);
console.log('1:1 and grey:', await picture());
await page.screenshot({ path: 'shots/video-edited.png' });
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
console.log('after two undos:', await picture());

// 2. A passage removed on the timeline, skipped while playing.
await tools.getByRole('button', { name: 'Trim' }).click();
const lanes = (await page.getByRole('group', { name: 'Tracks' }).boundingBox())!;
const x = (t: number, duration: number) => lanes.x + (t / duration) * lanes.width;
await page.mouse.move(x(3, 12.012), lanes.y + 20);
await page.mouse.down();
await page.mouse.move(x(8, 12.012), lanes.y + 20, { steps: 6 });
await page.mouse.up();
await page.keyboard.press('Delete');
console.log('trim panel:', (await aside.innerText()).replace(/\n/g, ' | ').slice(0, 180));
await page.mouse.click(x(1, 12.012), lanes.y + 20);
await page.keyboard.press('Space');
await page.waitForTimeout(3000);
await page.keyboard.press('Space');
console.log('3 s from 0:01 past a 0:03 → 0:08 cut, with sound:', await time());

// 3. A picture opened in the image editor, with the video's crop.
await tools.getByRole('button', { name: 'Crop' }).click();
await aside.getByRole('radio', { name: /16:9/ }).click();
await aside.getByLabel('Width').fill('960');
await aside.getByLabel('Width').press('Enter');
await page.getByRole('button', { name: 'Open this picture in the image editor' }).click();
await page.waitForURL('**/image**', { timeout: 20000 });
await page.waitForTimeout(1500);
await tools.getByRole('button', { name: 'Crop' }).click();
console.log('image editor:', (await page.locator('header').innerText()).replace(/\n/g, ' '), '| width', await aside.getByLabel('Width').inputValue(), 'height', await aside.getByLabel('Height').inputValue());

// 4. A phone video stored turned shows upright.
await open('samples/rotated.mp4');
console.log('turned video:', await picture());

// 5. Without sound, the page clock skips removed passages too.
await open('samples/silent.mp4');
const lanes2 = (await page.getByRole('group', { name: 'Tracks' }).boundingBox())!;
const x2 = (t: number) => lanes2.x + (t / 12.012) * lanes2.width;
await page.mouse.move(x2(3), lanes2.y + 20);
await page.mouse.down();
await page.mouse.move(x2(8), lanes2.y + 20, { steps: 6 });
await page.mouse.up();
await page.keyboard.press('Delete');
await page.mouse.click(x2(1), lanes2.y + 20);
await page.keyboard.press('Space');
await page.waitForTimeout(3000);
console.log('3 s from 0:01 past a 0:03 → 0:08 cut, silent:', await time());
await page.waitForTimeout(3500);
console.log('at the end:', await time(), '| still playing:', (await page.getByRole('button', { name: 'Pause' }).count()) > 0);

// 6. Phone width.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/video-mobile.png' });

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
