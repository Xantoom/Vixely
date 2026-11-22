import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { encodeBmp, encodeTiff, jpegQuality, packIco } from './image-formats';

/** A 2 × 2 picture: red, green, blue, and half-transparent white. */
const pixels = (alpha = 255) => new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, alpha]);

/** The IJG luminance table scaled to `quality`, as libjpeg writes it. */
function dqt(quality: number): Uint8Array {
	const base = [
		16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29,
		51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121,
		120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
	];
	const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
	const table = base.map((value) => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))));
	return new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 67, 0, ...table, 0xff, 0xda, 0, 2]);
}

describe('image formats', () => {
	it('reads the quality a JPEG was saved at', () => {
		for (const quality of [30, 50, 75, 85, 90, 95]) expect(jpegQuality(dqt(quality))).toBeCloseTo(quality, -0.5);
		expect(jpegQuality(new Uint8Array([0x89, 0x50]))).toBeNull();
	});

	it('writes 24-bit BMPs for opaque pictures, bottom row first', () => {
		const bmp = encodeBmp(pixels(), 2, 2);
		const view = new DataView(bmp.buffer);
		expect(String.fromCharCode(bmp[0]!, bmp[1]!)).toBe('BM');
		expect(view.getUint16(28, true)).toBe(24);
		expect(view.getUint32(2, true)).toBe(bmp.length);
		// Rows padded to 4 bytes: 2 pixels × 3 bytes → 8. The bottom row (blue, white) comes first.
		expect(Array.from(bmp.slice(54, 60))).toEqual([255, 0, 0, 255, 255, 255]);
	});

	it('writes 32-bit BMPs with an alpha mask when transparent', () => {
		const bmp = encodeBmp(pixels(128), 2, 2);
		const view = new DataView(bmp.buffer);
		expect(view.getUint16(28, true)).toBe(32);
		expect(view.getUint32(66, true)).toBe(0xff000000);
	});

	it('writes TIFFs whose strip decompresses back to the picture', () => {
		const tiff = encodeTiff(pixels(128), 2, 2);
		const view = new DataView(tiff.buffer);
		expect(Array.from(tiff.slice(0, 4))).toEqual([0x49, 0x49, 42, 0]);
		const entries = view.getUint16(8, true);
		const tags = new Map<number, number>();
		for (let i = 0; i < entries; i++) {
			const at = 10 + i * 12;
			const type = view.getUint16(at + 2, true);
			tags.set(
				view.getUint16(at, true),
				type === 3 ? view.getUint16(at + 8, true) : view.getUint32(at + 8, true),
			);
		}
		expect(tags.get(277)).toBe(4);
		const strip = unzlibSync(tiff.slice(tags.get(273), (tags.get(273) ?? 0) + (tags.get(279) ?? 0)));
		// Undo the horizontal prediction row by row.
		for (let row = 0; row < 2; row++)
			for (let i = 4; i < 8; i++) strip[row * 8 + i] = (strip[row * 8 + i]! + strip[row * 8 + i - 4]!) & 0xff;
		expect([...strip]).toEqual([...pixels(128)]);
	});

	it('packs icons with 256 written as 0', () => {
		const ico = packIco([
			{ size: 16, png: new Uint8Array([1, 2]) },
			{ size: 256, png: new Uint8Array([3]) },
		]);
		const view = new DataView(ico.buffer);
		expect(view.getUint16(4, true)).toBe(2);
		expect(ico[6]).toBe(16);
		expect(ico[22]).toBe(0);
		expect(view.getUint32(22 + 12, true)).toBe(6 + 32 + 2);
		expect(Array.from(ico.slice(-3))).toEqual([1, 2, 3]);
	});
});
