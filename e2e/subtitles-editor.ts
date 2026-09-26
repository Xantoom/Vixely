import { readFileSync } from 'node:fs';
/**
 * Subtitle editor, laid out like Aegisub: open a Windows-1252 SRT, drop a preview video with sound
 * on it, edit a line in the edit box, set its times on the audio box, go to the next line with
 * Enter, shift, sync on two points, export as ASS; then an ASS file exported as SRT.
 */
import { engine } from './engine';

const browser = await engine.launch();
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	locale: 'en-US',
	acceptDownloads: true,
});
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
await page.goto('http://localhost:5173/');

// 20 lines, two seconds apart, with accents in Windows-1252.
const srt = Array.from({ length: 20 }, (_, i) => {
	const t = (s: number) =>
		`00:00:${String(Math.floor(s)).padStart(2, '0')},${String(Math.round((s % 1) * 1000)).padStart(3, '0')}`;
	return `${i + 1}\r\n${t(2 + i * 2.5)} --> ${t(3.8 + i * 2.5)}\r\n${i === 0 ? 'Café, élève, <i>déjà</i>' : `Line ${i + 1}`}\r\n`;
}).join('\r\n');
const latin1 = Buffer.from(srt, 'latin1');
await page.setInputFiles('input[type=file]', { name: 'film.srt', mimeType: 'application/x-subrip', buffer: latin1 });
await page.waitForURL('**/subtitles');
await page.waitForSelector('[role=grid]', { timeout: 10000 });
const aside = page.locator('aside');
const grid = page.getByRole('grid');
console.log(
	'info:',
	(await aside.innerText()).replace(/\n/g, ' | ').slice(0, 90),
	'| read as',
	await aside.getByLabel('Read as').innerText(),
	'| first row:',
	(await grid.getByRole('row').nth(1).innerText()).replace(/\n/g, ' | '),
);

// A 60 s video with a tone at each line, made here.
const video = Buffer.from(
	await page.evaluate(async () => {
		const mb: any = await import('/node_modules/.vite/deps/mediabunny.js');
		const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
		const canvas = new OffscreenCanvas(640, 360);
		const g = canvas.getContext('2d')!;
		const frames = new mb.CanvasSource(canvas, { codec: 'vp8', bitrate: 800_000 });
		const sound = new mb.AudioBufferSource({ codec: 'opus', bitrate: 64_000 });
		output.addVideoTrack(frames, { frameRate: 10 });
		output.addAudioTrack(sound);
		await output.start();
		const rate = 48000;
		const seconds = 60;
		const audio = new AudioBuffer({ length: rate * seconds, numberOfChannels: 1, sampleRate: rate });
		const data = audio.getChannelData(0);
		for (let i = 0; i < 20; i++) {
			const from = Math.round((2 + i * 2.5) * rate);
			for (let k = 0; k < 1.8 * rate; k++) data[from + k] = Math.sin((k / rate) * 2 * Math.PI * 330) * 0.5;
		}
		await sound.add(audio);
		for (let f = 0; f < seconds * 10; f++) {
			g.fillStyle = `hsl(${f * 0.6} 50% 35%)`;
			g.fillRect(0, 0, 640, 360);
			g.fillStyle = '#fff';
			g.font = 'bold 90px sans-serif';
			g.fillText((f / 10).toFixed(1), 200, 200);
			await frames.add(f / 10, 1 / 10);
		}
		await output.finalize();
		return Array.from(new Uint8Array(output.target.buffer));
	}),
);
// Dropped from the file explorer onto the editor: it plays under the subtitles.
const transfer = await page.evaluateHandle((bytes) => {
	const data = new DataTransfer();
	data.items.add(new File([new Uint8Array(bytes)], 'clip.webm', { type: 'video/webm' }));
	return data;
}, Array.from(video));
await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
await page.waitForFunction(() => document.querySelector('aside')?.textContent?.includes('640 × 360'), null, {
	timeout: 15000,
});
await page.waitForTimeout(1500);
console.log('with video:', await page.getByLabel('Audio track').innerText(), '| url', page.url());

