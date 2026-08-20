import { describe, expect, it } from "vitest";
import {
	buildGlobalPalette,
	buildPalette,
	colorDistance,
	encodeGif,
	estimateGifBytes,
	lzwDecode,
	lzwEncode,
	nearestIndex,
	normaliseDelay,
	quantizeFrame,
	readGifInfo,
	unpackSubBlocks,
	type Palette,
} from "~/core/gif";

const OPTIONS = { colors: 256, alphaThreshold: 128 } as const;

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

/** Four quadrants, so a palette that collapses colours is visible. */
function quadrants(size: number) {
	const colors = [
		[255, 0, 0],
		[0, 255, 0],
		[0, 0, 255],
		[255, 255, 0],
	] as const;
	const pixels = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const quadrant = (y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1);
			const color = colors[quadrant]!;
			const offset = (y * size + x) * 4;
			pixels[offset] = color[0];
			pixels[offset + 1] = color[1];
			pixels[offset + 2] = color[2];
			pixels[offset + 3] = 255;
		}
	}
	return pixels;
}

describe("LZW", () => {
	it("round-trips a run of identical values", () => {
		const indices = new Uint8Array(1000).fill(7);
		const encoded = lzwEncode(indices, 8);
		const decoded = lzwDecode(unpackSubBlocks(encoded), 8, indices.length);
		expect([...decoded]).toEqual([...indices]);
	});

	it("round-trips a repeating pattern", () => {
		const indices = Uint8Array.from({ length: 900 }, (_, index) => index % 12);
		const encoded = lzwEncode(indices, 4);
		const decoded = lzwDecode(unpackSubBlocks(encoded), 4, indices.length);
		expect([...decoded]).toEqual([...indices]);
	});

	it("round-trips data that overflows the dictionary and forces a reset", () => {
		// Deterministic pseudo-random: enough entropy to fill 4096 entries.
		let seed = 1;
		const indices = Uint8Array.from({ length: 40_000 }, () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % 256;
		});
		const encoded = lzwEncode(indices, 8);
		const decoded = lzwDecode(unpackSubBlocks(encoded), 8, indices.length);
		expect([...decoded]).toEqual([...indices]);
	});

	it("compresses a uniform run to a fraction of its size", () => {
		const indices = new Uint8Array(10_000).fill(3);
		expect(lzwEncode(indices, 8).length).toBeLessThan(indices.length / 10);
	});

	it("handles an empty input without producing garbage", () => {
		const encoded = lzwEncode(new Uint8Array(0), 8);
		expect(encoded.length).toBeGreaterThan(0);
		expect(encoded.at(-1)).toBe(0);
	});

	it("frames output in sub-blocks of at most 255 bytes", () => {
		let seed = 7;
		const indices = Uint8Array.from({ length: 20_000 }, () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % 256;
		});
		const encoded = lzwEncode(indices, 8);

		let position = 0;
		while (position < encoded.length) {
			const length = encoded[position] ?? 0;
			expect(length).toBeLessThanOrEqual(255);
			if (length === 0) break;
			position += length + 1;
		}
	});
});

