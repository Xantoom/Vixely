/** Messages between the page and the thumbnail worker. See `Thumbnails`. */

export type ThumbnailRequest =
	| { type: 'open'; file: File; height: number }
	/** Pictures wanted at these times; a newer request replaces an older one still running. */
	| { type: 'want'; generation: number; times: number[] };

export type ThumbnailMessage =
	/** The key frame each wanted time shows, in the order asked. */
	| { type: 'keys'; generation: number; times: number[]; keys: number[] }
	/** The picture of a key frame, sent once per key frame. */
	| { type: 'picture'; key: number; bitmap: ImageBitmap }
	| { type: 'failed' };
