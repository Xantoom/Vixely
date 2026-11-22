/**
 * Comparing with the original in the video, image and GIF editors: held, a button shows the
 * original; the side-by-side one shows it left of a line, the result right of it, and greys out the
 * first. The line is dragged, and the button takes it away.
 */
import { engine, BASE } from './engine';
const browser = await engine.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const [route, file] of [['video', 'speech.mp4'], ['image', 'photo.heic'], ['gif', 'anim.gif']]) {
	await page.goto(`${BASE}/${route}`);
	await page.setInputFiles('input[type=file]', `samples/${file}`);
	await page.waitForTimeout(4000);
	await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Adjust', exact: true }).click();
	await page.waitForTimeout(600);
	const slider = page.getByRole('slider', { name: /Saturation/ }).first();
	await slider.focus();
	await page.keyboard.press('Home');
	const hold = page.getByRole('button', { name: 'Hold to compare with the original' }).first();
	const side = page.getByRole('button', { name: 'Compare side by side' }).first();
	await hold.hover();
	await page.mouse.down();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `shots/compare-${route}-held.png` });
	await page.mouse.up();
	await side.click();
	await page.waitForTimeout(800);
	console.log(route, 'hold disabled while side by side', await hold.isDisabled());
	const line = page.getByRole('slider', { name: 'Line between the original and the result' });
	const box = (await line.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x - 150, box.y + box.height / 2, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(500);
	console.log(route, 'line at', await line.getAttribute('aria-valuenow'));
	await page.screenshot({ path: `shots/compare-${route}.png` });
	await side.click();
	await page.waitForTimeout(300);
	console.log(route, 'hold enabled again', await hold.isEnabled());
	console.log(route, 'line after off', await line.count());
}
console.log('errors', errors);
await browser.close();