describe("palette quantisation", () => {
	it("finds the exact colours when there are few enough", () => {
		const palette = buildPalette(quadrants(16), OPTIONS);
		for (const expected of [
			[255, 0, 0],
			[0, 255, 0],
			[0, 0, 255],
			[255, 255, 0],
		] as const) {
			const nearest = palette[nearestIndex(palette, expected)]!;
			expect(colorDistance(nearest, expected)).toBeLessThan(100);
		}
	});

	it("never exceeds the requested size", () => {
		const noisy = new Uint8ClampedArray(64 * 64 * 4);
		for (let index = 0; index < noisy.length; index += 4) {
			noisy[index] = (index * 7) % 256;
			noisy[index + 1] = (index * 13) % 256;
			noisy[index + 2] = (index * 29) % 256;
			noisy[index + 3] = 255;
		}
		expect(buildPalette(noisy, { colors: 16, alphaThreshold: 128 }).length).toBeLessThanOrEqual(16);
		expect(buildPalette(noisy, { colors: 4, alphaThreshold: 128 }).length).toBeLessThanOrEqual(4);
	});

	it("ignores fully transparent pixels when building the palette", () => {
		const pixels = new Uint8ClampedArray(16 * 4);
		for (let index = 0; index < pixels.length; index += 4) {
			pixels[index] = 255;
			pixels[index + 3] = index === 0 ? 255 : 0;
		}
		const palette = buildPalette(pixels, OPTIONS);
		expect(palette[0]?.[0]).toBe(255);
	});

	it("survives a fully transparent frame", () => {
		const palette = buildPalette(new Uint8ClampedArray(64), OPTIONS);
		expect(palette).toHaveLength(1);
	});

	it("builds one palette across frames without holding them all", () => {
		const frames = Array.from({ length: 40 }, (_, index) =>
			solid(8, 8, [index * 6, 0, 255 - index * 6]),
		);
		const palette = buildGlobalPalette(frames, { colors: 8, alphaThreshold: 128 });
		expect(palette.length).toBeLessThanOrEqual(8);
		expect(palette.length).toBeGreaterThan(1);
	});
});

describe("dithering", () => {
	const palette: Palette = [
		[0, 0, 0],
		[255, 255, 255],
	];

	it("maps every pixel to a palette index", () => {
		const { indices } = quantizeFrame(
			solid(4, 4, [200, 200, 200]),
			4,
			4,
			palette,
			"none",
			128,
			null,
		);
		expect(indices).toHaveLength(16);
		expect([...indices].every((index) => index < palette.length)).toBe(true);
	});

	it("breaks up a flat mid-grey instead of flattening it", () => {
		const grey = solid(16, 16, [128, 128, 128]);
		const flat = quantizeFrame(grey, 16, 16, palette, "none", 128, null);
		const dithered = quantizeFrame(grey, 16, 16, palette, "floyd-steinberg", 128, null);
		const bayer = quantizeFrame(grey, 16, 16, palette, "bayer", 128, null);

		// Without dithering every pixel lands on the same entry.
		expect(new Set(flat.indices).size).toBe(1);
		expect(new Set(dithered.indices).size).toBe(2);
		expect(new Set(bayer.indices).size).toBe(2);
	});

	it("is deterministic, so a frame re-encoded is byte-identical", () => {
		const source = quadrants(16);
		const first = quantizeFrame(source, 16, 16, palette, "floyd-steinberg", 128, null);
		const second = quantizeFrame(source, 16, 16, palette, "floyd-steinberg", 128, null);
		expect([...second.indices]).toEqual([...first.indices]);
	});

	it("routes transparent pixels to the reserved index", () => {
		const pixels = solid(4, 4, [10, 10, 10]);
		pixels[3] = 0;
		const { indices } = quantizeFrame(pixels, 4, 4, palette, "none", 128, 5);
		expect(indices[0]).toBe(5);
		expect(indices[1]).not.toBe(5);
	});
});

