/**
 * Text recognition of subtitle pictures with Tesseract (its WebAssembly build, tesseract.js-core),
 * off the main thread. The engine comes with the app; each language's trained data is downloaded
 * the first time it is used and then kept in the browser's cache.
 */
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import { fetchModel, gunzip } from '@/media/models';
import type { OcrMessage, OcrRequest } from '@/media/ocr-protocol';

interface TessApi {
	Init: (path: string | null, language: string, engine: number) => number;
	SetVariable: (name: string, value: string) => void;
	SetImageFile: (orientation: number, angle: number) => number;
	Recognize: (monitor: null) => number;
	GetUTF8Text: () => string;
	End: () => void;
}

interface TessModule {
	FS: { writeFile: (path: string, data: Uint8Array) => void };
	TessBaseAPI: new () => TessApi;
}

function isCore(value: unknown): value is { default: (options: object) => Promise<TessModule> } {
	return typeof value === 'object' && value !== null && 'default' in value && typeof value.default === 'function';
}

function post(message: OcrMessage) {
	self.postMessage(message);
}

/** Where each language's trained data is published, compressed. */
function languageUrl(language: string): string {
	return `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`;
}

let api: TessApi | null = null;
let module: TessModule | null = null;

async function init(language: string) {
	if (!module) {
		// The core is a plain script defining TesseractCore: loaded as a module that exports it.
		const source = await (await fetch(coreUrl)).text();
		const url = URL.createObjectURL(
			new Blob([`${source}\nexport default TesseractCore;`], { type: 'text/javascript' }),
		);
		try {
			const loaded: unknown = await import(/* @vite-ignore */ url);
			if (!isCore(loaded)) throw new Error('Tesseract did not load');
			module = await loaded.default({});
		} finally {
			URL.revokeObjectURL(url);
		}
	}
	const data = await gunzip(
		await fetchModel(languageUrl(language), (share) => {
			post({ type: 'loading', share });
		}),
	);
	module.FS.writeFile(`${language}.traineddata`, data);
	api?.End();
	api = new module.TessBaseAPI();
	// 1: the LSTM engine, the only one this build has.
	if (api.Init(null, language, 1) !== 0) throw new Error('Tesseract could not start');
	// Subtitles are one block of a line or two.
	api.SetVariable('tessedit_pageseg_mode', '6');
	post({ type: 'ready' });
}

/** Margin around the text, in pixels: Tesseract reads text touching the edge badly. */
const MARGIN = 16;

/**
 * Subtitle pictures are light text with a dark outline on nothing: Tesseract wants dark text on
 * white. Bright, opaque pixels become black; the rest white.
 */
async function prepare(picture: ImageBitmap): Promise<Uint8Array> {
	const width = picture.width + MARGIN * 2;
	const height = picture.height + MARGIN * 2;
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('No 2D canvas');
	context.drawImage(picture, MARGIN, MARGIN);
	picture.close();
	const image = context.getImageData(0, 0, width, height);
	const pixels = image.data;
	for (let i = 0; i < pixels.length; i += 4) {
		const light = (0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0)) / 255;
		const alpha = (pixels[i + 3] ?? 0) / 255;
		const ink = light * alpha > 0.5 ? 0 : 255;
		pixels[i] = ink;
		pixels[i + 1] = ink;
		pixels[i + 2] = ink;
		pixels[i + 3] = 255;
	}
	context.putImageData(image, 0, 0);
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return new Uint8Array(await blob.arrayBuffer());
}

async function read(id: number, picture: ImageBitmap) {
	if (!api || !module) throw new Error('Not started');
	module.FS.writeFile('/input', await prepare(picture));
	if (api.SetImageFile(1, 0) === 1) throw new Error('Unreadable picture');
	api.Recognize(null);
	const text = api
		.GetUTF8Text()
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n');
	post({ type: 'text', id, text });
}

/** Requests run one after the other: the engine reads one picture at a time. */
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<OcrRequest>) => {
	const request = event.data;
	queue = queue
		.then(async () => (request.type === 'init' ? init(request.language) : read(request.id, request.picture)))
		.catch((error: unknown) => {
			post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
		});
};
