import type { OcrMessage, OcrRequest } from './ocr-protocol';

/** Tesseract's names for the languages subtitles come in (Matroska's ISO 639-2 codes). */
export const OCR_LANGUAGES: Record<string, string> = {
	eng: 'eng',
	fre: 'fra',
	ger: 'deu',
	spa: 'spa',
	ita: 'ita',
	por: 'por',
	dut: 'nld',
	jpn: 'jpn',
	chi: 'chi_sim',
	kor: 'kor',
	rus: 'rus',
	ara: 'ara',
	pol: 'pol',
	swe: 'swe',
};

/** Reads the text of pictures, in one language, in a worker. */
export class TextReader {
	private readonly waiting = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
	private next = 0;

	private constructor(private readonly worker: Worker) {
		worker.addEventListener('message', (event: MessageEvent<OcrMessage>) => {
			const message = event.data;
			if (message.type === 'text') {
				this.waiting.get(message.id)?.resolve(message.text);
				this.waiting.delete(message.id);
			} else if (message.type === 'error') {
				for (const { reject } of this.waiting.values()) reject(new Error(message.message));
				this.waiting.clear();
			}
		});
	}

	/** Starts the engine with `language` (ISO 639-2); the first time, its data is downloaded. */
	static async start(language: string, onLoading: (share: number) => void): Promise<TextReader> {
		const worker = new Worker(new URL('../workers/ocr.worker.ts', import.meta.url), { type: 'module' });
		await new Promise<void>((resolve, reject) => {
			const listen = (event: MessageEvent<OcrMessage>) => {
				const message = event.data;
				if (message.type === 'loading') onLoading(message.share);
				else if (message.type === 'ready' || message.type === 'error') {
					worker.removeEventListener('message', listen);
					if (message.type === 'ready') resolve();
					else reject(new Error(message.message));
				}
			};
			worker.addEventListener('message', listen);
			const request: OcrRequest = { type: 'init', language: OCR_LANGUAGES[language] ?? 'eng' };
			worker.postMessage(request);
		}).catch((error: unknown) => {
			worker.terminate();
			throw error;
		});
		return new TextReader(worker);
	}

	/** The text of a picture, lines joined by line breaks. The picture is handed over. */
	async read(picture: ImageBitmap): Promise<string> {
		const id = this.next++;
		return new Promise((resolve, reject) => {
			this.waiting.set(id, { resolve, reject });
			const request: OcrRequest = { type: 'read', id, picture };
			this.worker.postMessage(request, [picture]);
		});
	}

	dispose(): void {
		this.worker.terminate();
	}
}
