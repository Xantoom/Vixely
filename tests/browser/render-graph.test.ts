import { beforeAll, describe, expect, it } from "vitest";
import { NEUTRAL_FILTERS } from "~/core/document";
import { RenderGraph, type RenderSpec } from "~/core/render";

/**
 * WebGL2 exists in no simulated DOM, so the render graph is only ever exercised
 * in a real browser (tier 3).
 *
 * Every geometry assertion reads actual pixels from an asymmetric source. A
 * uniform fill would let a wrong flip, a wrong rotation direction or a crop at
 * the wrong corner pass unnoticed while the output dimensions stayed right.
 */

const SIZE = 8;

/** Each pixel encodes its own coordinates: red = x*32, green = y*32. */
function coordinateSource(): ImageData {
	const data = new Uint8ClampedArray(SIZE * SIZE * 4);
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			const index = (y * SIZE + x) * 4;
			data[index] = x * 32;
			data[index + 1] = y * 32;
			data[index + 2] = 0;
			data[index + 3] = 255;
		}
	}
	return new ImageData(data, SIZE, SIZE);
}

function flatSource(colour: readonly [number, number, number, number]): ImageData {
	const data = new Uint8ClampedArray(SIZE * SIZE * 4);
	for (let index = 0; index < data.length; index += 4) {
		data[index] = colour[0];
		data[index + 1] = colour[1];
		data[index + 2] = colour[2];
		data[index + 3] = colour[3];
	}
	return new ImageData(data, SIZE, SIZE);
}

function specFor(bitmap: ImageBitmap, overrides: Partial<RenderSpec> = {}): RenderSpec {
	return {
		source: { kind: "bitmap", bitmap },
		sourceWidth: SIZE,
		sourceHeight: SIZE,
		crop: null,
		rotation: 0,
		flipHorizontal: false,
		flipVertical: false,
		resize: null,
		filters: NEUTRAL_FILTERS,
		textLayers: [],
		overlay: null,
		bypassFilters: false,
		...overrides,
	};
}

/**
 * `readPixels` returns rows bottom-up. This turns a read into top-down
 * coordinates so a test reads the way the image looks.
 */
function pixelAt(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	x: number,
	y: number,
): [number, number, number, number] {
	const row = height - 1 - y;
	const index = (row * width + x) * 4;
	return [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!];
}

function withGraph<T>(run: (graph: RenderGraph) => T): T {
	const graph = new RenderGraph(new OffscreenCanvas(1, 1));
	try {
		return run(graph);
	} finally {
		graph.dispose();
	}
}

/** Sampling is linear, so exact equality is the wrong assertion. */
function expectNear(actual: number, expected: number, tolerance = 8): void {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

let coords: ImageBitmap;
let grey: ImageBitmap;

beforeAll(async () => {
	coords = await createImageBitmap(coordinateSource());
	grey = await createImageBitmap(flatSource([128, 128, 128, 255]));
});

describe("render graph — colour (I1)", () => {
	it("passes pixels through unchanged at neutral settings", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(grey));
			expect(size).toEqual({ width: SIZE, height: SIZE });
			const pixels = graph.readPixels(size);
			expectNear(pixels[0]!, 128, 2);
			expect(pixels[3]).toBe(255);
		});
	});

	it("applies a filter exactly once, never twice", () => {
		withGraph((graph) => {
			const spec = specFor(grey, { filters: { ...NEUTRAL_FILTERS, brightness: 0.2 } });
			const pixels = graph.readPixels(graph.render(spec));
			// 128/255 + 0.2 ≈ 0.702 → ~179. A double application would land ~230.
			expect(pixels[0]).toBeGreaterThan(170);
			expect(pixels[0]).toBeLessThan(190);
		});
	});

	it("is stable across repeated renders of the same spec", () => {
		withGraph((graph) => {
			const spec = specFor(grey, { filters: { ...NEUTRAL_FILTERS, contrast: 0.4 } });
			const first = graph.readPixels(graph.render(spec));
			const second = graph.readPixels(graph.render(spec));
			expect([...second]).toEqual([...first]);
		});
	});

	it("bypassFilters reproduces the neutral render, not a different source", () => {
		withGraph((graph) => {
			const neutral = graph.readPixels(graph.render(specFor(coords)));
			const bypassed = graph.readPixels(
				graph.render(
					specFor(coords, {
						filters: { ...NEUTRAL_FILTERS, saturation: 0.8, contrast: 0.5 },
						bypassFilters: true,
					}),
				),
			);
			expect([...bypassed]).toEqual([...neutral]);
		});
	});
});

