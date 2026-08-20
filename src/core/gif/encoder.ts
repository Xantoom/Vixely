import { lzwEncode } from "./lzw.ts";
import {
	buildGlobalPalette,
	buildPalette,
	quantizeFrame,
	type DitherMode,
	type Palette,
} from "./quantize.ts";

/**
 * GIF89a writer.
 *
 * Assembling the file is a few hundred lines of byte layout, which is well
 * under the threshold where a dependency would earn its place. Everything here
 * is pure: given the same frames it produces the same bytes, which is what
 * makes it testable without a browser.
 */

export type GifFrameInput = {
	/** RGBA pixels, `width * height * 4`. */
	readonly pixels: Uint8ClampedArray;
	/** Frame delay in milliseconds. GIF stores hundredths, so this is rounded. */
	readonly delayMs: number;
};

export type GifEncodeOptions = {
	readonly width: number;
	readonly height: number;
	readonly colors: number;
	readonly dither: DitherMode;
	/** 0 loops forever, which is what almost every GIF wants. */
	readonly loop: number;
	readonly paletteScope: "global" | "per-frame";
	readonly alphaThreshold: number;
	readonly onProgress?: (ratio: number) => void;
};

const HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;

export function encodeGif(
	frames: readonly GifFrameInput[],
	options: GifEncodeOptions,
): Uint8Array<ArrayBuffer> {
	if (frames.length === 0) throw new Error("a GIF needs at least one frame");

	const bytes: number[] = [...HEADER];
	const usesTransparency = frames.some((frame) =>
		hasTransparency(frame.pixels, options.alphaThreshold),
	);
	// One slot is reserved for transparency, so the visible palette is smaller.
	const visibleColors = Math.max(2, Math.min(256, options.colors - (usesTransparency ? 1 : 0)));

	const globalPalette =
		options.paletteScope === "global"
			? buildGlobalPalette(
					frames.map((frame) => frame.pixels),
					{ colors: visibleColors, alphaThreshold: options.alphaThreshold },
				)
			: null;

	const globalSize =
		globalPalette === null ? 0 : paddedSize(globalPalette.length + (usesTransparency ? 1 : 0));

	// Logical screen descriptor.
	pushUint16(bytes, options.width);
	pushUint16(bytes, options.height);
	bytes.push(globalPalette === null ? 0 : 0x80 | (bitsFor(globalSize) - 1), 0, 0);

	if (globalPalette !== null) {
		pushPalette(bytes, globalPalette, globalSize);
	}

	// Netscape extension: without it a GIF plays once regardless of intent.
	if (frames.length > 1) {
		bytes.push(0x21, 0xff, 0x0b);
		for (const character of "NETSCAPE2.0") bytes.push(character.codePointAt(0) ?? 0);
		bytes.push(0x03, 0x01);
		pushUint16(bytes, options.loop);
		bytes.push(0x00);
	}

	for (const [index, frame] of frames.entries()) {
		const localPalette =
			globalPalette ??
			buildPalette(frame.pixels, {
				colors: visibleColors,
				alphaThreshold: options.alphaThreshold,
			});
		const transparentIndex = usesTransparency ? localPalette.length : null;
		const paletteSize = paddedSize(localPalette.length + (usesTransparency ? 1 : 0));

		writeGraphicControl(bytes, frame.delayMs, transparentIndex);
		writeImageDescriptor(bytes, options, globalPalette === null ? paletteSize : 0);

		if (globalPalette === null) {
			pushPalette(bytes, localPalette, paletteSize);
		}

		const quantized = quantizeFrame(
			frame.pixels,
			options.width,
			options.height,
			localPalette,
			options.dither,
			options.alphaThreshold,
			transparentIndex,
		);

		const minimumCodeSize = Math.max(2, bitsFor(paletteSize));
		bytes.push(minimumCodeSize);
		for (const byte of lzwEncode(quantized.indices, minimumCodeSize)) bytes.push(byte);

		options.onProgress?.((index + 1) / frames.length);
	}

	bytes.push(0x3b);
	// Backed by a plain ArrayBuffer so the result is a valid BlobPart.
	const output = new Uint8Array(new ArrayBuffer(bytes.length));
	output.set(bytes);
	return output;
}

function writeGraphicControl(
	bytes: number[],
	delayMs: number,
	transparentIndex: number | null,
): void {
	// Extension introducer, graphic control label, block size, then disposal 2
	// (restore to background) combined with the transparency flag.
	bytes.push(0x21, 0xf9, 0x04, (2 << 2) | (transparentIndex === null ? 0 : 1));
	// GIF stores hundredths of a second; anything faster is clamped by players.
	pushUint16(bytes, Math.max(1, Math.round(delayMs / 10)));
	bytes.push(transparentIndex ?? 0, 0x00);
}

function writeImageDescriptor(
	bytes: number[],
	options: GifEncodeOptions,
	localPaletteSize: number,
): void {
	bytes.push(0x2c);
	pushUint16(bytes, 0);
	pushUint16(bytes, 0);
	pushUint16(bytes, options.width);
	pushUint16(bytes, options.height);
	bytes.push(localPaletteSize === 0 ? 0 : 0x80 | (bitsFor(localPaletteSize) - 1));
}

function pushPalette(bytes: number[], palette: Palette, size: number): void {
	for (let index = 0; index < size; index++) {
		const color = palette[index] ?? [0, 0, 0];
		bytes.push(color[0], color[1], color[2]);
	}
}

function pushUint16(bytes: number[], value: number): void {
	bytes.push(value & 0xff, (value >> 8) & 0xff);
}

/** GIF palettes are a power of two, from 2 to 256. */
function paddedSize(count: number): number {
	let size = 2;
	while (size < count && size < 256) size *= 2;
	return size;
}

function bitsFor(size: number): number {
	return Math.max(1, Math.ceil(Math.log2(size)));
}

function hasTransparency(pixels: Uint8ClampedArray, threshold: number): boolean {
	for (let offset = 3; offset < pixels.length; offset += 4) {
		if ((pixels[offset] ?? 255) < threshold) return true;
	}
	return false;
}

/**
 * Size a GIF would take, without encoding it.
 *
 * Rough by construction, but enough to tell a user that their 500-frame 1080p
 * export will be 80 MB *before* they wait for it.
 */
export function estimateGifBytes(
	frameCount: number,
	width: number,
	height: number,
	colors: number,
): number {
	// LZW on quantised frames lands around 0.4 bytes per pixel at 256 colours.
	const bytesPerPixel = 0.15 + (colors / 256) * 0.35;
	return Math.round(frameCount * width * height * bytesPerPixel + colors * 3 + 800);
}
