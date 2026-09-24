/**
 * Runs vixely-gif off the main thread: decoding animations and encoding GIFs with gifski, which
 * would otherwise freeze the page for seconds. See `src/media/gif-codec.ts`.
 */
import type { GifRequest, GifResponse } from '@/media/gif-codec';

type GifModule = typeof import('@/wasm/vixely-gif/vixely_gif.js');

let loading: Promise<GifModule> | null = null;

async function load(): Promise<GifModule> {
	loading ??= import('@/wasm/vixely-gif/vixely_gif.js').then(async (module) => {
		await module.default();
		return module;
	});
	return loading;
}

function post(message: GifResponse, transfer: Transferable[] = []) {
	self.postMessage(message, { transfer });
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function decode(bytes: ArrayBuffer, format: string) {
	const gif = await load();
	const reader = new gif.AnimationReader(new Uint8Array(bytes), format);
	post({ type: 'size', width: reader.width(), height: reader.height() });
	for (let frame = reader.next_frame(); frame; frame = reader.next_frame()) {
		const pixels = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
		// Frames are handed over one at a time, so a long GIF shows while it decodes.
		// oxlint-disable-next-line no-await-in-loop
		const bitmap = await createImageBitmap(pixels);
		post({ type: 'frame', bitmap, delay: frame.delay }, [bitmap]);
		frame.free();
	}
	reader.free();
	post({ type: 'done' });
}

let writer: InstanceType<GifModule['GifWriter']> | null = null;
/** Messages are handled in order, even though loading the module is asynchronous. */
let queue: Promise<void> = Promise.resolve();

async function handle(request: GifRequest) {
	if (request.type === 'decode') {
		await decode(request.bytes, request.format);
	} else if (request.type === 'begin') {
		const gif = await load();
		writer = new gif.GifWriter(request.quality, request.lossy, request.repeat, false);
	} else if (request.type === 'frame') {
		writer?.add_frame(new Uint8Array(request.rgba), request.width, request.height, request.pts);
	} else if (writer) {
		const bytes = writer.finish();
		writer.free();
		writer = null;
		post({ type: 'gif', bytes }, [bytes.buffer]);
	}
}

self.onmessage = (event: MessageEvent<GifRequest>) => {
	queue = queue
		.then(async () => handle(event.data))
		.catch((error: unknown) => {
			post({ type: 'error', message: describe(error) });
		});
};
