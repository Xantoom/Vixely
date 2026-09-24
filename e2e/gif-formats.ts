import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', 'samples/anim.gif');
await page.waitForURL('**/gif');
await page.waitForSelector('[aria-label="Frames"]', { timeout: 20000 });
await page.getByRole('button', { name: 'Export', exact: true }).click();
const aside = page.locator('aside');
console.log('panel:', (await aside.innerText()).replace(/\n/g, ' | ').slice(0, 260));
const exportButton = page.locator('aside + div').getByRole('button').first();
const save = async () => {
	const t0 = Date.now();
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), exportButton.click()]);
	return { name: download.suggestedFilename(), data: readFileSync(await download.path()), ms: Date.now() - t0 };
};
const inspect = async (data: Buffer, kind: string) => page.evaluate(async ([bytes, kind]) => {
	if (kind === 'video') {
		const mb: any = await import('/node_modules/.vite/deps/mediabunny.js');
		const input = new mb.Input({ source: new mb.BufferSource(new Uint8Array(bytes)), formats: mb.ALL_FORMATS });
		const track = await input.getPrimaryVideoTrack();
		const stats = await track.computePacketStats();
		return { codec: track.codec, width: track.displayWidth, height: track.displayHeight, frames: stats.packetCount, ms: Math.round((await input.computeDuration()) * 1000) };
	}
	const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
	await gif.default();
	const reader = new gif.AnimationReader(new Uint8Array(bytes), kind);
	let frames = 0, total = 0;
	for (let f = reader.next_frame(); f; f = reader.next_frame()) { frames++; total += f.delay; }
	return { width: reader.width(), height: reader.height(), frames, ms: Math.round(total) };
}, [Array.from(data), kind] as const);

// 1. Original: trim 1 s – 2.5 s, loop once; frames copied as they are.
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Trim' }).click();
await page.getByLabel('Start', { exact: true }).fill('1'); await page.keyboard.press('Enter');
await page.getByLabel('End', { exact: true }).fill('2.5'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.getByLabel('Loop').selectOption({ label: 'Once' });
console.log('inert while original:', await aside.locator('[inert]').count());
const original = await save();
console.log('original:', original.name, original.data.length, 'bytes', `${original.ms} ms`, JSON.stringify(await inspect(original.data, 'gif')));
const source = readFileSync('samples/anim.gif');
console.log('  source is', source.length, 'bytes for 60 frames');

// 2. Convert to each format.
await aside.getByRole('radio', { name: /^Convert/ }).click();
for (const [label, kind] of [['GIF', 'gif'], ['APNG', 'apng'], ['WebP', 'webp'], ['Video', 'video']] as const) {
	await aside.getByRole('radio', { name: new RegExp(`^${label}`) }).click();
	const out = await save();
	console.log(label, out.name, out.data.length, 'bytes', `${out.ms} ms`, JSON.stringify(await inspect(out.data, kind)));
}
await aside.screenshot({ path: 'shots/gif-formats-aside.png' });

// 2b. Size limit: 1 MB for a GIF that weighs 1.7 MB at full width.
await aside.getByRole('radio', { name: /^GIF/ }).click();
await page.getByLabel('Maximum size').selectOption({ label: '1.0 MB' });
const fitted = await save();
console.log('limited to 1 MB:', fitted.data.length, 'bytes', `${fitted.ms} ms`, JSON.stringify(await inspect(fitted.data, 'gif')), '|', (await page.locator('aside + div').innerText()).replace(/\n/g, ' | '));
await page.getByLabel('Maximum size').selectOption({ label: 'No limit' });

// 3. A speed change blocks the original.
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Speed' }).click();
await page.locator('aside').getByRole('radio', { name: 'Reverse' }).click();
await page.getByRole('button', { name: 'Export', exact: true }).click();
console.log('original disabled after reverse:', await aside.getByRole('radio', { name: /^Original/ }).isDisabled(), (await aside.innerText()).includes('redraw the frames'));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