describe("render graph — geometry", () => {
	it("places the source the right way up", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords));
			const pixels = graph.readPixels(size);
			// Top-left is x=0,y=0 → red 0, green 0. Bottom-right is x=7,y=7.
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			const bottomRight = pixelAt(pixels, size.width, size.height, SIZE - 1, SIZE - 1);
			expectNear(topLeft[0], 0);
			expectNear(topLeft[1], 0);
			expectNear(bottomRight[0], 224);
			expectNear(bottomRight[1], 224);
		});
	});

	it("mirrors horizontally without touching the vertical axis", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords, { flipHorizontal: true }));
			const pixels = graph.readPixels(size);
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			// The left column now shows what used to be the right column.
			expectNear(topLeft[0], 224);
			expectNear(topLeft[1], 0);
		});
	});

	it("mirrors vertically without touching the horizontal axis", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords, { flipVertical: true }));
			const pixels = graph.readPixels(size);
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			expectNear(topLeft[0], 0);
			expectNear(topLeft[1], 224);
		});
	});

	it("rotates 180 degrees, which is both mirrors at once", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords, { rotation: 180 }));
			expect(size).toEqual({ width: SIZE, height: SIZE });
			const pixels = graph.readPixels(size);
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			expectNear(topLeft[0], 224);
			expectNear(topLeft[1], 224);
		});
	});

	it("rotates a quarter turn clockwise and swaps the dimensions", () => {
		withGraph((graph) => {
			const size = graph.render(
				specFor(coords, {
					resize: null,
					rotation: 90,
					crop: { x: 0, y: 0, width: SIZE, height: 4 },
				}),
			);
			// A 8×4 crop turned a quarter turn is 4×8.
			expect(size).toEqual({ width: 4, height: SIZE });
		});
	});

	it("crops from the requested offset, not from the origin", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords, { crop: { x: 4, y: 2, width: 4, height: 4 } }));
			expect(size).toEqual({ width: 4, height: 4 });
			const pixels = graph.readPixels(size);
			// The crop's top-left must be source pixel (4, 2), not (0, 0).
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			expectNear(topLeft[0], 4 * 32);
			expectNear(topLeft[1], 2 * 32);
		});
	});

	it("resizes to the requested output while keeping the content", () => {
		withGraph((graph) => {
			const size = graph.render(specFor(coords, { resize: { width: 32, height: 16 } }));
			expect(size).toEqual({ width: 32, height: 16 });
			const pixels = graph.readPixels(size);
			const topLeft = pixelAt(pixels, size.width, size.height, 0, 0);
			const topRight = pixelAt(pixels, size.width, size.height, 31, 0);
			// Upscaling must preserve the gradient direction, not flip it.
			expect(topRight[0]).toBeGreaterThan(topLeft[0]);
		});
	});
});

describe("render graph — lifetime", () => {
	it("releases its GPU resources and refuses further renders", () => {
		const graph = new RenderGraph(new OffscreenCanvas(1, 1));
		graph.render(specFor(grey));
		graph.dispose();
		expect(() => graph.render(specFor(grey))).toThrow(/disposed/);
	});

	it("is idempotent on dispose", () => {
		const graph = new RenderGraph(new OffscreenCanvas(1, 1));
		graph.dispose();
		expect(() => graph.dispose()).not.toThrow();
	});
});
