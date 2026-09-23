/**
 * Runs image codecs off the main thread, so encoding a large AVIF or decoding an iPhone photo
 * never freezes the interface. Each library loads on its first use only: opening a HEIC photo
 * doesn't download the encoders, and exporting doesn't download libheif. Pixel buffers and
 * results are transferred, not copied.
 */
import type { CodecRequest, CodecResponse } from '@/media/image-codec';

type ImageCodec = typeof import('@/wasm/vixely-image/vixely_image.js');
type LibHeif = Awaited<ReturnType<typeof import('libheif-js/libheif-wasm/libheif-bundle.mjs').default>>;

let imageCodec: Promise<ImageCodec> | null = null;
let libheif: Promise<LibHeif> | null = null;

async function loadImageCodec(): Promise<ImageCodec> {
	imageCodec ??= import('@/wasm/vixely-image/vixely_image.js').then(async (module) => {
		await module.default();
		return module;
	});
	return imageCodec;
}

async function loadLibHeif(): Promise<LibHeif> {
	libheif ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(async (module) => module.default());
	return libheif;
}

interface Result {
	bytes: Uint8Array;
	width?: number;
	height?: number;
}

async function decodeHeic(bytes: Uint8Array): Promise<Result> {
	const lib = await loadLibHeif();
	const images = new lib.HeifDecoder().decode(bytes);
	const [primary] = images;
	if (!primary) throw new Error('No image in this HEIF file');
	const width = primary.get_width();
	const height = primary.get_height();
	const decoded = await new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve, reject) => {
		primary.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) => {
			if (result) resolve(result.data);
			else reject(new Error('HEIF decoding failed'));
		});
	});
	for (const image of images) image.free();
	return { bytes: new Uint8Array(decoded.buffer), width, height };
}

async function run(request: CodecRequest): Promise<Result> {
	if (request.op === 'decode-heic') return decodeHeic(request.bytes);
	const codec = await loadImageCodec();
	if (request.op === 'decode') {
		const decoded = codec.decode_image(request.bytes, request.format);
		const result = { bytes: decoded.rgba, width: decoded.width, height: decoded.height };
		decoded.free();
		return result;
	}
	const { rgba, width, height, quality, exif } = request;
	switch (request.format) {
		case 'jpeg':
			return { bytes: codec.encode_jpeg(rgba, width, height, quality, exif) };
		case 'png':
			return { bytes: codec.encode_png(rgba, width, height, request.lossless ? 0 : quality, exif) };
		case 'avif':
			return { bytes: codec.encode_avif(rgba, width, height, quality, request.speed, exif) };
		case 'jxl':
			return { bytes: codec.encode_jxl(rgba, width, height, quality, request.effort, exif) };
	}
}

self.addEventListener('message', (event: MessageEvent<CodecRequest>) => {
	const request = event.data;
	run(request).then(
		(result) => {
			const response: CodecResponse = { id: request.id, ok: true, ...result };
			self.postMessage(response, { transfer: [result.bytes.buffer] });
		},
		(error: unknown) => {
			const response: CodecResponse = {
				id: request.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
			self.postMessage(response);
		},
	);
});
