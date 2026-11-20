/**
 * Draws text subtitles for an export, one picture at a time, with the libass build JASSUB ships:
 * the same renderer as the preview, drawing into a canvas of its own rather than on screen.
 */
// oxlint-disable-next-line no-restricted-imports -- JASSUB's renderer, without its on-screen wrapper
import { ASSRenderer } from 'jassub/dist/worker/worker.js';
import type { BurnRequest, BurnResponse } from '@/media/burn-protocol';

/** What JASSUB's renderer has inside, used here directly. */
interface Inner {
	/** Eight integers per image, or null when nothing changed since the last call. */
	_wasm: { rawRender: (time: number, force: number) => ArrayLike<number> | null };
	_gpurender: { render: (images: unknown, heap: Uint8Array) => void };
	_resizeCanvas: (width: number, height: number, videoWidth: number, videoHeight: number) => void;
}

function isInner(value: unknown): value is Inner {
	return typeof value === 'object' && value !== null && '_wasm' in value && '_gpurender' in value;
}

/** What libass drew, as JASSUB's renderer takes it: its own reading of the eight integers. */
function readImages(view: ArrayLike<number>) {
	const images = [];
	const at = (index: number) => view[index] ?? 0;
	for (let index = 0; index + 7 < view.length; index += 8) {
		images.push({
			w: at(index),
			h: at(index + 1),
			dst_x: at(index + 2),
			dst_y: at(index + 3),
			// Unsigned in C.
			bitmap: at(index + 4) >>> 0,
			color: at(index + 5) >>> 0,
			stride: at(index + 6),
			cache_id: at(index + 7) >>> 0,
		});
	}
	return images;
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
				wasmWorkerUrl: data.wasmWorkerUrl,
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
	// Rounded to the hundredth like the script's times, so a line starting at 1.007 s (written 1.01)
	// is on the picture at 1.007 s.
	const view = renderer._wasm.rawRender(Math.round(data.time * 100) / 100, first ? 1 : 0);
	first = false;
	if (!view) {
		post({ type: 'rendered', id: data.id, same: true, bitmap: null });
		return;
	}
	if (view.length === 0) {
		post({ type: 'rendered', id: data.id, same: false, bitmap: null });
		return;
	}
	// The WebAssembly memory, which the build shares on the worker's global. Without it nothing
	// would be drawn: the export fails rather than coming out without its subtitles.
	const heap: unknown = Reflect.get(self, 'HEAPU8RAW');
	if (!(heap instanceof Uint8Array)) {
		post({ type: 'failed', message: 'libass memory not found' });
		return;
	}
	renderer._gpurender.render(readImages(view), heap);
	const bitmap = canvas.transferToImageBitmap();
	post({ type: 'rendered', id: data.id, same: false, bitmap }, [bitmap]);
};
