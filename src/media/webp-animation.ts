/**
 * Builds an animated WebP from still WebP images. A still WebP is a RIFF file whose chunks hold the
 * compressed picture (`VP8 ` lossy or `VP8L` lossless, plus `ALPH` for lossy transparency). An
 * animated one wraps those same chunks in `ANMF` frames, after a `VP8X` header and an `ANIM` chunk.
 * So each frame is compressed once, by whichever encoder is best at hand, then only rewrapped.
 */

/** Chunks of a still WebP that carry the picture. Metadata chunks are left out. */
const PICTURE_CHUNKS = new Set(['ALPH', 'VP8 ', 'VP8L']);

function fourcc(bytes: Uint8Array, at: number): string {
	return String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);
}

/** The picture chunks of a still WebP, headers included, ready to go inside an `ANMF` frame. */
export function pictureChunks(still: Uint8Array): Uint8Array {
	if (fourcc(still, 0) !== 'RIFF' || fourcc(still, 8) !== 'WEBP') throw new Error('Not a WebP image.');
	const view = new DataView(still.buffer, still.byteOffset, still.byteLength);
	const parts: Uint8Array[] = [];
	for (let at = 12; at + 8 <= still.length;) {
		const size = view.getUint32(at + 4, true);
		const end = at + 8 + size + (size % 2);
		if (PICTURE_CHUNKS.has(fourcc(still, at))) parts.push(still.subarray(at, Math.min(end, still.length)));
		at = end;
	}
	return concat(parts);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function uint24(view: DataView, at: number, value: number) {
	view.setUint8(at, value & 0xff);
	view.setUint8(at + 1, (value >> 8) & 0xff);
	view.setUint8(at + 2, (value >> 16) & 0xff);
}

function chunk(name: string, payload: Uint8Array): Uint8Array {
	const padded = payload.length % 2;
	const out = new Uint8Array(8 + payload.length + padded);
	for (let i = 0; i < 4; i++) out[i] = name.charCodeAt(i);
	new DataView(out.buffer).setUint32(4, payload.length, true);
	out.set(payload, 8);
	return out;
}

export interface WebpFrame {
	/** A still WebP of the whole canvas. */
	still: Uint8Array;
	/** How long it shows, in milliseconds. */
	duration: number;
}

/**
 * Assembles an animated WebP. `repeat` follows GIF: 0 loops forever, −1 plays once, n plays
 * n + 1 times. Frames replace the canvas entirely, so no blending or disposal is involved.
 */
export function assembleWebp(frames: readonly WebpFrame[], width: number, height: number, repeat: number): Uint8Array {
	const header = new Uint8Array(10);
	const headerView = new DataView(header.buffer);
	// Animation and alpha: frames may be transparent.
	headerView.setUint8(0, 0x02 | 0x10);
	uint24(headerView, 4, width - 1);
	uint24(headerView, 7, height - 1);

	const animation = new Uint8Array(6);
	const animationView = new DataView(animation.buffer);
	// Transparent background, then the loop count (0 is forever).
	animationView.setUint32(0, 0, true);
	animationView.setUint16(4, repeat === 0 ? 0 : repeat < 0 ? 1 : Math.min(65_535, repeat + 1), true);

	const parts = [chunk('VP8X', header), chunk('ANIM', animation)];
	for (const frame of frames) {
		const picture = pictureChunks(frame.still);
		const payload = new Uint8Array(16 + picture.length);
		const view = new DataView(payload.buffer);
		// Offset 0, 0; the whole canvas; no blending, so each frame fully replaces the last.
		uint24(view, 6, width - 1);
		uint24(view, 9, height - 1);
		uint24(view, 12, Math.max(1, Math.min(0xffffff, Math.round(frame.duration))));
		view.setUint8(15, 0x02);
		payload.set(picture, 16);
		parts.push(chunk('ANMF', payload));
	}
	const body = concat(parts);
	const file = new Uint8Array(12 + body.length);
	file.set([0x52, 0x49, 0x46, 0x46], 0);
	new DataView(file.buffer).setUint32(4, 4 + body.length, true);
	file.set([0x57, 0x45, 0x42, 0x50], 8);
	file.set(body, 12);
	return file;
}
