/**
 * The pictures of the home page, taken from the app itself with its own examples
 * (public/samples), in light and dark: public/shots/<name>-<theme>-<width>.webp, 1920 and 960 px
 * wide. Needs the dev server; `bun screenshots.ts image-looks` retakes one.
 */
import type { Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { engine } from './engine';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = '../public/shots';
const WIDTHS = [1920, 960];
const EXAMPLES = '../public/samples';

type Shot = (page: Page) => Promise<void>;

const tool = (page: Page, name: string) =>
	page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name, exact: true }).click();
const aside = (page: Page) => page.locator('aside');
const open = async (page: Page, path: string, file: string, ready = 'nav[aria-label="Editing tools"]') => {
	await page.goto(`${BASE}${path}`);
	await page.setInputFiles('input[type=file]', `${EXAMPLES}/${file}`);
	await page.waitForSelector(ready, { timeout: 30000 });
	await page.waitForTimeout(2000);
};
const exportPanel = async (page: Page) => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.waitForTimeout(800);
};

/** Each picture: what it shows, in the order of the home page. */
export const SHOTS: Record<string, Shot> = {
	'image-looks': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await tool(page, 'Adjust');
		await page.getByRole('radiogroup', { name: 'Looks' }).getByRole('radio', { name: 'Vivid' }).click();
	},
	'image-formats': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await tool(page, 'Formats');
	},
	'image-export': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await exportPanel(page);
		await aside(page).getByLabel('Format', { exact: true }).click();
		await page.getByRole('option', { name: /AVIF/ }).click();
	},
	'video-trim': async (page) => {
		await open(page, '/video', 'sunset.mkv', '[role=group][aria-label="Tracks"]');
		await tool(page, 'Trim');
	},
	'video-export': async (page) => {
		await open(page, '/video', 'sunset.mkv', '[role=group][aria-label="Tracks"]');
		await tool(page, 'Formats');
		await aside(page).getByRole('button', { name: /^Discord/ }).first().click();
		await exportPanel(page);
	},
	'video-subtitles': async (page) => {
		await open(page, '/video', 'sunset.mkv', '[role=group][aria-label="Tracks"]');
		await tool(page, 'Subtitles');
	},
	'gif-frames': async (page) => {
		await open(page, '/gif', 'sunset.gif');
		await tool(page, 'Frames');
	},
	'gif-text': async (page) => {
		await open(page, '/gif', 'sunset.gif');
		await tool(page, 'Text');
		await aside(page).getByRole('button', { name: /^Title/ }).click();
		await aside(page).getByLabel('Text', { exact: true }).fill('Golden hour');
	},
	'gif-export': async (page) => {
		await open(page, '/gif', 'sunset.gif');
		await exportPanel(page);
	},
	'audio-volume': async (page) => {
		await open(page, '/audio', 'sunset.mp3');
		await tool(page, 'Volume');
	},
	'audio-sound': async (page) => {
		await open(page, '/audio', 'sunset.mp3');
		await tool(page, 'Sound');
		await aside(page).getByRole('radio', { name: 'Voice' }).click();
	},
	'audio-export': async (page) => {
		await open(page, '/audio', 'sunset.mp3');
		await exportPanel(page);
	},
	'subtitles-editor': async (page) => {
		await open(page, '/subtitles', 'sunset.mkv', '[role=grid]');
		await page.getByRole('grid').getByRole('row').nth(2).click();
	},
	'subtitles-translate': async (page) => {
		await open(page, '/subtitles', 'sunset.mkv', '[role=grid]');
		await tool(page, 'Translate');
		await aside(page).getByLabel('Into').click();
		await page.getByRole('option', { name: 'Spanish' }).click();
		await aside(page).getByRole('button', { name: 'Start translating' }).click();
		await page.getByRole('grid').getByRole('row').nth(1).click();
		const text = page.getByLabel('Text', { exact: true });
		await text.fill('El sol se pone sobre el lago.');
		await text.press('Enter');
	},
	'subtitles-timing': async (page) => {
		await open(page, '/subtitles', 'sunset.mkv', '[role=grid]');
		await tool(page, 'Timing');
	},
};

/** A picture made smaller and saved as WebP by the browser itself. */
async function encode(page: Page, png: Buffer, width: number): Promise<Buffer> {
	const bytes: number[] = await page.evaluate(
		async ({ data, width }) => {
			const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
			const height = Math.round((bitmap.height * width) / bitmap.width);
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d')!;
			context.imageSmoothingQuality = 'high';
			context.drawImage(bitmap, 0, 0, width, height);
			const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		},
		{ data: Array.from(png), width },
	);
	return Buffer.from(bytes);
}

mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const browser = await engine.launch();
for (const theme of ['light', 'dark'] as const) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		locale: 'en-US',
		colorScheme: theme,
	});
	await context.addInitScript((value) => {
		localStorage.setItem('vixely:theme', value);
		// Never offered again: each picture starts afresh.
		indexedDB.deleteDatabase('vixely-session');
	}, theme);
	for (const [name, shot] of Object.entries(SHOTS)) {
		if (wanted.length > 0 && !wanted.includes(name)) continue;
		const page = await context.newPage();
		page.on('dialog', (dialog) => void dialog.accept());
		await shot(page);
		await page.mouse.move(0, 899);
		await page.waitForTimeout(1200);
		const png = await page.screenshot();
		writeFileSync(`shots/site-${name}-${theme}.png`, png);
		for (const width of WIDTHS) {
			const webp = await encode(page, png, width);
			writeFileSync(`${OUT}/${name}-${theme}-${width}.webp`, webp);
		}
		console.log(name, theme);
		await page.close();
	}
	await context.close();
}
await browser.close();
