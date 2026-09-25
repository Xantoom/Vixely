import type { Kept } from '@/document/kept';
import { createImageDoc, type ImageDoc, isAdjusted } from '../image/document';

/**
 * The edits of a video. The source is never modified: the document says which part of it is kept
 * (trim and cuts, as in the audio editor) and how its pictures look (crop, rotation, mirrors and
 * adjustments, as in the image editor). Playback and export both read it.
 */
export interface VideoDoc extends Kept {
	/** The pictures' geometry and colour, in the video's displayed pixels. */
	picture: ImageDoc;
}

export function createVideoDoc(duration: number): VideoDoc {
	return { duration, trim: { start: 0, end: duration }, cuts: [], picture: createImageDoc() };
}

/** Whether the pictures differ from the source's: they must then be encoded again. */
export function isPictureEdited(picture: ImageDoc): boolean {
	return (
		picture.crop !== null || picture.rotation !== 0 || picture.flipX || picture.flipY || isAdjusted(picture.adjust)
	);
}
