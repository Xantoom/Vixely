import type { Rotation } from 'mediabunny';
import type { Kept } from '@/document/kept';
import { createImageDoc, type ImageDoc, isAdjusted } from '../image/document';

/** A picture embedded in the file, as players and file browsers show it. */
export interface CoverImage {
	data: Uint8Array;
	mimeType: string;
}

/** What the file says about itself, as edited. */
export interface VideoMeta {
	title: string;
	artist: string;
	comment: string;
	/** `YYYY-MM-DD`, or empty. */
	date: string;
	cover: CoverImage | null;
}

/**
 * The edits of a video. The source is never modified: the document says which part of it is kept
 * (trim and cuts, as in the audio editor), how its pictures look (crop, rotation, mirrors,
 * adjustments, text and stickers, as in the image editor) and what the file says about itself.
 * Playback and export both read it.
 */
export interface VideoDoc extends Kept {
	/** The pictures' geometry and colour, in the video's displayed pixels. */
	picture: ImageDoc;
	/** The title, artist, date and cover as edited; null keeps the file's. */
	meta: VideoMeta | null;
}

export function createVideoDoc(duration: number): VideoDoc {
	return { duration, trim: { start: 0, end: duration }, cuts: [], picture: createImageDoc(), meta: null };
}

/**
 * How the pictures differ from the source's. Turned or mirrored only, they are copied as they are
 * and the file says how to show them; anything else draws them again, so they must be encoded.
 */
export function pictureChange(picture: ImageDoc): 'none' | 'turn' | 'drawn' {
	if (picture.crop !== null || isAdjusted(picture.adjust) || picture.overlays.length > 0) return 'drawn';
	return picture.rotation !== 0 || picture.flipX || picture.flipY ? 'turn' : 'none';
}

/** How players show the pictures: turned clockwise, then mirrored left to right. */
export interface Turn {
	rotation: Rotation;
	flip: boolean;
}

/** The turn as a 2 × 2 matrix, in screen coordinates (y down): [a, b, c, d] maps (x, y) to (ax + by, cx + dy). */
function matrixOf({ rotation, flip }: Turn): [number, number, number, number] {
	const turns = rotation / 90;
	let matrix: [number, number, number, number] = [1, 0, 0, 1];
	for (let step = 0; step < turns; step += 1) {
		// A quarter turn clockwise on screen: (x, y) → (−y, x).
		const [a, b, c, d] = matrix;
		matrix = [-c, -d, a, b];
	}
	if (flip) matrix = [-matrix[0], -matrix[1], matrix[2], matrix[3]];
	return matrix;
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

const TURNS: Turn[] = ROTATIONS.flatMap((rotation) => [
	{ rotation, flip: false },
	{ rotation, flip: true },
]);

/** The turn of the edits alone: a vertical mirror is a half turn and a horizontal mirror. */
export function editTurn(picture: ImageDoc): Turn {
	const rotation = ROTATIONS[(picture.rotation / 90 + (picture.flipY ? 2 : 0)) % 4] ?? 0;
	return { rotation, flip: picture.flipX !== picture.flipY };
}

/** The turn written in the file: the source's own, then the edits'. */
export function composeTurn(source: Turn, edit: Turn): Turn {
	const [a, b, c, d] = matrixOf(source);
	const [e, f, g, h] = matrixOf(edit);
	const product = [e * a + f * c, e * b + f * d, g * a + h * c, g * b + h * d];
	return (
		TURNS.find((turn) => matrixOf(turn).every((value, index) => value === product[index])) ?? {
			rotation: 0,
			flip: false,
		}
	);
}
