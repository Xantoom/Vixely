/**
 * The audio editor's new tools on a 440 Hz tone with a second of silence in the middle: the
 * silence found and cut, the speed and the pitch changed apart, a loudness target with the voice
 * evened out, the equalizer curve dragged and moved by keyboard; then the WAV exported and read
 * back: its length, its pitch, and no silence left.
 */
import { engine, BASE } from './engine';
import { readFileSync } from 'node:fs';

const RATE = 48_000;

/** 2 s of tone, 1 s of silence, 2 s of tone: a 16-bit mono WAV. */
function toneWav(): Buffer {
	const frames = 5 * RATE;
	const data = Buffer.alloc(frames * 2);
	for (let n = 0; n < frames; n++) {
		const t = n / RATE;
		const on = t < 2 || t >= 3;
		data.writeInt16LE(on ? Math.round(12_000 * Math.sin(2 * Math.PI * 440 * t)) : 0, n * 2);
	}
	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + data.length, 4);
	header.write('WAVEfmt ', 8);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(RATE, 24);
	header.writeUInt32LE(RATE * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36);
	header.writeUInt32LE(data.length, 40);
	return Buffer.concat([header, data]);
}

/** The first channel of a PCM WAV, as numbers from −1 to 1, and its rate. */
function readWav(bytes: Buffer): { samples: Float32Array; rate: number } {
	let at = 12;
	let rate = 0;
	let channels = 1;
	let bits = 16;
	while (at < bytes.length - 8) {
		const id = bytes.toString('ascii', at, at + 4);
		const size = bytes.readUInt32LE(at + 4);
		if (id === 'fmt ') {
			channels = bytes.readUInt16LE(at + 10);
			rate = bytes.readUInt32LE(at + 12);
			bits = bytes.readUInt16LE(at + 22);
		}
		if (id === 'data') {
			const step = (bits / 8) * channels;
			const count = Math.floor(Math.min(size, bytes.length - at - 8) / step);
			const samples = new Float32Array(count);
			for (let n = 0; n < count; n++) samples[n] = bytes.readInt16LE(at + 8 + n * step) / 32_768;
			return { samples, rate };
		}
		at += 8 + size + (size % 2);
	}
	throw new Error('No data chunk.');
}

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
const finalLength = async () => (await page.locator('main').innerText()).match(/Final length\s+([\d:.]+)/)?.[1];

await page.goto(`${BASE}/audio`);
await page.setInputFiles('input[type=file]', { name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
await tools.getByRole('button', { name: 'Trim' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

// 1. The silence in the middle, found and cut.
await tools.getByRole('button', { name: 'Trim' }).click();
const remove = aside.getByRole('button', { name: /^Remove silences|^No silence found$/ });
console.log('silence button:', await remove.innerText());
await remove.click();
console.log('after removing silences:', await finalLength());

// 2. Speed 1.5×, pitch one octave up.
await tools.getByRole('button', { name: 'Speed' }).click();
await aside.getByRole('radio', { name: '1.5×' }).click();
const pitch = aside.getByRole('slider', { name: 'Pitch' });
await pitch.focus();
await page.keyboard.press('End');
console.log('speed and pitch:', await aside.getByRole('radio', { name: '1.5×' }).getAttribute('aria-checked'), await pitch.inputValue(), '| final length', await finalLength());

// 3. Podcast loudness, evened out by half.
await tools.getByRole('button', { name: 'Volume' }).click();
await aside.getByRole('radio', { name: /^Podcast/ }).click();
const even = aside.getByRole('slider', { name: 'Even out' });
await even.fill('50');
console.log('level:', await aside.getByRole('radio', { name: /^Podcast/ }).getAttribute('aria-checked'), '| even out', await even.inputValue());

// 4. The equalizer: 1 kHz dragged up, 80 Hz down twice by keyboard.
await tools.getByRole('button', { name: 'Sound', exact: true }).click();
const khz = aside.getByRole('slider', { name: '1 kHz' });
const box = (await khz.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y - 25, { steps: 5 });
await page.mouse.up();
await aside.getByRole('slider', { name: '80 Hz' }).focus();
await page.keyboard.press('PageDown');
await page.keyboard.press('PageDown');
console.log('eq: 1 kHz', await khz.getAttribute('aria-valuenow'), '| 80 Hz', await aside.getByRole('slider', { name: '80 Hz' }).getAttribute('aria-valuenow'));

// 5. Played a moment: nothing fails.
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await page.keyboard.press('Space');

// 6. Exported as WAV and read back.
await page.getByRole('navigation').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /WAV/ }).click();
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 120000 }),
	page.locator('aside + div').getByRole('button').first().click(),
]);
const { samples, rate } = readWav(readFileSync(await download.path()));
const seconds = samples.length / rate;
// Pitch by the zero crossings of the tone before the cut (the margins kept around it hold only
// dither); silence as the longest quiet run.
const middle = samples.subarray(Math.round(samples.length * 0.1), Math.round(samples.length * 0.4));
let crossings = 0;
for (let n = 1; n < middle.length; n++) if ((middle[n - 1] ?? 0) < 0 && (middle[n] ?? 0) >= 0) crossings += 1;
let quiet = 0;
let longest = 0;
for (const sample of samples) {
	quiet = Math.abs(sample) < 0.001 ? quiet + 1 : 0;
	longest = Math.max(longest, quiet);
}
console.log(
	`wav: ${seconds.toFixed(3)} s (expected ${((4 + 2 * 0.15) / 1.5).toFixed(3)}) | pitch ${Math.round((crossings * rate) / middle.length)} Hz (expected 880) | longest silence ${Math.round((longest / rate) * 1000)} ms`,
);

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
