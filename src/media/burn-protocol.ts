/** Messages between the export and the worker that draws text subtitles with libass. */
export type BurnRequest =
	| {
			type: 'open';
			/** A complete ASS script. */
			script: string;
			/** Font files, or URLs of font files. */
			fonts: (Uint8Array | string)[];
			wasmUrl: string;
			/** Size the subtitles are drawn at: the whole picture they lie on. */
			width: number;
			height: number;
	  }
	| { type: 'render'; id: number; /** Seconds. */ time: number };

export type BurnResponse =
	| { type: 'opened' }
	| { type: 'failed'; message: string }
	/** `bitmap` null when no subtitle shows; `same` when nothing changed since the last picture. */
	| { type: 'rendered'; id: number; same: boolean; bitmap: ImageBitmap | null };
