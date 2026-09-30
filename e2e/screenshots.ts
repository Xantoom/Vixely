/**
 * The pictures of the home page, taken from the app itself with its own examples
 * (public/samples), in light and dark, in English and French:
 * public/shots/<name>[-fr]-<theme>-<width>.webp, 1920 and 960 px wide. Needs the dev server; `bun screenshots.ts image-looks` retakes one.
 */
import type { Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { engine } from './engine';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = '../public/shots';
const WIDTHS = [1920, 960];
const EXAMPLES = '../public/samples';

type Shot = (page: Page) => Promise<void>;

/** The language of the pictures being taken, and a label in it. */
let french = false;
const t = (english: string, inFrench: string) => (french ? inFrench : english);
const TOOLS = 'nav[aria-label="Editing tools"], nav[aria-label="Outils d’édition"]';
const tracks = () => `[role=group][aria-label="${t('Tracks', 'Pistes')}"]`;

const tool = (page: Page, name: string) => page.locator(TOOLS).getByRole('button', { name, exact: true }).click();
const aside = (page: Page) => page.locator('aside');
const open = async (page: Page, path: string, file: string, ready = TOOLS) => {
	await page.goto(`${BASE}${path}`);
	await page.setInputFiles('input[type=file]', `${EXAMPLES}/${file}`);
	await page.waitForSelector(ready, { timeout: 30000 });
	await page.waitForTimeout(2000);
};
const exportPanel = async (page: Page) => {
	await page.getByRole('navigation').getByRole('button', { name: t('Export', 'Exporter'), exact: true }).click();
	await page.waitForTimeout(800);
};

/** Each picture: what it shows, in the order of the home page. */
export const SHOTS: Record<string, Shot> = {
	'image-looks': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await tool(page, t('Adjust', 'Réglages'));
		await page.getByRole('radiogroup', { name: t('Looks', 'Effets prêts') })
			.getByRole('radio', { name: t('Vivid', 'Éclatant') }).click();
	},
	'image-formats': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await tool(page, t('Crop', 'Recadrer'));
		await aside(page).getByRole('radio', { name: t('Social networks', 'Réseaux sociaux') }).click();
		await aside(page).getByRole('radio', { name: /^Instagram Reels/ }).click();
	},
	'image-export': async (page) => {
		await open(page, '/image', 'lake.jpg');
		await exportPanel(page);
		await aside(page).getByLabel('Format', { exact: true }).click();
		await page.getByRole('option', { name: /AVIF/ }).click();
	},
	'video-trim': async (page) => {
		await open(page, '/video', 'sunset.mkv', tracks());
		await tool(page, t('Trim', 'Couper'));
	},
	'video-export': async (page) => {
		await open(page, '/video', 'sunset.mkv', tracks());
		await exportPanel(page);
		await aside(page).getByRole('radio', { name: t('Convert', 'Convertir') }).click();
	},
	'video-subtitles': async (page) => {
		await open(page, '/video', 'sunset.mkv', tracks());
		await tool(page, t('Tracks', 'Pistes'));
		await aside(page).locator('li[data-media=audio] button[aria-expanded]').first().click();
	},
	'gif-frames': async (page) => {
		await open(page, '/gif', 'sunset.gif');
		await tool(page, t('Frames', 'Images'));
	},
	'gif-text': async (page) => {
		await open(page, '/gif', 'sunset.gif');
		await tool(page, t('Layers', 'Calques'));
		await aside(page).getByRole('button', { name: french ? /^Titre/ : /^Title/ }).click();
		await aside(page).getByLabel(t('Text', 'Texte'), { exact: true })
			.fill(t('Golden hour', 'Heure dorée'));
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
		await tool(page, t('Sound', 'Son'));
		await aside(page).getByLabel(t('Equalizer presets', 'Préréglages de l’égaliseur')).click();
		await page.getByRole('option', { name: t('Voice', 'Voix') }).click();
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
		await tool(page, t('Translate', 'Traduire'));
		await aside(page).getByLabel(t('Into', 'Vers')).click();
		await page.getByRole('option', { name: t('Spanish', 'espagnol') }).click();
		await aside(page).getByRole('button', { name: t('Start translating', 'Commencer la traduction') }).click();
		await page.getByRole('grid').getByRole('row').nth(1).click();
		const text = page.getByLabel(t('Text', 'Texte'), { exact: true });
		await text.fill('El sol se pone sobre el lago.');
		await text.press('Enter');
	},
	'subtitles-timing': async (page) => {
		await open(page, '/subtitles', 'sunset.mkv', '[role=grid]');
		await tool(page, t('Timing', 'Synchro'));
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
for (const [language, theme] of (['en', 'fr'] as const).flatMap((language) =>
	(['light', 'dark'] as const).map((theme) => [language, theme] as const),
)) {
	french = language === 'fr';
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		locale: french ? 'fr-FR' : 'en-US',
		colorScheme: theme,
	});
	await context.addInitScript(
		({ theme, language }) => {
			localStorage.setItem('vixely:theme', theme);
			localStorage.setItem('PARAGLIDE_LOCALE', language);
		// Never offered again: each picture starts afresh.
			indexedDB.deleteDatabase('vixely-session');
		},
		{ theme, language },
	);
	for (const [name, shot] of Object.entries(SHOTS)) {
		if (wanted.length > 0 && !wanted.includes(name)) continue;
		const page = await context.newPage();
		page.on('dialog', (dialog) => void dialog.accept());
		await shot(page);
		await page.mouse.move(0, 899);
		await page.waitForTimeout(1200);
		const png = await page.screenshot();
		const file = `${name}${french ? '-fr' : ''}-${theme}`;
		writeFileSync(`shots/site-${file}.png`, png);
		for (const width of WIDTHS) {
			const webp = await encode(page, png, width);
			writeFileSync(`${OUT}/${file}-${width}.webp`, webp);
		}
		console.log(name, language, theme);
		await page.close();
	}
	await context.close();
}
await browser.close();
