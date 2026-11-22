/**
 * Draws the picture link previews show (public/og-image.png, 1200 × 630): the name and what the
 * site is for on the left, the video editor as it is today on the right, cut by the edges. The
 * editor is captured from the running site, so the picture follows the design.
 *
 *   cd e2e && bun og-image.ts        (with the dev server running, or BASE set)
 *
 * The text is set in the system face the app uses: Segoe UI from Windows when the fonts are at
 * hand (WSL), else whatever Arial-like face the system has.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE, engine } from './engine';
import { useSystemFont } from './system-font';

const OUT = resolve('../public/og-image.png');
const WINDOWS_FONTS = '/mnt/c/Windows/Fonts';

const browser = await engine.launch();

// 1. The video editor, dark, with the sample sunset open on the Edit tab.
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark', locale: 'en-US' });
await useSystemFont(context);
const app = await context.newPage();
await app.goto(`${BASE}/video`);
await app.setInputFiles('input[type=file]', resolve('../public/samples/sunset.mkv'));
await app.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await app.getByRole('navigation').getByRole('button', { name: 'Edit', exact: true }).click();
await app.waitForTimeout(2500);
const shot = (await app.screenshot({ type: 'png' })).toString('base64');

// 2. The card around it. The fonts go in whole: a page made from a string can't read local files.
const font = (file: string, weight: number) =>
	existsSync(`${WINDOWS_FONTS}/${file}`)
		? `@font-face { font-family: Face; font-weight: ${weight}; src: url(data:font/ttf;base64,${readFileSync(`${WINDOWS_FONTS}/${file}`).toString('base64')}); }`
		: '';
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(`<!doctype html>
<style>
	${font('segoeui.ttf', 400)}
	${font('seguisb.ttf', 600)}
	${font('segoeuib.ttf', 700)}
	* { margin: 0; box-sizing: border-box; }
	body {
		width: 1200px; height: 630px; overflow: hidden; position: relative;
		background: #161618; color: #f3f3f5;
		font-family: Face, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
	}
	.text { position: absolute; left: 72px; top: 0; bottom: 0; width: 380px; display: grid; align-content: center; gap: 28px; }
	.mark { display: flex; align-items: center; gap: 20px; }
	.tile { width: 76px; height: 76px; border-radius: 20px; background: #f3f3f5; display: grid; place-items: center; }
	.name { font-size: 72px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
	.line { font-size: 34px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; color: #c8c8ce; text-wrap: balance; }
	.editors { font-size: 22px; line-height: 1.5; color: #8e8e97; }
	.shot {
		position: absolute; left: 500px; top: 72px; width: 960px;
		border-radius: 14px 0 0 0; border: 1px solid #36363c; border-right: 0; border-bottom: 0;
		overflow: hidden;
	}
	.shot img { display: block; width: 100%; }
</style>
<div class="text">
	<div class="mark">
		<div class="tile">
			<svg width="48" height="48" viewBox="0 0 24 24"><path d="M5.8 7h3.1l3.1 8.2L15.1 7h3.1l-4.7 11h-3z" fill="#111113"/></svg>
		</div>
		<div class="name">Vixely</div>
	</div>
	<div class="line">Media editors in your browser</div>
	<div class="editors">Video, images, GIFs, audio and subtitles. Nothing is uploaded.</div>
</div>
<div class="shot"><img src="data:image/png;base64,${shot}"></div>`);
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(`wrote ${OUT}`);
