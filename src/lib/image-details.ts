/**
 * What an image file says about itself in its headers, without decoding its pixels: bit depth,
 * transparency, colour profile, and for a JPEG its layout and the quality it was saved at.
 */
export interface ImageDetails {
	/** Bits per channel. */
	bitDepth: number | null;
	/** Whether the file can hold transparent pixels. */
	alpha: boolean | null;
	/** Name of the embedded colour profile, `sRGB` when declared without one. */
	profile: string | null;
	/** Drawn in passes, coarse to fine (JPEG progressive, PNG interlaced). */
	progressive: boolean | null;
	/** JPEG colour sampling: `4:4:4`, `4:2:2`, `4:2:0`. */
	chroma: string | null;
	/** JPEG quality estimated from its quantisation table, 1 to 100. */
	quality: number | null;
	/** WebP: whether it is lossless. */
	lossless: boolean | null;
}

const EMPTY: ImageDetails = {
	bitDepth: null,
	alpha: null,
	profile: null,
	progressive: null,
	chroma: null,
	quality: null,
	lossless: null,
};

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

/** The description of an ICC profile: its `desc` tag, version 2 or 4. */
export function iccName(icc: Uint8Array): string | null {
	if (icc.length < 132) return null;
	const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
	const count = view.getUint32(128);
	for (let i = 0; i < count && 132 + i * 12 + 12 <= icc.length; i++) {
		const entry = 132 + i * 12;
		if (ascii(icc, entry, 4) !== 'desc') continue;
		const offset = view.getUint32(entry + 4);
		if (offset + 12 > icc.length) return null;
		const type = ascii(icc, offset, 4);
		if (type === 'desc') {
			const length = view.getUint32(offset + 8);
			const text = ascii(icc, offset + 12, Math.max(0, Math.min(length, icc.length - offset - 12)));
			return text.replace(/\0+$/, '').trim() || null;
		}
		if (type === 'mluc' && offset + 28 <= icc.length) {
			const length = view.getUint32(offset + 20);
			const start = offset + view.getUint32(offset + 24);
			let text = '';
			for (let at = start; at + 1 < Math.min(start + length, icc.length); at += 2) {
				text += String.fromCharCode(view.getUint16(at));
			}
			return text.replace(/\0+$/, '').trim() || null;
		}
		return null;
	}
	return null;
}

/** libjpeg's luminance table at quality 50, which each quality scales. */
const LUMINANCE = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
	87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
	72, 92, 95, 98, 112, 100, 103, 99,
];

/** The libjpeg quality whose luminance table comes nearest the one found, by their sums. */
export function estimateJpegQuality(table: readonly number[]): number {
	const sum = table.reduce((total, value) => total + value, 0);
	let best = 1;
	let bestGap = Infinity;
	for (let quality = 1; quality <= 100; quality++) {
		const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
		const scaled = LUMINANCE.reduce(
			(total, value) => total + Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))),
			0,
		);
		const gap = Math.abs(scaled - sum);
		if (gap < bestGap) {
			bestGap = gap;
			best = quality;
		}
	}
	return best;
}

function jpeg(bytes: Uint8Array): ImageDetails {
	const details = { ...EMPTY, alpha: false };
	const icc: Uint8Array[] = [];
	let at = 2;
	while (at + 4 <= bytes.length && bytes[at] === 0xff) {
		const marker = bytes[at + 1] ?? 0;
		if (marker === 0xd9 || marker === 0xda) break;
		const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
		const body = at + 4;
		if (marker === 0xdb && details.quality === null) {
			// The first table is the luminance's; 16-bit tables are rare and left unread.
			const precision = (bytes[body] ?? 0) >> 4;
			if (precision === 0) details.quality = estimateJpegQuality([...bytes.subarray(body + 1, body + 65)]);
		} else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			details.bitDepth = bytes[body] ?? null;
			details.progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce;
			const components = bytes[body + 5] ?? 0;
			if (components === 3) {
				const sampling = bytes[body + 7] ?? 0x11;
				const h = sampling >> 4;
				const v = sampling & 15;
				details.chroma =
					h === 2 && v === 2
						? '4:2:0'
						: h === 2 && v === 1
							? '4:2:2'
							: h === 1 && v === 1
								? '4:4:4'
								: `${h}×${v}`;
			} else if (components === 1) {
				details.chroma = null;
			}
		} else if (marker === 0xe2 && ascii(bytes, body, 11) === 'ICC_PROFILE') {
			icc.push(bytes.subarray(body + 14, at + 2 + length));
		}
		at += 2 + length;
	}
	if (icc.length > 0) {
		const whole = new Uint8Array(icc.reduce((total, part) => total + part.length, 0));
		let offset = 0;
		for (const part of icc) {
			whole.set(part, offset);
			offset += part.length;
		}
		details.profile = iccName(whole);
	}
	return details;
}

function png(bytes: Uint8Array): ImageDetails {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const details = { ...EMPTY };
	let at = 8;
	while (at + 12 <= bytes.length) {
		const length = view.getUint32(at);
		const type = ascii(bytes, at + 4, 4);
		const body = at + 8;
		if (type === 'IHDR') {
			details.bitDepth = bytes[body + 8] ?? null;
			const colour = bytes[body + 9] ?? 0;
			details.alpha = colour === 4 || colour === 6;
			details.progressive = bytes[body + 12] === 1;
		} else if (type === 'tRNS') {
			details.alpha = true;
		} else if (type === 'iCCP') {
			const end = bytes.indexOf(0, body);
			if (end > body) details.profile = ascii(bytes, body, end - body);
		} else if (type === 'sRGB' && details.profile === null) {
			details.profile = 'sRGB';
		} else if (type === 'IDAT' || type === 'IEND') {
			break;
		}
		at = body + length + 4;
	}
	return details;
}

function webp(bytes: Uint8Array): ImageDetails {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const details = { ...EMPTY, bitDepth: 8 };
	let at = 12;
	while (at + 8 <= bytes.length) {
		const type = ascii(bytes, at, 4);
		const length = view.getUint32(at + 4, true);
		const body = at + 8;
		if (type === 'VP8X') {
			details.alpha = ((bytes[body] ?? 0) & 0x10) !== 0;
		} else if (type === 'ICCP') {
			details.profile = iccName(bytes.subarray(body, body + length));
		} else if (type === 'VP8L') {
			details.lossless = true;
			// Lossless pictures say themselves whether they use their alpha.
			if (details.alpha === null) details.alpha = (((bytes[body + 4] ?? 0) >> 4) & 1) === 1;
		} else if (type === 'VP8 ') {
			details.lossless = false;
			details.alpha ??= false;
		} else if (type === 'ALPH') {
			details.alpha = true;
		}
		at = body + length + (length % 2);
	}
	return details;
}

export function readImageDetails(bytes: Uint8Array): ImageDetails {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
	if (ascii(bytes, 1, 3) === 'PNG') return png(bytes);
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webp(bytes);
	return EMPTY;
}
