/**
 * GIF decoding.
 *
 * `ImageDecoder` is used where it exists: it is the browser's own decoder,
 * hardware-adjacent, and it already handles the disposal and frame-composition
 * rules that make hand-written GIF decoders subtly wrong. The header parser
 * below is ours only because the frame count and the delays have to be known
 * before any frame is decoded, so the timeline can be laid out at once.
 */

export type GifFrameData = {
	readonly index: number;
	readonly delayMs: number;
	readonly bitmap: ImageBitmap;
};

export type GifInfo = {
	readonly width: number;
	readonly height: number;
	readonly frameCount: number;
	readonly delaysMs: readonly number[];
	readonly loop: number;
};

export class GifDecodeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GifDecodeError";
	}
}

/**
 * Reads the header, the frame delays and the loop count without decoding
 * pixels, so a 500-frame file shows its timeline immediately.
 */
export function readGifInfo(bytes: Uint8Array): GifInfo {
	if (bytes.length < 13) throw new GifDecodeError("file is too short to be a GIF");
	const signature = String.fromCodePoint(...bytes.slice(0, 3));
	if (signature !== "GIF") throw new GifDecodeError("not a GIF file");

	const width = readUint16(bytes, 6);
	const height = readUint16(bytes, 8);
	const packed = bytes[10] ?? 0;

	let position = 13;
	if ((packed & 0x80) !== 0) {
		position += 3 * (1 << ((packed & 0x07) + 1));
	}

	const delaysMs: number[] = [];
	let loop = 0;
	let pendingDelay = 100;

	while (position < bytes.length) {
		const marker = bytes[position];

		if (marker === 0x3b) break;

		if (marker === 0x21) {
			const label = bytes[position + 1];
			if (label === 0xf9) {
				// Graphic control: this is where the delay of the next frame lives.
				pendingDelay = readUint16(bytes, position + 4) * 10;
				position += 8;
				continue;
			}
			if (label === 0xff) {
				const blockSize = bytes[position + 2] ?? 0;
				const identifier = String.fromCodePoint(
					...bytes.slice(position + 3, position + 3 + blockSize),
				);
				position += 3 + blockSize;
				if (identifier.startsWith("NETSCAPE")) {
					loop = readUint16(bytes, position + 2);
				}
				position = skipSubBlocks(bytes, position);
				continue;
			}
			position = skipSubBlocks(bytes, position + 2);
			continue;
		}

		if (marker === 0x2c) {
			delaysMs.push(pendingDelay);
			pendingDelay = 100;
			const framePacked = bytes[position + 9] ?? 0;
			position += 10;
			if ((framePacked & 0x80) !== 0) {
				position += 3 * (1 << ((framePacked & 0x07) + 1));
			}
			position += 1; // minimum code size
			position = skipSubBlocks(bytes, position);
			continue;
		}

		// An unknown marker means the parse has lost sync; stopping beats
		// producing a frame list that does not match the file.
		break;
	}

	return { width, height, frameCount: delaysMs.length, delaysMs, loop };
}

function skipSubBlocks(bytes: Uint8Array, start: number): number {
	let position = start;
	while (position < bytes.length) {
		const length = bytes[position] ?? 0;
		position += 1;
		if (length === 0) break;
		position += length;
	}
	return position;
}

function readUint16(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

type ImageDecoderConstructor = new (init: { data: BufferSource; type: string }) => {
	completed: Promise<void>;
	tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
	decode: (options: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
	close: () => void;
};

export function imageDecoderAvailable(): boolean {
	return "ImageDecoder" in globalThis;
}

/**
 * Decodes frames one at a time.
 *
 * An async generator rather than an array: a 500-frame file at 480p is 460 MB
 * of bitmaps, and the timeline only ever shows a handful at once.
 */
export async function* decodeGifFrames(
	blob: Blob,
	options: { readonly signal?: AbortSignal } = {},
): AsyncGenerator<GifFrameData, void, unknown> {
	const Decoder = (globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;
	if (Decoder === undefined) {
		throw new GifDecodeError("this browser has no ImageDecoder");
	}

	const bytes = new Uint8Array(await blob.arrayBuffer());
	const info = readGifInfo(bytes);
	const decoder = new Decoder({ data: bytes, type: "image/gif" });

	try {
		await decoder.tracks.ready;
		const frameCount = decoder.tracks.selectedTrack?.frameCount ?? info.frameCount;

		for (let index = 0; index < frameCount; index++) {
			if (options.signal?.aborted === true) return;
			const { image } = await decoder.decode({ frameIndex: index });
			try {
				yield {
					index,
					delayMs: info.delaysMs[index] ?? 100,
					bitmap: await createImageBitmap(image),
				};
			} finally {
				// The VideoFrame is ours to close; the bitmap belongs to the caller.
				image.close();
			}
		}
	} finally {
		decoder.close();
	}
}

/** Normalises the delays browsers silently rewrite: 0 and 10 ms become 100 ms. */
export function normaliseDelay(delayMs: number): number {
	return delayMs <= 10 ? 100 : delayMs;
}
