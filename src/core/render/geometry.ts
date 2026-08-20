import type { CropRegion, ResizeSpec, Rotation } from "../document/types.ts";
import type { OutputSize } from "./types.ts";

/** Size after crop, rotation and resize — shared by preview, export and UI. */
export function computeOutputSize(
	sourceWidth: number,
	sourceHeight: number,
	crop: CropRegion | null,
	rotation: Rotation,
	resize: Pick<ResizeSpec, "width" | "height"> | null,
): OutputSize {
	const croppedWidth = crop?.width ?? sourceWidth;
	const croppedHeight = crop?.height ?? sourceHeight;
	const swapped = rotation === 90 || rotation === 270;
	const rotatedWidth = swapped ? croppedHeight : croppedWidth;
	const rotatedHeight = swapped ? croppedWidth : croppedHeight;

	if (resize === null) {
		return {
			width: Math.max(1, Math.round(rotatedWidth)),
			height: Math.max(1, Math.round(rotatedHeight)),
		};
	}
	return {
		width: Math.max(1, Math.round(resize.width)),
		height: Math.max(1, Math.round(resize.height)),
	};
}

/** Clamps a crop rectangle inside the source and keeps it at least 1px wide. */
export function clampCrop(crop: CropRegion, sourceWidth: number, sourceHeight: number): CropRegion {
	const x = Math.min(Math.max(0, Math.round(crop.x)), Math.max(0, sourceWidth - 1));
	const y = Math.min(Math.max(0, Math.round(crop.y)), Math.max(0, sourceHeight - 1));
	return {
		x,
		y,
		width: Math.max(1, Math.min(Math.round(crop.width), sourceWidth - x)),
		height: Math.max(1, Math.min(Math.round(crop.height), sourceHeight - y)),
	};
}

/** Resize keeping the aspect ratio, driven by whichever side the user typed. */
export function fitAspect(
	sourceWidth: number,
	sourceHeight: number,
	requested: { width?: number; height?: number },
): OutputSize {
	const ratio = sourceWidth / sourceHeight;
	if (requested.width !== undefined && requested.height !== undefined) {
		return { width: Math.round(requested.width), height: Math.round(requested.height) };
	}
	if (requested.width !== undefined) {
		return {
			width: Math.round(requested.width),
			height: Math.max(1, Math.round(requested.width / ratio)),
		};
	}
	if (requested.height !== undefined) {
		return {
			width: Math.max(1, Math.round(requested.height * ratio)),
			height: Math.round(requested.height),
		};
	}
	return { width: sourceWidth, height: sourceHeight };
}

/** Scale that makes the content fit a viewport, never above 1:1 by default. */
export function fitScale(
	contentWidth: number,
	contentHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	allowUpscale = false,
): number {
	if (contentWidth <= 0 || contentHeight <= 0) return 1;
	const scale = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight);
	return allowUpscale ? scale : Math.min(1, scale);
}
