/**
 * The built site without a network: installable, its service worker caches the app, then with the
 * network cut the pages reload, a video is copied and a photo encoded by the WebAssembly encoders.
 * Runs against the build: `bun run build && bunx vite preview` in the repository root (BASE=…
 * for another server, such as nginx).
 */
import { browserName, engine, sample } from './engine';
import { readFileSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:4173';
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const aside = page.locator('aside');

await page.goto(base);
if (browserName === 'chromium') {
	const cdp = await ctx.newCDPSession(page);
	const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
	console.log('installable:', installabilityErrors.length === 0 ? 'yes' : installabilityErrors.map((e) => e.errorId).join(', '));
}

// The worker takes over, then caches the rest in the background.
await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null, null, { timeout: 30000 });
const t0 = Date.now();
let count = 0;
for (let stable = 0; stable < 3 && Date.now() - t0 < 120000; ) {
	await page.waitForTimeout(1000);
	const next = await page.evaluate(async () => (await (await caches.open('vixely-app')).keys()).length);
	stable = next === count ? stable + 1 : 0;
	count = next;
}
console.log(`cached: ${count} files in ${Date.now() - t0} ms`);

await ctx.setOffline(true);
await page.reload();
console.log('offline home:', await page.title(), '| isolated:', await page.evaluate(() => crossOriginIsolated));

// A video copied as it is.
await page.goto(`${base}/video`);
console.log('offline /video:', await page.title());
await page.setInputFiles('input[type=file]', sample('film.mp4'));
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await page.getByRole('button', { name: 'Export', exact: true }).click();
const [video] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
console.log('  video:', video.suggestedFilename(), readFileSync(await video.path()).length, 'bytes');

// A HEIC photo (libheif) encoded as AVIF (Rust, WebAssembly).
await page.goto(`${base}/image`);
await page.setInputFiles('input[type=file]', 'samples/photo.heic');
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Format', { exact: true }).click();
await page.getByRole('option', { name: /AVIF/ }).click();
const [photo] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('aside + div').getByRole('button').first().click()]);
console.log('  photo:', photo.suggestedFilename(), readFileSync(await photo.path()).length, 'bytes');

// A task page never visited.
await page.goto(`${base}/tools/video-to-gif`);
console.log('offline task page:', await page.title());

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
