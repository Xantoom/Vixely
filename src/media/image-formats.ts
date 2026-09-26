/**
 * Image files simple enough to write here: BMP, TIFF (Deflate-compressed) and ICO, which holds
 * PNG pictures made by the codec worker. Plus reading the quality a JPEG was saved at.
 */
import { zlibSync } from 'fflate';

function opaque(rgba: Uint8Array): boolean {
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false;
	return true;
}

/**
 * A Windows bitmap: 24 bits per pixel when the picture is opaque, as every program reads; with
 * transparency, 32 bits and a V4 header naming the alpha channel.
 */
export function encodeBmp(rgba: Uint8Array, width: number, height: number): Uint8Array {
	const alpha = !opaque(rgba);
	const bytesPerPixel = alpha ? 4 : 3;
	const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
	const header = alpha ? 108 : 40;
	const offset = 14 + header;
	const size = offset + stride * height;
	const out = new Uint8Array(size);
	const view = new DataView(out.buffer);
	out[0] = 0x42;
	out[1] = 0x4d;
	view.setUint32(2, size, true);
	view.setUint32(10, offset, true);
	view.setUint32(14, header, true);
	view.setInt32(18, width, true);
	// Positive height: rows from the bottom, the common layout.
	view.setInt32(22, height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, bytesPerPixel * 8, true);
	// BI_BITFIELDS with alpha, so readers know where each channel is; BI_RGB otherwise.
	view.setUint32(30, alpha ? 3 : 0, true);
	view.setUint32(34, stride * height, true);
	// 72 dpi.
	view.setInt32(38, 2835, true);
	view.setInt32(42, 2835, true);
	if (alpha) {
		view.setUint32(54, 0x00ff0000, true);
		view.setUint32(58, 0x0000ff00, true);
		view.setUint32(62, 0x000000ff, true);
		view.setUint32(66, 0xff000000, true);
		// LCS_sRGB.
		view.setUint32(70, 0x73524742, true);
	}
	for (let y = 0; y < height; y++) {
		const row = offset + (height - 1 - y) * stride;
		for (let x = 0; x < width; x++) {
			const from = (y * width + x) * 4;
			const to = row + x * bytesPerPixel;
			out[to] = rgba[from + 2] ?? 0;
			out[to + 1] = rgba[from + 1] ?? 0;
			out[to + 2] = rgba[from] ?? 0;
			if (alpha) out[to + 3] = rgba[from + 3] ?? 0;
		}
	}
	return out;
}

/**
 * A baseline TIFF: RGB or RGBA, one strip, Deflate with horizontal prediction. Lossless, and
 * read by every image program.
 */