describe("GIF file writing", () => {
	it("writes a header a decoder recognises", () => {
		const bytes = encodeGif([{ pixels: quadrants(8), delayMs: 100 }], {
			width: 8,
			height: 8,
			colors: 16,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		expect(String.fromCodePoint(...bytes.slice(0, 6))).toBe("GIF89a");
		expect(bytes.at(-1)).toBe(0x3b);
	});

	it("records the dimensions in the logical screen descriptor", () => {
		const bytes = encodeGif([{ pixels: solid(64, 32, [1, 2, 3]), delayMs: 100 }], {
			width: 64,
			height: 32,
			colors: 4,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		const info = readGifInfo(bytes);
		expect(info.width).toBe(64);
		expect(info.height).toBe(32);
	});

	it("round-trips frame count and delays through our own parser", () => {
		const frames = [
			{ pixels: solid(8, 8, [255, 0, 0]), delayMs: 40 },
			{ pixels: solid(8, 8, [0, 255, 0]), delayMs: 120 },
			{ pixels: solid(8, 8, [0, 0, 255]), delayMs: 200 },
		];
		const bytes = encodeGif(frames, {
			width: 8,
			height: 8,
			colors: 8,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});

		const info = readGifInfo(bytes);
		expect(info.frameCount).toBe(3);
		// GIF stores hundredths, so 40 ms comes back as 40 and 120 as 120.
		expect(info.delaysMs).toEqual([40, 120, 200]);
	});

	it("writes the Netscape block, without which an animation plays once", () => {
		const bytes = encodeGif(
			[
				{ pixels: solid(4, 4, [0, 0, 0]), delayMs: 100 },
				{ pixels: solid(4, 4, [255, 255, 255]), delayMs: 100 },
			],
			{
				width: 4,
				height: 4,
				colors: 4,
				dither: "none",
				loop: 0,
				paletteScope: "global",
				alphaThreshold: 128,
			},
		);

		const text = String.fromCodePoint(...bytes);
		expect(text).toContain("NETSCAPE2.0");
	});

	it("omits the Netscape block for a single frame", () => {
		const bytes = encodeGif([{ pixels: solid(4, 4, [0, 0, 0]), delayMs: 100 }], {
			width: 4,
			height: 4,
			colors: 4,
			dither: "none",
			loop: 0,
			paletteScope: "global",
			alphaThreshold: 128,
		});
		expect(String.fromCodePoint(...bytes)).not.toContain("NETSCAPE");
	});

	it("keeps a per-frame palette smaller in count but larger on disk", () => {
		const frames = Array.from({ length: 8 }, (_, index) => ({
			pixels: solid(32, 32, [index * 30, 255 - index * 30, 128]),
			delayMs: 100,
		}));
		const base = {
			width: 32,
			height: 32,
			colors: 64,
			dither: "none" as const,
			loop: 0,
			alphaThreshold: 128,
		};

		const global = encodeGif(frames, { ...base, paletteScope: "global" });
		const perFrame = encodeGif(frames, { ...base, paletteScope: "per-frame" });

		// The per-frame palette repeats up to 768 bytes on every frame.
		expect(perFrame.length).toBeGreaterThan(global.length);
		expect(readGifInfo(perFrame).frameCount).toBe(8);
	});

	it("refuses to encode nothing", () => {
		expect(() =>
			encodeGif([], {
				width: 4,
				height: 4,
				colors: 4,
				dither: "none",
				loop: 0,
				paletteScope: "global",
				alphaThreshold: 128,
			}),
		).toThrow(/at least one frame/);
	});

	it("reports progress frame by frame", () => {
		const ratios: number[] = [];
		encodeGif(
			Array.from({ length: 5 }, () => ({ pixels: solid(4, 4, [1, 2, 3]), delayMs: 100 })),
			{
				width: 4,
				height: 4,
				colors: 4,
				dither: "none",
				loop: 0,
				paletteScope: "global",
				alphaThreshold: 128,
				onProgress: (ratio) => ratios.push(ratio),
			},
		);
		expect(ratios).toHaveLength(5);
		expect(ratios.at(-1)).toBe(1);
	});
});

describe("reading a GIF header", () => {
	it("rejects a file that is not a GIF", () => {
		expect(() => readGifInfo(new Uint8Array(20))).toThrow(/not a GIF/);
		expect(() => readGifInfo(new Uint8Array(4))).toThrow(/too short/);
	});

	it("normalises the delays players silently rewrite", () => {
		expect(normaliseDelay(0)).toBe(100);
		expect(normaliseDelay(10)).toBe(100);
		expect(normaliseDelay(40)).toBe(40);
	});
});

describe("size estimation", () => {
	it("grows with frames, pixels and palette size", () => {
		const small = estimateGifBytes(10, 100, 100, 64);
		expect(estimateGifBytes(20, 100, 100, 64)).toBeGreaterThan(small);
		expect(estimateGifBytes(10, 200, 200, 64)).toBeGreaterThan(small);
		expect(estimateGifBytes(10, 100, 100, 256)).toBeGreaterThan(small);
	});
});
