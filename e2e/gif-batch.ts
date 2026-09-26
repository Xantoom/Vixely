/** A batch of three GIFs and one PNG (left out), exported as WebP into a ZIP; then zoom on a long video. */
import { engine } from './engine';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => {
	Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
	Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/');

const makeGif = async (hue: number, frames: number) => Buffer.from(await page.evaluate(async ([hue, frames]) => {
	const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
	await gif.default();
	const canvas = new OffscreenCanvas(200, 120);
	const g = canvas.getContext('2d', { willReadFrequently: true })!;
	const writer = new gif.GifWriter(80, 100, 0, false);
	for (let i = 0; i < frames; i++) {
		g.fillStyle = `hsl(${hue + i * 4} 70% 50%)`;
		g.fillRect(0, 0, 200, 120);
		g.fillStyle = '#fff';
		g.fillRect(10 + i * 5, 40, 30, 30);
		writer.add_frame(new Uint8Array(g.getImageData(0, 0, 200, 120).data.buffer), 200, 120, i / 10);
	}
	return Array.from(writer.finish() as Uint8Array);
}, [hue, frames] as const));
const png = Buffer.from(await page.evaluate(async () => {
	const canvas = new OffscreenCanvas(20, 20);
	canvas.getContext('2d');
	return Array.from(new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()));
}));

await page.setInputFiles('input[type=file]', [
	{ name: 'one.gif', mimeType: 'image/gif', buffer: await makeGif(0, 20) },
	{ name: 'two.gif', mimeType: 'image/gif', buffer: await makeGif(120, 30) },
	{ name: 'three.gif', mimeType: 'image/gif', buffer: await makeGif(240, 10) },
	{ name: 'still.png', mimeType: 'image/png', buffer: png },
]);
await page.waitForURL('**/gif');
await page.waitForSelector('section[aria-label="Batch"]', { timeout: 20000 });
console.log('strip:', (await page.locator('section[aria-label="Batch"]').innerText()).replace(/\n/g, ' | '));
console.log('rail:', (await page.locator('nav[aria-label="Editing tools"]').innerText()).replace(/\n/g, ' '));
await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.locator('aside').getByRole('radio', { name: /^WebP/ }).click();
await page.getByLabel('Loop').click();
await page.getByRole('option', { name: 'Once' }).click();
await page.locator('section[aria-label="Batch"]').getByRole('button', { name: 'two.gif', exact: true }).click();
await page.waitForTimeout(1500);
console.log('settings kept after switching file:', await page.locator('aside').getByRole('radio', { name: /^WebP/ }).isChecked(), await page.getByLabel('Loop').innerText());
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Export 3 files' }).click()]);
const zip = unzipSync(readFileSync(await download.path()));
console.log('zip', download.suggestedFilename(), Object.entries(zip).map(([name, data]) => `${name} ${data.length} B`).join(', '));
for (const [name, data] of Object.entries(zip)) {
	const info = await page.evaluate(async (bytes) => {
		const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
		await gif.default();
		const reader = new gif.AnimationReader(new Uint8Array(bytes), 'webp');
		let frames = 0;
		for (let f = reader.next_frame(); f; f = reader.next_frame()) frames++;
		return `${reader.width()}×${reader.height()} ${frames} frames`;
	}, Array.from(data));
	console.log(' ', name, info);
}
console.log('button:', await page.locator('aside + div').innerText());

// Zoom: a 60 s video made into a GIF.
const video = Buffer.from(await page.evaluate(async () => {
	const mb: any = await import('/node_modules/.vite/deps/mediabunny.js');
	const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
	const canvas = new OffscreenCanvas(320, 180);
	const g = canvas.getContext('2d')!;
	const frames = new mb.CanvasSource(canvas, { codec: 'vp8', bitrate: 300_000 });
	output.addVideoTrack(frames, { frameRate: 10 });
	await output.start();
	for (let f = 0; f < 600; f++) {
		g.fillStyle = `hsl(${f} 60% 45%)`;
		g.fillRect(0, 0, 320, 180);
		g.fillStyle = '#fff';
		g.font = 'bold 80px sans-serif';
		g.fillText(String(Math.floor(f / 10)), 100, 120);
		await frames.add(f / 10, 0.1);
	}
	await output.finalize();
	return Array.from(new Uint8Array(output.target.buffer));
}));
await page.goto('http://localhost:5173/gif');
await page.setInputFiles('input[type=file]', { name: 'long.webm', mimeType: 'video/webm', buffer: video });
await page.waitForSelector('[aria-label="Frames"]', { timeout: 30000 });
const ruler = async () => (await page.locator('section[aria-label="Timeline"]').innerText()).split('\n').filter((line) => /^\d+:\d\d/.test(line)).join(' ');
console.log('video dropped on GIF editor:', new URL(page.url()).pathname, '| ruler:', await ruler());
const strip = (await page.locator('[aria-label="Frames"]').boundingBox())!;
await page.mouse.move(strip.x + strip.width / 2, strip.y + 30);
for (let i = 0; i < 8; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); }
await page.waitForTimeout(1500);
console.log('zoomed ruler:', await ruler());
await page.screenshot({ path: 'shots/gif-zoom.png' });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
