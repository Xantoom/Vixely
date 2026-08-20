import type { ImageFormat } from "../document/types.ts";

export const IMAGE_INPUT_EXTENSIONS = [
	".png",
	".jpg",
	".jpeg",
	".webp",
	".avif",
	".gif",
	".bmp",
	".svg",
	".ico",
] as const;

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
	webp: "image/webp",
	avif: "image/avif",
};

export class ImageDecodeError extends Error {
	constructor(
		message: string,
		readonly fileName: string,
	) {
		super(message);
		this.name = "ImageDecodeError";
	}
}

/**
 * Decodes to an `ImageBitmap`.
 *
 * SVG is deliberately routed through an image element inside a blob URL and
 * never inserted into the DOM: an imported SVG can carry script (security §6).
 */
export async function decodeImage(file: File | Blob, name: string): Promise<ImageBitmap> {
	try {
		if (file.type === "image/svg+xml") {
			return await rasteriseSvg(file, name);
		}
		return await createImageBitmap(file, { colorSpaceConversion: "default" });
	} catch (error) {
		throw new ImageDecodeError(error instanceof Error ? error.message : String(error), name);
	}
}

async function rasteriseSvg(file: Blob, name: string): Promise<ImageBitmap> {
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.decoding = "async";
		await new Promise<void>((resolve, reject) => {
			image.addEventListener("load", () => resolve(), { once: true });
			image.addEventListener(
				"error",
				() => reject(new ImageDecodeError("SVG could not be rasterised", name)),
				{ once: true },
			);
			image.src = url;
		});
		const width = image.naturalWidth || 1024;
		const height = image.naturalHeight || 1024;
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (context === null) throw new ImageDecodeError("no 2D context", name);
		context.drawImage(image, 0, 0, width, height);
		return canvas.transferToImageBitmap();
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Encodes rendered pixels. `quality` is ignored by PNG, by design. */
export async function encodeImage(
	pixels: ImageData,
	format: ImageFormat,
	quality: number,
): Promise<Blob> {
	const canvas = new OffscreenCanvas(pixels.width, pixels.height);
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("no 2D context available for encoding");
	context.putImageData(pixels, 0, 0);
	return canvas.convertToBlob({ type: IMAGE_MIME_TYPES[format], quality });
}

/**
 * Probes which output formats this browser can actually produce. AVIF and even
 * WebP encoding are not universal, and a format that silently falls back to
 * PNG is worse than one shown as unavailable.
 */
export async function probeImageEncoders(): Promise<Record<ImageFormat, boolean>> {
	const canvas = new OffscreenCanvas(1, 1);
	const results: Record<string, boolean> = {};
	for (const [format, mime] of Object.entries(IMAGE_MIME_TYPES)) {
		try {
			const blob = await canvas.convertToBlob({ type: mime });
			results[format] = blob.type === mime;
		} catch {
			results[format] = false;
		}
	}
	return results as Record<ImageFormat, boolean>;
}

/** Suggested output name: the source stem plus the chosen extension. */
export function outputFileName(sourceName: string, format: ImageFormat): string {
	const stem = sourceName.replace(/\.[^.]+$/, "");
	const extension = format === "jpeg" ? "jpg" : format;
	return `${stem}.${extension}`;
}
