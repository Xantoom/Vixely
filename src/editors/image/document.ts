/**
 * The image editing document: everything the user changed, never the pixels themselves.
 *
 * Order of operations, shared by the preview and the export:
 * 1. orient the source (rotation, then mirror, as the user sees it),
 * 2. crop the oriented image,
 * 3. apply the adjustments,
 * 4. scale to the export size.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	x: number;
	y: number;
}

/** Each adjustment goes from -100 to 100; 0 leaves the image untouched. */
export interface Adjustments {
	exposure: number;
	brightness: number;
	contrast: number;
	saturation: number;
	temperature: number;
	tint: number;
}

export type AdjustmentId = keyof Adjustments;

export interface ImageDoc {
	rotation: Rotation;
	flipX: boolean;
	flipY: boolean;
	/** Crop in oriented image pixels. Null keeps the whole image. */
	crop: Rect | null;
	adjust: Adjustments;
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
	exposure: 0,
	brightness: 0,
	contrast: 0,
	saturation: 0,
	temperature: 0,
	tint: 0,
};

export const ADJUSTMENT_IDS: AdjustmentId[] = [
	'exposure',
	'brightness',
	'contrast',
	'saturation',
	'temperature',
	'tint',
];

export function createImageDoc(): ImageDoc {
	return { rotation: 0, flipX: false, flipY: false, crop: null, adjust: NEUTRAL_ADJUSTMENTS };
}

export function isAdjusted(adjust: Adjustments): boolean {
	return ADJUSTMENT_IDS.some((id) => adjust[id] !== 0);
}

/**
 * Always returns a plain object: an ImageBitmap exposes its size through prototype getters, which
 * object spread would silently drop.
 */
export function orientedSize(source: Size, rotation: Rotation): Size {
	return rotation === 90 || rotation === 270
		? { width: source.height, height: source.width }
		: { width: source.width, height: source.height };
}

/** The part of the oriented image that ends up in the output. */
export function effectiveCrop(doc: ImageDoc, source: Size): Rect {
	const { width, height } = orientedSize(source, doc.rotation);
	return doc.crop ?? { x: 0, y: 0, width, height };
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function rotate(doc: ImageDoc, source: Size, direction: 1 | -1): ImageDoc {
	const rotation = ROTATIONS[(ROTATIONS.indexOf(doc.rotation) + direction + 4) % 4] ?? 0;
	const before = orientedSize(source, doc.rotation);
	// The crop turns with the image, so the same area stays selected.
	const crop = doc.crop && rotateRect(doc.crop, before, direction);
	// A quarter turn swaps the mirror axes as the user sees them.
	return { ...doc, rotation, crop, flipX: doc.flipY, flipY: doc.flipX };
}

function rotateRect(rect: Rect, bounds: Size, direction: 1 | -1): Rect {
	return direction === 1
		? { x: bounds.height - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }
		: { x: rect.y, y: bounds.width - rect.x - rect.width, width: rect.height, height: rect.width };
}

export function flip(doc: ImageDoc, source: Size, axis: 'x' | 'y'): ImageDoc {
	const bounds = orientedSize(source, doc.rotation);
	const crop = doc.crop && {
		...doc.crop,
		x: axis === 'x' ? bounds.width - doc.crop.x - doc.crop.width : doc.crop.x,
		y: axis === 'y' ? bounds.height - doc.crop.y - doc.crop.height : doc.crop.y,
	};
	return axis === 'x' ? { ...doc, flipX: !doc.flipX, crop } : { ...doc, flipY: !doc.flipY, crop };
}

/** Maps a point of the oriented image (normalised 0 to 1) back to the source texture. */
function orientedToSource(doc: ImageDoc, u: number, v: number): [number, number] {
	const x = doc.flipX ? 1 - u : u;
	const y = doc.flipY ? 1 - v : v;
	switch (doc.rotation) {
		case 90:
			return [y, 1 - x];
		case 180:
			return [1 - x, 1 - y];
		case 270:
			return [1 - y, x];
		case 0:
			return [x, y];
	}
}

/**
 * Affine transform from output coordinates (0 to 1, top left origin) to source texture
 * coordinates, as a column-major 3×3 matrix ready for a WebGL uniform.
 */
export function sourceTransform(doc: ImageDoc, source: Size, region: Rect): Float32Array {
	const bounds = orientedSize(source, doc.rotation);
	const at = (u: number, v: number) =>
		orientedToSource(
			doc,
			(region.x + u * region.width) / bounds.width,
			(region.y + v * region.height) / bounds.height,
		);
	const [x0, y0] = at(0, 0);
	const [x1, y1] = at(1, 0);
	const [x2, y2] = at(0, 1);
	return new Float32Array([x1 - x0, y1 - y0, 0, x2 - x0, y2 - y0, 0, x0, y0, 1]);
}

/** Output size once scaled to fit `limit` on its longest side, never upscaled. */
export function fitWithin(size: Size, limit: number): Size {
	const scale = Math.min(1, limit / Math.max(size.width, size.height));
	return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}
