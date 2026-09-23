import type { Rect, Size } from './document';

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Smallest crop, in image pixels. */
export const MIN_CROP = 16;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function round(rect: Rect): Rect {
	return {
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		width: Math.round(rect.width),
		height: Math.round(rect.height),
	};
}

/** Largest rectangle of the given ratio (width / height), centred in `bounds`. */
export function fitRatio(bounds: Rect, ratio: number): Rect {
	let width = bounds.width;
	let height = width / ratio;
	if (height > bounds.height) {
		height = bounds.height;
		width = height * ratio;
	}
	return round({
		x: bounds.x + (bounds.width - width) / 2,
		y: bounds.y + (bounds.height - height) / 2,
		width,
		height,
	});
}

/** Keeps a rectangle inside the image, shrinking it only when it is larger than the image. */
export function containRect(rect: Rect, bounds: Size): Rect {
	const width = clamp(rect.width, MIN_CROP, bounds.width);
	const height = clamp(rect.height, MIN_CROP, bounds.height);
	return round({
		x: clamp(rect.x, 0, bounds.width - width),
		y: clamp(rect.y, 0, bounds.height - height),
		width,
		height,
	});
}

/**
 * Applies a drag of (dx, dy) image pixels on a crop handle. With a ratio, corners keep the
 * opposite corner fixed and edges keep the rectangle centred on the other axis.
 */
export function dragCrop(
	start: Rect,
	handle: Handle,
	dx: number,
	dy: number,
	bounds: Size,
	ratio: number | null,
): Rect {
	if (handle === 'move') {
		return round({
			...start,
			x: clamp(start.x + dx, 0, bounds.width - start.width),
			y: clamp(start.y + dy, 0, bounds.height - start.height),
		});
	}

	let left = start.x;
	let top = start.y;
	let right = start.x + start.width;
	let bottom = start.y + start.height;
	if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP);
	if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, bounds.width);
	if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP);
	if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, bounds.height);

	if (ratio === null) return round({ x: left, y: top, width: right - left, height: bottom - top });

	let width = right - left;
	let height = bottom - top;
	const corner = handle.length === 2;
	if (corner) {
		if (width / height > ratio) width = height * ratio;
		else height = width / ratio;
		// Room left towards the dragged corner, from the fixed opposite corner.
		const roomX = handle.includes('w') ? right : bounds.width - left;
		const roomY = handle.includes('n') ? bottom : bounds.height - top;
		const scale = Math.min(1, roomX / width, roomY / height);
		width *= scale;
		height *= scale;
		if (handle.includes('w')) left = right - width;
		else right = left + width;
		if (handle.includes('n')) top = bottom - height;
		else bottom = top + height;
		return round({ x: left, y: top, width: right - left, height: bottom - top });
	}

	if (handle === 'e' || handle === 'w') {
		height = Math.min(width / ratio, bounds.height);
		width = height * ratio;
		const centre = start.y + start.height / 2;
		const x = handle === 'w' ? right - width : left;
		return containRect({ x, y: centre - height / 2, width, height }, bounds);
	}

	width = Math.min(height * ratio, bounds.width);
	height = width / ratio;
	const centre = start.x + start.width / 2;
	const y = handle === 'n' ? bottom - height : top;
	return containRect({ x: centre - width / 2, y, width, height }, bounds);
}
