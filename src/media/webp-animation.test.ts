import { describe, expect, it } from 'vitest';
import { assembleWebp, pictureChunks } from './webp-animation';

/** A still WebP with a VP8X header, an ALPH chunk, an odd-sized VP8 chunk and an EXIF chunk. */
function still(): Uint8Array {
	const chunks = [
		['VP8X', [0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]],
		['ALPH', [1, 2, 3, 4]],
		['VP8 ', [9, 8, 7]],
		['EXIF', [5, 5]],
	] as const;
	const bytes: number[] = [];
	for (const [name, payload] of chunks) {
		bytes.push(...Array.from({ length: 4 }, (_, i) => name.charCodeAt(i)), payload.length, 0, 0, 0, ...payload);
		if (payload.length % 2) bytes.push(0);
	}
	const size = 4 + bytes.length;
	return Uint8Array.from([0x52, 0x49, 0x46, 0x46, size & 0xff, size >> 8, 0, 0, 0x57, 0x45, 0x42, 0x50, ...bytes]);
}

function text(bytes: Uint8Array, at: number): string {
	return String.fromCharCode(...bytes.subarray(at, at + 4));
}

describe('animated WebP', () => {
	it('keeps the picture chunks of a still and drops the rest', () => {
		const picture = pictureChunks(still());
		expect(text(picture, 0)).toBe('ALPH');
		expect(text(picture, 12)).toBe('VP8 ');
		// ALPH (8 + 4) and VP8 (8 + 3 + 1 padding byte).
		expect(picture.length).toBe(24);
	});

	it('wraps frames in a valid RIFF container', () => {
		const file = assembleWebp(
			[
				{ still: still(), duration: 100 },
				{ still: still(), duration: 250 },
			],
			2,
			2,
			0,
		);
		const view = new DataView(file.buffer);
		expect(text(file, 0)).toBe('RIFF');
		expect(view.getUint32(4, true)).toBe(file.length - 8);
		expect(text(file, 12)).toBe('VP8X');
		expect(file[20]).toBe(0x12);
		expect(text(file, 30)).toBe('ANIM');
		expect(text(file, 44)).toBe('ANMF');
		// Second frame: its duration sits 12 bytes into its payload.
		const second = 44 + 8 + view.getUint32(48, true);
		expect(text(file, second)).toBe('ANMF');
		expect((file[second + 8 + 12] ?? 0) + ((file[second + 8 + 13] ?? 0) << 8)).toBe(250);
	});
});
