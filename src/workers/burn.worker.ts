/**
 * Draws text subtitles for an export, one picture at a time, with the libass build JASSUB ships:
 * the same renderer as the preview, drawing into a canvas of its own rather than on screen.
 */
// oxlint-disable-next-line no-restricted-imports -- JASSUB's renderer, without its on-screen wrapper
import { ASSRenderer } from 'jassub/dist/worker/worker.js';
import type { BurnRequest, BurnResponse } from '@/media/burn-protocol';

/** What JASSUB's renderer has inside, used here directly. */
interface Inner {
	_wasm: { rawRender: (time: number, force: number) => { length: number } | null };
	_gpurender: { render: (images: unknown, heap: Uint8Array) => void };
	_resizeCanvas: (width: number, height: number, videoWidth: number, videoHeight: number) => void;
}

function isInner(value: unknown): value is Inner {
	return typeof value === 'object' && value !== null && '_wasm' in value && '_gpurender' in value;
}

let renderer: Inner | null = null;
let canvas: OffscreenCanvas | null = null;
let first = true;

function post(message: BurnResponse, transfer: Transferable[] = []) {
	self.postMessage(message, { transfer });
}

self.onmessage = async ({ data }: MessageEvent<BurnRequest>) => {
	if (data.type === 'open') {
		try {
			canvas = new OffscreenCanvas(data.width, data.height);
			const options = {
				wasmUrl: data.wasmUrl,
				width: data.width,
				height: data.height,
				subUrl: undefined,
				subContent: data.script,
				fonts: data.fonts,
				availableFonts: {},
				defaultFont: 'liberation sans',
				debug: false,
				libassMemoryLimit: 0,
				libassGlyphLimit: 0,
				queryFonts: false as const,
			};
			// Its constructor gives a promise, which resolves once libass is loaded.
			const made: unknown = new ASSRenderer(options, async () => Promise.resolve(undefined), canvas);
			const created = await Promise.resolve(made);
			if (!isInner(created)) throw new Error('libass did not start');
			created._resizeCanvas(data.width, data.height, data.width, data.height);
			renderer = created;
			post({ type: 'opened' });
		} catch (error) {
			post({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
		}
		return;
	}
	if (!renderer || !canvas) return;
	const images = renderer._wasm.rawRender(data.time, first ? 1 : 0);
	first = false;
	if (!images) {
		post({ type: 'rendered', id: data.id, same: true, bitmap: null });
		return;
	}
	if (images.length === 0) {
		post({ type: 'rendered', id: data.id, same: false, bitmap: null });
		return;
	}
	// The WebAssembly memory, which the build shares on the worker's global.
	const heap: unknown = Reflect.get(self, 'HEAPU8RAW');
	if (!(heap instanceof Uint8Array)) {
		post({ type: 'rendered', id: data.id, same: false, bitmap: null });
		return;
	}
	renderer._gpurender.render(images, heap);
	const bitmap = canvas.transferToImageBitmap();
	post({ type: 'rendered', id: data.id, same: false, bitmap }, [bitmap]);
};
