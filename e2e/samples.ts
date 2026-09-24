/**
 * Creates the sample files the scenarios open, in e2e/samples/. Needs the dev server running.
 *
 * - anim.gif: 60 frames of a moving circle on a gradient, 480 × 270, 3 s, made by gifski itself.
 * - long.wav: three hours of mono 8 kHz audio whose loudness follows a slow wave (173 MB).
 * - photo.heic: the example photo of the libheif project.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

mkdirSync('samples', { recursive: true });
mkdirSync('shots', { recursive: true });

if (!existsSync('samples/anim.gif')) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto('http://localhost:5173/');
	const bytes: number[] = await page.evaluate(async () => {
		const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
		await gif.default();
		const [w, h, n] = [480, 270, 60];
		const canvas = new OffscreenCanvas(w, h);
		const g = canvas.getContext('2d', { willReadFrequently: true })!;
		const writer = new gif.GifWriter(90, 100, 0, false);
		for (let i = 0; i < n; i++) {
			const grad = g.createLinearGradient(0, 0, w, h);
			grad.addColorStop(0, `hsl(${i * 6} 80% 50%)`);
			grad.addColorStop(1, `hsl(${i * 6 + 120} 80% 60%)`);
			g.fillStyle = grad;
			g.fillRect(0, 0, w, h);
			g.fillStyle = '#fff';
			g.beginPath();
			g.arc(40 + i * 7, h / 2 + Math.sin(i / 5) * 60, 30, 0, Math.PI * 2);
			g.fill();
			writer.add_frame(new Uint8Array(g.getImageData(0, 0, w, h).data.buffer), w, h, i / 20);
		}
		return Array.from(writer.finish() as Uint8Array);
	});
	writeFileSync('samples/anim.gif', Buffer.from(bytes));
	await browser.close();
	console.log('samples/anim.gif');
}

if (!existsSync('samples/long.wav')) {
	const rate = 8000;
	const seconds = 3 * 3600;
	const frames = rate * seconds;
	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + frames * 2, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(rate, 24);
	header.writeUInt32LE(rate * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36);
	header.writeUInt32LE(frames * 2, 40);
	const file = Bun.file('samples/long.wav').writer();
	file.write(header);
	const block = new Int16Array(rate);
	for (let s = 0; s < seconds; s++) {
		const level = 0.1 + 0.8 * Math.abs(Math.sin((s / 600) * Math.PI));
		for (let i = 0; i < rate; i++) block[i] = Math.round(Math.sin(((i % 40) / 40) * 2 * Math.PI) * level * 32000);
		file.write(new Uint8Array(block.buffer.slice(0)));
	}
	await file.end();
	console.log('samples/long.wav');
}

if (!existsSync('samples/photo.heic')) {
	const response = await fetch('https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic');
	if (response.ok) {
		writeFileSync('samples/photo.heic', Buffer.from(await response.arrayBuffer()));
		console.log('samples/photo.heic');
	} else {
		console.log('photo.heic: download failed', response.status);
	}
}
