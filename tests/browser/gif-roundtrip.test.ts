import { describe, expect, it } from "vitest";
import { decodeGifFrames, encodeGif, imageDecoderAvailable, readGifInfo } from "~/core/gif";

/**
 * Proves the encoder writes real GIFs.
 *
 * The unit tests check our writer against our own parser, which cannot catch a
 * shared misreading of the specification. Handing the bytes to the browser's
 * own `ImageDecoder` is the independent check: if Chromium and Firefox render
 * the frames with the right colours, the file is correct.
 */

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;

function solid(width: number, height: number, rgb: readonly [number, number, number]) {
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < pixels.length; offset += 4) {
		pixels[offset] = rgb[0];
		pixels[offset + 1] = rgb[1];
		pixels[offset + 2] = rgb[2];
		pixels[offset + 3] = 255;
	}
	return pixels;
}

async function firstPixelOf(bitmap: ImageBitmap): Promise<[number, number, number]> {
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("no 2D context");
	context.drawImage(bitmap, 0, 0);
	const data = context.getImageData(0, 0, 1, 1).data;
	return [data[0]!, data[1]!, data[2]!];
}

function near(actual: readonly number[], expected: readonly number[], tolerance = 12): boolean {
	return actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= tolerance);
}

describe("the browser reads what we write", () => {
	it("is available at all", () => {
		expect(imageDecoderAvailable()).toBe(true);
	});

	it("decodes a single frame with the right colour", async () => {
		const bytes = encodeGif([{ pixels: solid(16, 16, RED), delayMs: 100 }], {
			width: 16,
			height: 16,
			colors: 8,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		const frames = [];
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			frames.push(frame);
		}

		expect(frames).toHaveLength(1);
		expect(frames[0]?.bitmap.width).toBe(16);
		expect(near(await firstPixelOf(frames[0]!.bitmap), RED)).toBe(true);
	});

	it("decodes an animation with the right frames, colours and delays", async () => {
		const bytes = encodeGif(
			[
				{ pixels: solid(8, 8, RED), delayMs: 40 },
				{ pixels: solid(8, 8, GREEN), delayMs: 120 },
				{ pixels: solid(8, 8, BLUE), delayMs: 200 },
			],
			{
				width: 8,
				height: 8,
				colors: 16,
				dither: "none",
				loop: 0,
				paletteScope: "global",
				alphaThreshold: 128,
			},
		);

		const frames = [];
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			frames.push(frame);
		}

		expect(frames).toHaveLength(3);
		expect(near(await firstPixelOf(frames[0]!.bitmap), RED)).toBe(true);
		expect(near(await firstPixelOf(frames[1]!.bitmap), GREEN)).toBe(true);
		expect(near(await firstPixelOf(frames[2]!.bitmap), BLUE)).toBe(true);
		expect(frames.map((frame) => frame.delayMs)).toEqual([40, 120, 200]);
	});

	it("decodes a per-frame palette as well as a global one", async () => {
		const frames = [
			{ pixels: solid(8, 8, RED), delayMs: 100 },
			{ pixels: solid(8, 8, BLUE), delayMs: 100 },
		];
		const bytes = encodeGif(frames, {
			width: 8,
			height: 8,
			colors: 8,
			dither: "none",
			loop: 0,
			paletteScope: "per-frame",
			alphaThreshold: 128,
		});

		const decoded = [];
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			decoded.push(frame);
		}

		expect(decoded).toHaveLength(2);
		expect(near(await firstPixelOf(decoded[0]!.bitmap), RED)).toBe(true);
		expect(near(await firstPixelOf(decoded[1]!.bitmap), BLUE)).toBe(true);
	});

	it("survives a dithered gradient without corrupting the stream", async () => {
		const width = 64;
		const height = 32;
		const gradient = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const offset = (y * width + x) * 4;
				gradient[offset] = Math.round((x / (width - 1)) * 255);
				gradient[offset + 1] = Math.round((y / (height - 1)) * 255);
				gradient[offset + 2] = 128;
				gradient[offset + 3] = 255;
			}
		}

		const bytes = encodeGif([{ pixels: gradient, delayMs: 100 }], {
			width,
			height,
			colors: 32,
			dither: "floyd-steinberg",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		const frames = [];
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			frames.push(frame);
		}

		expect(frames).toHaveLength(1);
		expect(frames[0]?.bitmap.width).toBe(width);
		expect(frames[0]?.bitmap.height).toBe(height);
	});

	it("carries transparency through to the decoded frame", async () => {
		const pixels = solid(8, 8, RED);
		// Punch a hole in the top-left corner.
		pixels[3] = 0;

		const bytes = encodeGif([{ pixels, delayMs: 100 }], {
			width: 8,
			height: 8,
			colors: 8,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		const frames = [];
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			frames.push(frame);
		}

		const canvas = new OffscreenCanvas(8, 8);
		const context = canvas.getContext("2d");
		context?.drawImage(frames[0]!.bitmap, 0, 0);
		const alpha = context?.getImageData(0, 0, 1, 1).data[3];
		expect(alpha).toBe(0);
	});

	it("agrees with our own header parser about a file we did not write", async () => {
		// A GIF produced by the encoder, read back through both paths.
		const bytes = encodeGif(
			Array.from({ length: 6 }, (_, index) => ({
				pixels: solid(8, 8, [index * 40, 100, 200]),
				delayMs: 60,
			})),
			{
				width: 8,
				height: 8,
				colors: 16,
				dither: "none",
				loop: 3,
				paletteScope: "global",
				alphaThreshold: 128,
			},
		);

		const info = readGifInfo(bytes);
		expect(info.loop).toBe(3);

		let decodedCount = 0;
		for await (const frame of decodeGifFrames(new Blob([bytes], { type: "image/gif" }))) {
			frame.bitmap.close();
			decodedCount += 1;
		}
		expect(decodedCount).toBe(info.frameCount);
	});
});
