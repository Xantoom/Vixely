import { describe, expect, it } from "vitest";
import { createImageDocument, NEUTRAL_FILTERS, type ImageDocument } from "~/core/document";
import { createTextLayer, RenderGraph, type RenderSpec } from "~/core/render";
import { renderTextLayers } from "~/core/render";

/**
 * Proves I1: the preview and the export are the same graph.
 *
 * The two paths genuinely differ in the code — the preview draws into a canvas
 * bound to the DOM, the export builds a second graph on an OffscreenCanvas and
 * reads pixels back — so the comparison is not tautological. It is also where a
 * row-order mistake between `readPixels` (bottom-up) and `ImageData` (top-down)
 * would surface.
 *
 * Thresholds from docs/plan/04-testing.md §6. Strict byte equality is the wrong
 * assertion: GPU output differs slightly across drivers and would go red in CI
 * for reasons that have nothing to do with the pipeline.
 */

const MAX_CHANNEL_DELTA = 8;
const TYPICAL_CHANNEL_DELTA = 2;
const MAX_OUTLIER_RATIO = 0.005;

const WIDTH = 64;
const HEIGHT = 48;

/** A source with structure in both axes, so a flip cannot hide in the noise. */
function detailedSource(): ImageData {
	const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			const index = (y * WIDTH + x) * 4;
			const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
			data[index] = Math.round((x / (WIDTH - 1)) * 255);
			data[index + 1] = Math.round((y / (HEIGHT - 1)) * 255);
			data[index + 2] = checker ? 220 : 40;
			data[index + 3] = 255;
		}
	}
	return new ImageData(data, WIDTH, HEIGHT);
}

/** A non-trivial edit: filters, geometry and a text layer all at once. */
function editedDocument(): ImageDocument {
	const base = createImageDocument(
		{ id: "fixture", name: "detailed.png", byteLength: 0, mimeType: "image/png" },
		WIDTH,
		HEIGHT,
	);
	return {
		...base,
		crop: { x: 4, y: 3, width: 48, height: 36 },
		rotation: 90,
		flipHorizontal: true,
		filters: {
			...NEUTRAL_FILTERS,
			contrast: 0.35,
			saturation: -0.2,
			exposure: 0.4,
			temperature: 0.15,
			vignette: 0.3,
			gamma: 1.2,
		},
		textLayers: [{ ...createTextLayer("Vixely", 6, 8, "text-1"), fontSize: 14 }],
	};
}

function specFrom(edited: ImageDocument, bitmap: ImageBitmap): RenderSpec {
	return {
		source: { kind: "bitmap", bitmap },
		sourceWidth: edited.sourceWidth,
		sourceHeight: edited.sourceHeight,
		crop: edited.crop,
		rotation: edited.rotation,
		flipHorizontal: edited.flipHorizontal,
		flipVertical: edited.flipVertical,
		resize: edited.resize,
		filters: edited.filters,
		textLayers: edited.textLayers,
		overlay: null,
		bypassFilters: false,
	};
}

/** Mirrors what the editor does for both paths: same spec, same overlay. */
function renderThrough(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	spec: RenderSpec,
): { pixels: Uint8ClampedArray; width: number; height: number } {
	const graph = new RenderGraph(canvas);
	try {
		const size = graph.outputSize(spec);
		const textCanvas = renderTextLayers(spec.textLayers, size.width, size.height);
		const rendered = graph.render(
			textCanvas === null ? spec : { ...spec, overlay: { kind: "canvas", canvas: textCanvas } },
		);
		return { pixels: graph.readPixels(rendered), ...rendered };
	} finally {
		graph.dispose();
	}
}

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
	let outliers = 0;
	let maxDelta = 0;
	let beyondTypical = 0;
	const samples = a.length / 4;

	for (let index = 0; index < a.length; index += 4) {
		for (let channel = 0; channel < 3; channel++) {
			const delta = Math.abs(a[index + channel]! - b[index + channel]!);
			maxDelta = Math.max(maxDelta, delta);
			if (delta > TYPICAL_CHANNEL_DELTA) {
				beyondTypical++;
				break;
			}
		}
		if (Math.abs(a[index]! - b[index]!) > MAX_CHANNEL_DELTA) outliers++;
	}

	return {
		maxDelta,
		outlierRatio: outliers / samples,
		beyondTypicalRatio: beyondTypical / samples,
	};
}

describe("preview and export are the same pipeline (I1)", () => {
	it("produces perceptually identical pixels through both paths", async () => {
		const bitmap = await createImageBitmap(detailedSource());
		const spec = specFrom(editedDocument(), bitmap);

		// Preview path: a canvas attached to the document.
		const onScreen = document.createElement("canvas");
		document.body.append(onScreen);
		const preview = renderThrough(onScreen, spec);

		// Export path: a fresh graph on an OffscreenCanvas, read back to pixels.
		const exported = renderThrough(new OffscreenCanvas(1, 1), spec);
		onScreen.remove();

		expect(exported.width).toBe(preview.width);
		expect(exported.height).toBe(preview.height);

		const diff = compare(preview.pixels, exported.pixels);
		expect(diff.maxDelta).toBeLessThanOrEqual(MAX_CHANNEL_DELTA);
		expect(diff.outlierRatio).toBeLessThanOrEqual(MAX_OUTLIER_RATIO);
		expect(diff.beyondTypicalRatio).toBeLessThanOrEqual(MAX_OUTLIER_RATIO);
	});

	it("would catch a filter applied twice", async () => {
		const bitmap = await createImageBitmap(detailedSource());
		const edited = editedDocument();
		const once = renderThrough(new OffscreenCanvas(1, 1), specFrom(edited, bitmap));

		// Doubling one adjustment is the shape of the bug the previous iteration
		// shipped. The thresholds above must reject it by a wide margin.
		const twice = renderThrough(
			new OffscreenCanvas(1, 1),
			specFrom(
				{
					...edited,
					filters: { ...edited.filters, contrast: edited.filters.contrast * 2 },
				},
				bitmap,
			),
		);

		const diff = compare(once.pixels, twice.pixels);
		expect(diff.maxDelta).toBeGreaterThan(MAX_CHANNEL_DELTA);
		expect(diff.beyondTypicalRatio).toBeGreaterThan(MAX_OUTLIER_RATIO * 10);
	});

	it("survives a round trip through ImageData without flipping rows", async () => {
		const bitmap = await createImageBitmap(detailedSource());
		const spec = specFrom(editedDocument(), bitmap);
		const exported = renderThrough(new OffscreenCanvas(1, 1), spec);

		// Re-encoding through a 2D canvas is what the export actually does; the
		// result must come back with the same orientation it went in with.
		const buffer = new Uint8ClampedArray(exported.pixels);
		const image = new ImageData(buffer, exported.width, exported.height);
		const canvas = new OffscreenCanvas(exported.width, exported.height);
		const context = canvas.getContext("2d");
		context?.putImageData(image, 0, 0);
		const roundTripped = context?.getImageData(0, 0, exported.width, exported.height);

		expect(roundTripped).toBeDefined();
		expect(Array.from(roundTripped!.data.slice(0, 64))).toEqual(
			Array.from(exported.pixels.slice(0, 64)),
		);
	});
});
