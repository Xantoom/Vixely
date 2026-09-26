/**
 * What a GIF file says about itself, read from its blocks without decoding a pixel: its palettes,
 * how many times it loops, whether it uses transparency, and each frame's delay as written.
 */
export interface GifInfo {
	width: number;
	height: number;
	/** Colours in the global palette; 0 when there is none. */
	globalColors: number;
	/** Frames that bring their own palette. */
	localPalettes: number;
	/** 0 loops forever; n plays n more times; null has no loop block (plays once). */
	loops: number | null;
	transparent: boolean;
	/** Each frame's delay in milliseconds, as written (0 is shown slower by browsers). */
	delays: number[];
}

export function readGifInfo(bytes: Uint8Array): GifInfo | null {
	const ascii = String.fromCharCode(...bytes.subarray(0, 6));
	if (ascii !== 'GIF87a' && ascii !== 'GIF89a') return null;
	const byte = (at: number) => bytes[at] ?? 0;
	const word = (at: number) => byte(at) | (byte(at + 1) << 8);
	const info: GifInfo = {
		width: word(6),
		height: word(8),
		globalColors: 0,
		localPalettes: 0,
		loops: null,
		transparent: false,
		delays: [],
	};
	const packed = byte(10);
	let at = 13;
	if (packed & 0x80) {
		info.globalColors = 2 << (packed & 0x07);
		at += info.globalColors * 3;
	}
	let delay = 0;
	/** Skips data sub-blocks, returning the position after them. */
	const skipBlocks = (from: number) => {
		let position = from;
		while (position < bytes.length && byte(position) !== 0) position += byte(position) + 1;
		return position + 1;
	};
	while (at < bytes.length) {
		const kind = byte(at);
		if (kind === 0x3b) break;
		if (kind === 0x21) {
			const label = byte(at + 1);
			if (label === 0xf9) {
				// Graphic control: the next frame's delay (hundredths) and transparency.
				delay = word(at + 4) * 10;
				if (byte(at + 3) & 0x01) info.transparent = true;
			} else if (label === 0xff && byte(at + 2) === 11) {
				const name = String.fromCharCode(...bytes.subarray(at + 3, at + 14));
				if ((name === 'NETSCAPE2.0' || name === 'ANIMEXTS1.0') && byte(at + 15) === 1)
					info.loops = word(at + 16);
			}
			at = skipBlocks(at + 2);
		} else if (kind === 0x2c) {
			const local = byte(at + 9);
			at += 10;
			if (local & 0x80) {
				info.localPalettes += 1;
				at += (2 << (local & 0x07)) * 3;
			}
			// Minimum code size, then the image data.
			at = skipBlocks(at + 1);
			info.delays.push(delay);
			delay = 0;
		} else break;
	}
	return info;
}
