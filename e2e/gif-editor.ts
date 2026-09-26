/** GIF editor: open, play, trim, speed, back and forth, crop, export; then a video made into a GIF. */
import { engine } from './engine';
import { readFileSync } from 'node:fs';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
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
const preview = async () => (await page.locator('[data-status]').innerText()).replace(/\n/g, ' ');
const exportNow = async () => {
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()) };
};

await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', 'samples/anim.gif');
await page.waitForURL('**/gif');
await page.waitForSelector('[aria-label="Frames"]', { timeout: 20000 });
console.log('opened:', await preview());
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForTimeout(1200);
console.log('playing at', await page.locator('[aria-label="Playhead"]').innerText());
await page.keyboard.press('Space');

const rail = page.locator('nav[aria-label="Editing tools"]');
await rail.getByRole('button', { name: 'Trim' }).click();
await page.getByLabel('Start', { exact: true }).fill('1'); await page.keyboard.press('Enter');
await page.getByLabel('End', { exact: true }).fill('2.5'); await page.keyboard.press('Enter');
console.log('trimmed:', await preview());
await rail.getByRole('button', { name: 'Speed' }).click();
const speed = page.getByLabel('Speed', { exact: true });
await speed.focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); await speed.blur();
await page.locator('aside').getByRole('radio', { name: 'Back and forth' }).click();
console.log('2× back and forth:', await preview());
await rail.getByRole('button', { name: 'Crop' }).click();
await page.locator('aside').getByRole('radio', { name: /^1:1/ }).click();
await page.getByRole('button', { name: 'Export', exact: true }).click();
const edited = await exportNow();
console.log('exported', edited.name, edited.data.length, 'bytes', JSON.stringify(await analyse(edited.data)));
let undos = 0;
while (await page.getByRole('button', { name: 'Undo' }).isEnabled()) { await page.keyboard.press('Control+z'); if (++undos > 20) break; }
console.log('undo steps', undos, await preview());

const video = Buffer.from(await page.evaluate(async () => {
	const mb: any = await import('/node_modules/.vite/deps/mediabunny.js');
	const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
	const canvas = new OffscreenCanvas(640, 360);
	const g = canvas.getContext('2d')!;
	const frames = new mb.CanvasSource(canvas, { codec: 'vp8', bitrate: 2_000_000 });
	output.addVideoTrack(frames, { frameRate: 30 });
	await output.start();
	for (let f = 0; f < 150; f++) {
		g.fillStyle = `hsl(${f * 2.4} 70% 50%)`;
		g.fillRect(0, 0, 640, 360);
		g.fillStyle = '#fff';
		g.font = 'bold 120px sans-serif';
		g.fillText(String(f), 200, 230);
		await frames.add(f / 30, 1 / 30);
	}
	await output.finalize();
	return Array.from(new Uint8Array(output.target.buffer));
}));
await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', { name: 'clip.webm', mimeType: 'video/webm', buffer: video });
await page.waitForURL('**/video');
await page.getByRole('button', { name: 'Make a GIF' }).click();
await page.waitForURL('**/gif');
await page.waitForSelector('[aria-label="Frames"]', { timeout: 20000 });
await page.waitForTimeout(1000);
console.log('video as GIF:', await preview());
await page.getByRole('button', { name: 'Export', exact: true }).click();
const fromVideo = await exportNow();
console.log('video GIF', fromVideo.name, fromVideo.data.length, 'bytes', JSON.stringify(await analyse(fromVideo.data)));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
