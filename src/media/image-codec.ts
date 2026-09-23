/**
 * Client for the image codec worker: jpegli, PNG (lossless or palette), AVIF and JPEG XL
 * encoding, and decoding of formats browsers can't read. The worker and its WebAssembly module
 * load on first use only.
 */

export type RustImageFormat = 'jpeg' | 'png' | 'avif' | 'jxl';

interface EncodeBase {
	id: number;
	op: 'encode';
	rgba: Uint8Array;
	width: number;
	height: number;
	/** 1 to 100. */
	quality: number;
	/** EXIF to embed, as a TIFF structure. Empty for none. */
	exif: Uint8Array;
}

export type EncodeRequest =
	| (EncodeBase & { format: 'jpeg' })
	| (EncodeBase & { format: 'png'; lossless: boolean })
	| (EncodeBase & { format: 'avif'; speed: number })
	| (EncodeBase & { format: 'jxl'; effort: number });

export type CodecRequest =
	| EncodeRequest
	| { id: number; op: 'decode'; bytes: Uint8Array; format: string }
	| { id: number; op: 'decode-heic'; bytes: Uint8Array };

export type CodecResponse =
	| { id: number; ok: true; bytes: Uint8Array; width?: number; height?: number }
	| { id: number; ok: false; error: string };

type Pending = { resolve: (response: Extract<CodecResponse, { ok: true }>) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
const pending = new Map<number, Pending>();
let nextId = 1;

function getWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('../workers/image-codec.worker.ts', import.meta.url), { type: 'module' });
	worker.addEventListener('message', (event: MessageEvent<CodecResponse>) => {
		const response = event.data;
		const waiting = pending.get(response.id);
		if (!waiting) return;
		pending.delete(response.id);
		if (response.ok) waiting.resolve(response);
		else waiting.reject(new Error(response.error));
	});
	worker.addEventListener('error', (event) => {
		for (const waiting of pending.values()) waiting.reject(new Error(event.message));
		pending.clear();
		worker = null;
	});
	return worker;
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

async function call(request: WithoutId<CodecRequest>, transfer: Transferable[]) {
	const id = nextId++;
	return new Promise<Extract<CodecResponse, { ok: true }>>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		getWorker().postMessage({ ...request, id }, transfer);
	});
}

/** Encodes straight RGBA pixels. The pixel buffer is handed over to the worker. */
export async function encodeImage(request: WithoutId<EncodeRequest>): Promise<Uint8Array> {
	const response = await call(request, [request.rgba.buffer]);
	return response.bytes;
}

/**
 * Decodes an image the browser can't read into straight RGBA pixels: TIFF, BMP, ICO and JPEG XL
 * with vixely-image, HEIC and HEIF (iPhone photos) with libheif.
 */
export async function decodeImage(bytes: Uint8Array, format: string): Promise<ImageData> {
	const request =
		format === 'heic' ? ({ op: 'decode-heic', bytes } as const) : ({ op: 'decode', bytes, format } as const);
	const response = await call(request, [bytes.buffer]);
	const { width = 0, height = 0 } = response;
	// Copied into a fresh buffer: ImageData refuses views that could be shared memory.
	return new ImageData(new Uint8ClampedArray(response.bytes), width, height);
}
