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

type Writer =
	| { format: 'gif'; writer: InstanceType<GifModule['GifWriter']> }
	| { format: 'apng'; writer: InstanceType<GifModule['ApngWriter']> };

let writer: Writer | null = null;
/** Messages are handled in order, even though loading the module is asynchronous. */
let queue: Promise<void> = Promise.resolve();

async function handle(request: GifRequest) {
	if (request.type === 'decode') {
		await decode(request.bytes, request.format);
	} else if (request.type === 'begin') {
		const gif = await load();
		writer =
			request.format === 'gif'
				? {
						format: 'gif',
						writer: new gif.GifWriter(
							request.quality,
							request.lossy,
							request.repeat,
							false,
							request.dither,
						),
					}
				: {
						format: 'apng',
						writer: new gif.ApngWriter(request.width, request.height, request.frames, request.repeat),
					};
	} else if (request.type === 'frame') {
		const pixels = new Uint8Array(request.rgba);
		if (writer?.format === 'gif') writer.writer.add_frame(pixels, request.width, request.height, request.pts);
		else writer?.writer.add_frame(pixels, request.duration * 1000);
	} else if (request.type === 'trim') {
		const gif = await load();
		const bytes = gif.trim_gif(new Uint8Array(request.bytes), request.start, request.end, request.repeat);
		post({ type: 'gif', bytes }, [bytes.buffer]);
	} else if (request.type === 'webp-still') {
		const gif = await load();
		const bytes = gif.encode_webp_lossless(new Uint8Array(request.rgba), request.width, request.height);
		post({ type: 'webp-still', id: request.id, bytes }, [bytes.buffer]);
	} else if (writer) {
		// `finish` consumes the APNG writer; the GIF writer is freed after.
		const bytes = writer.writer.finish();
		if (writer.format === 'gif') writer.writer.free();
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
