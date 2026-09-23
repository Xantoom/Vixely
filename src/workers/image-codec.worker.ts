import type { CodecRequest, CodecResponse } from '@/media/image-codec';
/**
 * Runs vixely-image off the main thread, so encoding a large AVIF or JPEG XL never freezes the
 * interface. Pixel buffers and results are transferred, not copied.
 */
import init, * as codec from '@/wasm/vixely-image/vixely_image.js';

const ready = init();

function run(request: CodecRequest): { bytes: Uint8Array; width?: number; height?: number } {
	if (request.op === 'decode') {
		const decoded = codec.decode_image(request.bytes, request.format);
		const result = { bytes: decoded.rgba, width: decoded.width, height: decoded.height };
		decoded.free();
		return result;
	}
	const { rgba, width, height, quality } = request;
	switch (request.format) {
		case 'jpeg':
			return { bytes: codec.encode_jpeg(rgba, width, height, quality) };
		case 'png':
			return { bytes: codec.encode_png(rgba, width, height, request.lossless ? 0 : quality) };
		case 'avif':
			return { bytes: codec.encode_avif(rgba, width, height, quality, request.speed) };
		case 'jxl':
			return { bytes: codec.encode_jxl(rgba, width, height, quality, request.effort) };
	}
}

self.addEventListener('message', (event: MessageEvent<CodecRequest>) => {
	const request = event.data;
	void ready.then(() => {
		let response: CodecResponse;
		try {
			const result = run(request);
			response = { id: request.id, ok: true, ...result };
			self.postMessage(response, { transfer: [result.bytes.buffer] });
		} catch (error) {
			response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
			self.postMessage(response);
		}
	});
});
