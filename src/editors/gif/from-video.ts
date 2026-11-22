import { keptRanges } from '@/document/kept';
import type { VideoDoc } from '../video/document';
import { fadeOf, speedOf } from '../video/document';
import type { GifDoc } from './document';

/** The edits of a video waiting for the GIF editor to open it, with the file they belong to. */
let pending: { file: File; edits: Partial<GifDoc> } | null = null;

/**
 * What a GIF made from a video keeps of its edits: the passage (the longest one kept, a GIF has
 * no cuts), the speed, the fades, and the crop, turns, colours, text and stickers.
 */
export function carryVideoEdits(file: File, doc: VideoDoc) {
	const passage = keptRanges(doc).reduce<{ start: number; end: number } | null>(
		(longest, range) => (!longest || range.end - range.start > longest.end - longest.start ? range : longest),
		null,
	);
	const fade = fadeOf(doc);
	pending = {
		file,
		edits: {
			trim: passage ?? doc.trim,
			speed: speedOf(doc),
			picture: doc.picture,
			...(fade.in > 0 || fade.out > 0 ? { fade: { in: fade.in, out: fade.out, color: 'black' } } : {}),
		},
	};
}

/** The edits carried for this file, once: opening it again starts afresh. */
export function takeVideoEdits(file: File): Partial<GifDoc> | null {
	const edits = pending?.file === file ? pending.edits : null;
	pending = null;
	return edits;
}