// Play for a moment: the playhead moves and the preview shows line 1 at 2.5 s.
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForTimeout(2800);
await page.getByRole('button', { name: 'Pause', exact: true }).click();
console.log('after playing:', await page.getByLabel('Playhead', { exact: true }).inputValue());
await page.screenshot({ path: 'shots/subs-playing.png' });

// Line 2 picked on the grid, retyped in the edit box; Enter goes to line 3.
await grid.getByRole('row').nth(2).click();
await page.getByLabel('Text', { exact: true }).fill('Edited <b>second</b> line');
await page.getByLabel('Text', { exact: true }).press('Enter');
console.log('after Enter, editing', await page.getByTitle('Line number').innerText());

// Line 3's start set by clicking on the audio box, its end with a right click.
const audio = page.getByRole('application', { name: 'Sound of the line' });
const area = await audio.boundingBox();
if (area) {
	await page.mouse.click(area.x + area.width * 0.3, area.y + area.height / 2, { modifiers: ['Alt'] });
	await page.mouse.click(area.x + area.width * 0.6, area.y + area.height / 2, {
		button: 'right',
		modifiers: ['Alt'],
	});
}
console.log(
	'line 3 times:',
	await page.getByLabel('Start', { exact: true }).inputValue(),
	await page.getByLabel('End', { exact: true }).inputValue(),
);
console.log(
	'grid:',
	(await grid.getByRole('row').nth(2).innerText()).replace(/\n/g, ' | '),
	'/',
	(await grid.getByRole('row').nth(3).innerText()).replace(/\n/g, ' | '),
);
await page.screenshot({ path: 'shots/subs-lines.png' });

// Timing: shift everything 1.5 s later, then sync.
await page.locator('nav[aria-label="Editing tools"]').getByRole('button', { name: 'Timing' }).click();
await aside.getByLabel('Shift by').fill('1.5');
await aside.getByLabel('Shift by').press('Enter');
await aside.getByRole('button', { name: /^Shift \+1\.500 s/ }).click();
const fields = aside.getByLabel('Should start at');
await fields.nth(1).fill('55');
await fields.nth(1).press('Enter');
console.log('sync:', (await aside.innerText()).match(/Speed ×[^\n]*/)?.[0]);
await aside.getByRole('button', { name: 'Sync the lines' }).click();
await page.screenshot({ path: 'shots/subs-timing.png' });

// Export as ASS.
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /^ASS/ }).click();
const [download] = await Promise.all([
	page.waitForEvent('download'),
	page.locator('aside + div').getByRole('button').first().click(),
]);
const ass = readFileSync(await download.path(), 'utf8');
console.log('exported', download.suggestedFilename(), ass.length, 'chars');
console.log(
	ass
		.split('\r\n')
		.filter((line) => line.startsWith('Dialogue'))
		.slice(0, 3)
		.join('\n'),
);
console.log(
	'last:',
	ass
		.split('\r\n')
		.filter((line) => line.startsWith('Dialogue'))
		.at(-1),
);

// An ASS file with a drawing and a comment, exported as SRT.
const script = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1\nStyle: Top,Arial,40,&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\i1}Hello{\\i0}\\Nworld\nDialogue: 0,0:00:01.00,0:00:04.00,Top,,0,0,0,,A sign at the top\nComment: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,note\nDialogue: 1,0:00:05.00,0:00:06.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}\n`;
await page.goto('http://localhost:5173/');
await page.setInputFiles('input[type=file]', {
	name: 'styled.ass',
	mimeType: 'text/x-ssa',
	buffer: Buffer.from(script),
});
await page.waitForURL('**/subtitles');
await page.waitForSelector('[role=grid]', { timeout: 10000 });
await page.getByRole('grid').getByRole('row').nth(1).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/subs-ass.png' });
console.log('ass info:', (await aside.innerText()).replace(/\n/g, ' | ').slice(0, 200));
await page.getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /^SRT/ }).click();
console.log('ass → srt panel:', (await aside.innerText()).replace(/\n/g, ' | ').slice(0, 500));
const [second] = await Promise.all([
	page.waitForEvent('download'),
	page.locator('aside + div').getByRole('button').first().click(),
]);
console.log('srt:', JSON.stringify(readFileSync(await second.path(), 'utf8')));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