export function encodeTiff(rgba: Uint8Array, width: number, height: number): Uint8Array {
	const channels = opaque(rgba) ? 3 : 4;
	const stride = width * channels;
	// Horizontal differencing makes smooth pictures compress far better.
	const raw = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			for (let c = 0; c < channels; c++) {
				const value = rgba[(y * width + x) * 4 + c] ?? 0;
				const left = x > 0 ? (rgba[(y * width + x - 1) * 4 + c] ?? 0) : 0;
				raw[y * stride + x * channels + c] = (value - left) & 0xff;
			}
		}
	}
	const data = zlibSync(raw, { level: 6 });

	type Entry = [tag: number, type: 3 | 4, values: number[]];
	const entries: Entry[] = [
		[256, 4, [width]],
		[257, 4, [height]],
		[258, 3, Array.from({ length: channels }, () => 8)],
		// Adobe Deflate.
		[259, 3, [8]],
		// RGB.
		[262, 3, [2]],
		[273, 4, [0]],
		[277, 3, [channels]],
		[278, 4, [height]],
		[279, 4, [data.length]],
		// Contiguous channels.
		[284, 3, [1]],
		// Horizontal predictor.
		[317, 3, [2]],
		// Unassociated alpha.
		...(channels === 4 ? [[338, 3, [2]] satisfies Entry] : []),
	];
	const ifdOffset = 8;
	const ifdSize = 2 + entries.length * 12 + 4;
	// Values longer than 4 bytes live after the directory.
	let extra = ifdOffset + ifdSize;
	const extraAt = new Map<number, number>();
	for (const [tag, type, values] of entries) {
		const bytes = values.length * (type === 3 ? 2 : 4);
		if (bytes > 4) {
			extraAt.set(tag, extra);
			extra += bytes;
		}
	}
	const dataOffset = extra;
	const out = new Uint8Array(dataOffset + data.length);
	const view = new DataView(out.buffer);
	out.set([0x49, 0x49, 42, 0]);
	view.setUint32(4, ifdOffset, true);
	view.setUint16(ifdOffset, entries.length, true);
	entries.forEach(([tag, type, values], index) => {
		const at = ifdOffset + 2 + index * 12;
		const resolved = tag === 273 ? [dataOffset] : values;
		view.setUint16(at, tag, true);
		view.setUint16(at + 2, type, true);
		view.setUint32(at + 4, resolved.length, true);
		const target = extraAt.get(tag) ?? at + 8;
		if (extraAt.has(tag)) view.setUint32(at + 8, target, true);
		resolved.forEach((value, i) => {
			if (type === 3) view.setUint16(target + i * 2, value, true);
			else view.setUint32(target + i * 4, value, true);
		});
	});
	view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true);
	out.set(data, dataOffset);
	return out;
}

/** Sizes an icon holds, those up to the picture's own. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** A Windows icon holding one PNG per size, smallest first. */
export function packIco(pictures: { size: number; png: Uint8Array }[]): Uint8Array {
	const header = 6 + pictures.length * 16;
	const out = new Uint8Array(header + pictures.reduce((sum, picture) => sum + picture.png.length, 0));
	const view = new DataView(out.buffer);
	view.setUint16(2, 1, true);
	view.setUint16(4, pictures.length, true);
	let offset = header;
	pictures.forEach(({ size, png }, index) => {
		const at = 6 + index * 16;
		// 0 means 256.
		out[at] = size >= 256 ? 0 : size;
		out[at + 1] = size >= 256 ? 0 : size;
		view.setUint16(at + 4, 1, true);
		view.setUint16(at + 6, 32, true);
		view.setUint32(at + 8, png.length, true);
		view.setUint32(at + 12, offset, true);
		out.set(png, offset);
		offset += png.length;
	});
	return out;
}

/** The IJG luminance table at quality 50, which libjpeg and most cameras' tables scale from. */
const IJG_LUMINANCE = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
	87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
	72, 92, 95, 98, 112, 100, 103, 99,
];
const IJG_SUM = IJG_LUMINANCE.reduce((sum, value) => sum + value);

/**
 * The quality a JPEG was saved at, 1 to 100, read from its luminance quantisation table. Null
 * when the file has none (not a JPEG, or damaged).
 */
export function jpegQuality(bytes: Uint8Array): number | null {
	let at = 2;
	while (at + 4 <= bytes.length && bytes[at] === 0xff) {
		const marker = bytes[at + 1] ?? 0;
		const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
		// Start of scan: the tables come before.
		if (marker === 0xda) break;
		if (marker === 0xdb) {
			let table = at + 4;
			while (table < at + 2 + length) {
				const precision = (bytes[table] ?? 0) >> 4;
				const id = (bytes[table] ?? 0) & 0x0f;
				const size = precision ? 128 : 64;
				if (id === 0) {
					let sum = 0;
					for (let i = 0; i < 64; i++) {
						sum += precision
							? ((bytes[table + 1 + i * 2] ?? 0) << 8) | (bytes[table + 2 + i * 2] ?? 0)
							: (bytes[table + 1 + i] ?? 0);
					}
					const scale = (sum * 100) / IJG_SUM;
					const quality = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
					return Math.round(Math.min(100, Math.max(1, quality)));
				}
				table += 1 + size;
			}
		}
		at += 2 + length;
	}
	return null;
}
