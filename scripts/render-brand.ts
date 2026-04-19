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

const rendered = new Map<string, Buffer>();

for (const job of jobs) {
	const svg = readFileSync(join(brand, job.src), 'utf8');
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: job.width },
		font: { loadSystemFonts: true, defaultFontFamily: 'DM Sans' },
	});
	const png = resvg.render().asPng();
	const target = join(out, job.dest);
	writeFileSync(target, png);
	rendered.set(job.dest, Buffer.from(png));
	console.log(`✓ ${job.dest} (${job.width}px) — ${(png.length / 1024).toFixed(1)} KB`);
}

function buildIco(pngs: { size: number; data: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(pngs.length, 4);

	const entries: Buffer[] = [];
	const images: Buffer[] = [];
	let offset = 6 + pngs.length * 16;

	for (const { size, data } of pngs) {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size >= 256 ? 0 : size, 0);
		entry.writeUInt8(size >= 256 ? 0 : size, 1);
		entry.writeUInt8(0, 2);
		entry.writeUInt8(0, 3);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(data.length, 8);
		entry.writeUInt32LE(offset, 12);
		entries.push(entry);
		images.push(data);
		offset += data.length;
	}

	return Buffer.concat([header, ...entries, ...images]);
}

const icoSources: { size: number; file: string }[] = [
	{ size: 16, file: 'favicon-16.png' },
	{ size: 32, file: 'favicon-32.png' },
	{ size: 48, file: 'favicon-48.png' },
];
const icoPngs = icoSources.map(({ size, file }) => ({
	size,
	data: rendered.get(file) ?? readFileSync(join(out, file)),
}));
const ico = buildIco(icoPngs);
const icoTarget = join(out, 'favicon.ico');
writeFileSync(icoTarget, ico);
console.log(`✓ favicon.ico (16,32,48) — ${(ico.length / 1024).toFixed(1)} KB`);

console.log('\nDone.');
