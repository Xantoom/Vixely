import { describe, expect, it } from 'vitest';
import { dragCrop, fitRatio } from './crop';
import {
	adaptDoc,
	createImageDoc,
	effectiveCrop,
	fitWithin,
	flip,
	type ImageDoc,
	orientedSize,
	rotate,
	type Size,
	sourceTransform,
} from './document';

const source = { width: 400, height: 200 };

/** Applies the column-major transform to an output point. */
function apply(m: Float32Array, u: number, v: number): [number, number] {
	return [
		Number(((m[0] ?? 0) * u + (m[3] ?? 0) * v + (m[6] ?? 0)).toFixed(4)),
		Number(((m[1] ?? 0) * u + (m[4] ?? 0) * v + (m[7] ?? 0)).toFixed(4)),
	];
}

describe('image document', () => {
	it('returns plain sizes, even from objects with getters', () => {
		// Like an ImageBitmap: the size lives on the prototype, not on the object.
		class BitmapLike implements Size {
			get width() {
				return 640;
			}
			get height() {
				return 480;
			}
		}
		expect({ ...orientedSize(new BitmapLike(), 0) }).toEqual({ width: 640, height: 480 });
	});

	it('swaps dimensions on quarter turns', () => {
		expect(orientedSize(source, 90)).toEqual({ width: 200, height: 400 });
		expect(orientedSize(source, 180)).toEqual(source);
	});

	it('maps the output to the source texture without changes', () => {
		const doc = createImageDoc();
		const m = sourceTransform(doc, source, effectiveCrop(doc, source));
		expect(apply(m, 0, 0)).toEqual([0, 0]);
		expect(apply(m, 1, 1)).toEqual([1, 1]);
	});

	it('maps a clockwise quarter turn', () => {
		const doc = rotate(createImageDoc(), source, 1);
		const m = sourceTransform(doc, source, effectiveCrop(doc, source));
		// The top left of the output comes from the bottom left of the source.
		expect(apply(m, 0, 0)).toEqual([0, 1]);
		// The top right of the output comes from the top left of the source.
		expect(apply(m, 1, 0)).toEqual([0, 0]);
	});

	it('maps a horizontal mirror and a crop', () => {
		const doc = { ...flip(createImageDoc(), source, 'x'), crop: { x: 0, y: 0, width: 200, height: 100 } };
		const m = sourceTransform(doc, source, effectiveCrop(doc, source));
		expect(apply(m, 0, 0)).toEqual([1, 0]);
		expect(apply(m, 1, 1)).toEqual([0.5, 0.5]);
	});

	it('keeps the same area selected when rotating a crop', () => {
		let doc: ImageDoc = { ...createImageDoc(), crop: { x: 300, y: 20, width: 80, height: 60 } };
		doc = rotate(doc, source, 1);
		expect(doc.crop).toEqual({ x: 120, y: 300, width: 60, height: 80 });
		doc = rotate(doc, source, -1);
		expect(doc.crop).toEqual({ x: 300, y: 20, width: 80, height: 60 });
	});

	it('mirrors the crop with the image', () => {
		const doc = flip({ ...createImageDoc(), crop: { x: 10, y: 0, width: 50, height: 50 } }, source, 'x');
		expect(doc.crop?.x).toBe(340);
	});

	it('fits an export size without upscaling', () => {
		expect(fitWithin({ width: 4000, height: 3000 }, 1920)).toEqual({ width: 1920, height: 1440 });
		expect(fitWithin({ width: 800, height: 600 }, 1920)).toEqual({ width: 800, height: 600 });
	});
});

describe('batch', () => {
	const from = { width: 4000, height: 3000 };

	it('keeps a square crop square and centred on another image', () => {
		const doc = { ...createImageDoc(), crop: { x: 500, y: 0, width: 3000, height: 3000 } };
		const adapted = adaptDoc(doc, from, { width: 1920, height: 1080 }, 1);
		expect(adapted.crop).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
	});

	it('keeps a free crop at the same relative place', () => {
		const doc = { ...createImageDoc(), crop: { x: 400, y: 300, width: 2000, height: 1500 } };
		expect(adaptDoc(doc, from, { width: 2000, height: 1500 }, null).crop).toEqual({
			x: 200,
			y: 150,
			width: 1000,
			height: 750,
		});
	});

	it('leaves documents without a crop untouched', () => {
		const doc = createImageDoc();
		expect(adaptDoc(doc, from, { width: 10, height: 10 }, 1)).toBe(doc);
	});
});

describe('crop', () => {
	const bounds = { width: 1000, height: 500 };
	const full = { x: 0, y: 0, ...bounds };

	it('fits a ratio in the centre', () => {
		expect(fitRatio(full, 1)).toEqual({ x: 250, y: 0, width: 500, height: 500 });
	});

	it('moves inside the image only', () => {
		const start = { x: 100, y: 100, width: 200, height: 200 };
		expect(dragCrop(start, 'move', 5000, -5000, bounds, null)).toEqual({ x: 800, y: 0, width: 200, height: 200 });
	});

	it('resizes freely from a corner', () => {
		const start = { x: 100, y: 100, width: 200, height: 200 };
		expect(dragCrop(start, 'se', 50, 20, bounds, null)).toEqual({ x: 100, y: 100, width: 250, height: 220 });
	});

	it('keeps the ratio from a corner, anchored on the opposite corner', () => {
		const start = { x: 100, y: 100, width: 200, height: 100 };
		const rect = dragCrop(start, 'nw', -100, -10, bounds, 2);
		expect(rect.width / rect.height).toBeCloseTo(2, 1);
		expect(rect.x + rect.width).toBe(300);
		expect(rect.y + rect.height).toBe(200);
	});

	it('never leaves the image with a ratio', () => {
		const start = { x: 800, y: 300, width: 100, height: 100 };
		const rect = dragCrop(start, 'se', 900, 900, bounds, 1);
		expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
		expect(rect.y + rect.height).toBeLessThanOrEqual(500);
		expect(rect.width).toBe(rect.height);
	});
});
