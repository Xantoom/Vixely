import { mkdirSync } from 'node:fs';
/**
 * Tracks added in the video editor play at once: a sound file becomes the sound heard and is
 * listed in the player's audio menu, a subtitle file shows over the video and is chosen in its
 * menu. Taking the sound out again gives the video its own sound back.
 */
import { engine, BASE } from './engine';

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');

await page.goto(`${BASE}/video`);
await page.setInputFiles('input[type=file]', 'samples/speech.mp4');
await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await tools.getByRole('button', { name: 'Tracks', exact: true }).click();

const menuItems = async (label: string) => {
	await page.getByRole('button', { name: label, exact: true }).click();
	const items = page.getByRole('menuitemradio');
	const listed = await Promise.all(
		(await items.all()).map(
			async (item) =>
				`${(await item.getAttribute('aria-checked')) === 'true' ? '*' : ' '}${(await item.innerText()).replace(/\s+/g, ' ')}`,
		),
	);
	await page.keyboard.press('Escape');
	return listed;
};

console.log('audio before:', await menuItems('Audio track'));
await aside.locator('input[type=file][accept^="audio"]').setInputFiles('samples/jfk.wav');
await aside.getByText(/jfk/).first().waitFor();
await page.waitForTimeout(800);
console.log('audio after add:', await menuItems('Audio track'));

// Playing goes on with the added sound as the clock.
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
await page.keyboard.press('Space');
console.log('time after 1.5 s:', await page.getByRole('timer').first().innerText());

await aside.locator('input[type=file][accept^=".srt"]').setInputFiles('samples/extra.fr.srt');
await page.waitForTimeout(800);
console.log('subtitles after add:', await menuItems('Subtitles'));
// Subtitles are drawn on a canvas: the shot shows the line, the menu marks them on.
await page.evaluate(async () => {
	const { usePlayback } = await import('/src/media/playback.ts');
	usePlayback.getState().seek(1.5);
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/video-added.png' });

// Tracks left out of the video are no longer offered by the player.
await aside.getByRole('checkbox', { name: /^Keep .*French/ }).uncheck();
await page.waitForTimeout(300);
console.log(
	'subtitles menu after leaving French out:',
	await page.getByRole('button', { name: 'Subtitles', exact: true }).count(),
);
await aside.getByRole('checkbox', { name: /^Keep .*French/ }).check();
await aside.getByRole('checkbox', { name: /^Keep .*jfk/ }).uncheck();
await page.waitForTimeout(500);
console.log('audio after leaving jfk out:', await menuItems('Audio track'));
await aside.getByRole('checkbox', { name: /^Keep .*jfk/ }).check();
await page.waitForTimeout(300);
console.log('audio after putting jfk back:', await menuItems('Audio track'));

// The added sound taken out: the video's own sound is heard again.
await aside.getByRole('button', { name: /jfk/ }).first().click();
await aside.getByRole('button', { name: 'Remove this track' }).click();
await page.waitForTimeout(800);
console.log('audio after remove:', await menuItems('Audio track'));

console.log('errors', errors);
await browser.close();
