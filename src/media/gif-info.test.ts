import { describe, expect, it } from 'vitest';
import { readGifInfo } from './gif-info';

/** A 2 × 1 GIF: a 4-colour global palette, a loop block, two frames of 50 and 5 hundredths. */
function gif(): Uint8Array {
	const frame = (delay: number, transparent: boolean, local: boolean) => [
		0x21,
		0xf9,
		4,
		transparent ? 1 : 0,
		delay & 0xff,
		delay >> 8,
		0,
		0,
		0x2c,
		0,
		0,
		0,
		0,
		2,
		0,
		1,
		0,
		local ? 0x80 : 0,
		...(local ? [0, 0, 0, 255, 255, 255] : []),
		2,
		2,
		0x44,
		0x01,
		0,
	];
	return new Uint8Array([
		...new TextEncoder().encode('GIF89a'),
		2,
		0,
		1,
		0,
		0x81,
		0,
		0,
		...Array.from({ length: 12 }, () => 0),
		0x21,
		0xff,
		11,
		...new TextEncoder().encode('NETSCAPE2.0'),
		3,
		1,
		0,
		0,
		0,
		...frame(50, false, false),
		...frame(1, true, true),
		0x3b,
	]);
}

describe('gif info', () => {
	it('reads palettes, loop, transparency and delays', () => {
		expect(readGifInfo(gif())).toEqual({
			width: 2,
			height: 1,
			globalColors: 4,
			localPalettes: 1,
			loops: 0,
			transparent: true,
			delays: [500, 10],
		});
		expect(readGifInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBeNull();
	});
});
