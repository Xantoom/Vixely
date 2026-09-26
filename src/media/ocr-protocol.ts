export type OcrRequest = { type: 'init'; language: string } | { type: 'read'; id: number; picture: ImageBitmap };

export type OcrMessage =
	| { type: 'loading'; share: number }
	| { type: 'ready' }
	| { type: 'text'; id: number; text: string }
	| { type: 'error'; message: string };
