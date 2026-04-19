#!/usr/bin/env bun
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'public', 'brand');
const out = join(root, 'public');

type Job = { src: string; dest: string; width: number };

const jobs: Job[] = [
	{ src: 'apple-touch-icon.svg', dest: 'apple-touch-icon.png', width: 180 },
	{ src: 'icon-192.svg', dest: 'icon-192.png', width: 192 },
	{ src: 'icon-512.svg', dest: 'icon-512.png', width: 512 },
	{ src: 'icon-512-maskable.svg', dest: 'icon-512-maskable.png', width: 512 },
	{ src: 'og-image.svg', dest: 'og-image.png', width: 1200 },
	{ src: 'logo.svg', dest: 'favicon-16.png', width: 16 },
	{ src: 'logo.svg', dest: 'favicon-32.png', width: 32 },
	{ src: 'logo.svg', dest: 'favicon-48.png', width: 48 },
];

for (const job of jobs) {
	const svg = readFileSync(join(brand, job.src), 'utf8');
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: job.width },
		font: { loadSystemFonts: true, defaultFontFamily: 'DM Sans' },
	});
	const png = resvg.render().asPng();
	const target = join(out, job.dest);
	writeFileSync(target, png);
	console.log(`✓ ${job.dest} (${job.width}px) — ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('\nDone. Régénérer favicon.ico depuis favicon-{16,32,48}.png si nécessaire.');
