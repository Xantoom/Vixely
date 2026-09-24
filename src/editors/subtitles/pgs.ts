/** PGS pictures for the preview, and `.sup` files for export, through vixely-subs. */
import { loadSubs } from '@/wasm/subs';
import { type Picture, shownCues, type SubtitleDoc } from './document';

/** Decoded pictures, kept while their line exists. */
const decoded = new WeakMap<Uint8Array, Promise<ImageBitmap | null>>();

/** The picture of a PGS line, ready to draw at its place in the video frame. */
export async function pictureBitmap(picture: Picture): Promise<ImageBitmap | null> {
	let bitmap = decoded.get(picture.set);
	if (!bitmap) {
		bitmap = loadSubs().then(async (subs) => {
			const image = subs.pgs_decode(picture.set);
			if (!image) return null;
			const pixels = new ImageData(new Uint8ClampedArray(image.pixels()), image.width, image.height);
			image.free();
			return createImageBitmap(pixels);
		});
		decoded.set(picture.set, bitmap);
	}
	return bitmap;
}

/** The document as a `.sup` file: each picture at its line's times, in time order. */
export async function writeSup(doc: SubtitleDoc): Promise<Uint8Array> {
	const subs = await loadSubs();
	const lines = shownCues(doc).filter((cue) => cue.picture);
	const offsets = [0];
	for (const cue of lines) offsets.push((offsets.at(-1) ?? 0) + (cue.picture?.set.length ?? 0));
	const data = new Uint8Array(offsets.at(-1) ?? 0);
	lines.forEach((cue, k) => {
		if (cue.picture) data.set(cue.picture.set, offsets[k]);
	});
	return subs.pgs_write(
		Float64Array.from(lines.map((cue) => cue.start)),
		Float64Array.from(lines.map((cue) => cue.end)),
		Uint32Array.from(offsets),
		data,
	);
}
