import { drawOverlays, loadOverlayAssets } from '@/editor/overlays/draw';
import { encodeImage } from '@/media/image-codec';
import { encodeBmp, encodeTiff, ICO_SIZES, jpegQuality, packIco } from '@/media/image-formats';
import type { PhotoMetadata } from '@/media/probe';
import { download, isPickerCancel, outputName } from '@/media/save';
import { effectiveCrop, fitWithin, type ImageDoc, type Size } from './document';
import { ImageRenderer } from './renderer';
import type { ExportSettings, ImageFormat } from './store';

export const FORMAT_INFO: Record<ImageFormat, { mime: string; extension: string; alpha: boolean }> = {
	jpeg: { mime: 'image/jpeg', extension: 'jpg', alpha: false },
	png: { mime: 'image/png', extension: 'png', alpha: true },
	webp: { mime: 'image/webp', extension: 'webp', alpha: true },
	avif: { mime: 'image/avif', extension: 'avif', alpha: true },
	jxl: { mime: 'image/jxl', extension: 'jxl', alpha: true },
	bmp: { mime: 'image/bmp', extension: 'bmp', alpha: true },
	tiff: { mime: 'image/tiff', extension: 'tif', alpha: true },
	ico: { mime: 'image/x-icon', extension: 'ico', alpha: true },
};

const IMAGE_FORMATS = Object.keys(FORMAT_INFO).filter((key): key is ImageFormat => Object.hasOwn(FORMAT_INFO, key));

/** Formats that carry EXIF when exported. */
export function keepsMetadata(format: ImageFormat): boolean {
	return format === 'jpeg' || format === 'png' || format === 'avif' || format === 'jxl';
}

/**
 * Export settings matching the file as it came: its own format (HEIC, which can't be written,
 * becomes JPEG; a still GIF becomes PNG) and, for a JPEG, the quality it was saved at.
 */
export async function sourceExportSettings(file: File, format: string): Promise<Partial<ExportSettings>> {
	if (format === 'jpeg') {
		const quality = jpegQuality(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
		return { format: 'jpeg', ...(quality !== null && { quality }) };
	}
	if (format === 'heic') return { format: 'jpeg', quality: 90 };
	if (format === 'webp') return { format: (await canEncodeWebp()) ? 'webp' : 'png' };
	if (format === 'tif') return { format: 'tiff' };
	const same = IMAGE_FORMATS.find((candidate) => candidate === format);
	if (same) return { format: same };
	return { format: 'png' };
}

/** Whether the quality setting applies, given the other settings. */
export function usesQuality(settings: ExportSettings): boolean {
	if (settings.format === 'png') return settings.pngLossy;
	return settings.format !== 'bmp' && settings.format !== 'tiff' && settings.format !== 'ico';
}

/** rav1e speed: 8 keeps a 12 MP photo within seconds, 4 finds noticeably smaller files. */
const AVIF_SPEED = { fast: 8, best: 4 } as const;
/** libjxl's default effort is 7; 5 is close in size and much faster in WebAssembly. */
const JXL_EFFORT = 5;

let webpSupport: Promise<boolean> | null = null;

/** WebP goes through the browser's encoder. Browsers silently fall back to PNG when they lack one. */
export async function canEncodeWebp(): Promise<boolean> {
	webpSupport ??= new OffscreenCanvas(1, 1)
		.convertToBlob({ type: 'image/webp' })
		.then((blob) => blob.type === 'image/webp')
		.catch(() => false);
	return webpSupport;
}

export function outputSize(doc: ImageDoc, source: Size, settings: ExportSettings): Size {
	const crop = effectiveCrop(doc, source);
	if (settings.exact) return settings.exact;
	return settings.longestSide ? fitWithin(crop, settings.longestSide) : { width: crop.width, height: crop.height };
}

function exifFor(settings: ExportSettings, photo: PhotoMetadata | null): Uint8Array {
	if (!photo || settings.metadata === 'none') return new Uint8Array();
	return settings.metadata === 'all' ? photo.exifFull : photo.exifWithoutLocation;
}

/**
 * The picture at `size`, drawn by the same renderer as the preview, its text and stickers by the
 * same code as the preview's. Gives a canvas for the browser's encoders and straight RGBA pixels,
 * rows from the top, for ours.
 */
async function renderPicture(
	source: ImageBitmap,
	doc: ImageDoc,
	size: Size,
	opaque: boolean,
): Promise<{ canvas: OffscreenCanvas; rgba: Uint8Array }> {
	const canvas = new OffscreenCanvas(size.width, size.height);
	const renderer = new ImageRenderer(canvas);
	const region = effectiveCrop(doc, source);
	renderer.setSource(source);
	try {
		if (doc.overlays.length === 0) {
			// Read straight from WebGL: exact values, even for see-through pixels.
			renderer.render(doc, { region, opaque, flipY: true });
			const rgba = renderer.readPixels();
			renderer.render(doc, { region, opaque });
			return { canvas, rgba };
		}
		renderer.render(doc, { region, opaque });
		const composite = new OffscreenCanvas(size.width, size.height);
		const context = composite.getContext('2d');
		if (!context) throw new Error('No 2D canvas');
		context.drawImage(canvas, 0, 0);
		await loadOverlayAssets(doc.overlays);
		drawOverlays(context, doc.overlays, size);
		const rgba = new Uint8Array(context.getImageData(0, 0, size.width, size.height).data.buffer);
		return { canvas: composite, rgba };
	} finally {
		renderer.dispose();
	}
}

/**
 * Renders the document at export size, then encodes it: jpegli, PNG, AVIF and JPEG XL in the codec
 * worker, WebP with the browser, BMP, TIFF and ICO here.
 */
export async function exportImage(
	source: ImageBitmap,
	doc: ImageDoc,
	settings: ExportSettings,
	photo: PhotoMetadata | null,
): Promise<Blob> {
	const size = outputSize(doc, source, settings);
	const { width, height } = size;
	const info = FORMAT_INFO[settings.format];
	if (settings.format === 'ico') return exportIco(source, doc, size);

	const picture = await renderPicture(source, doc, size, !info.alpha);
	if (settings.format === 'webp')
		return picture.canvas.convertToBlob({ type: info.mime, quality: settings.quality / 100 });
	const { rgba } = picture;
	if (settings.format === 'bmp') return new Blob([encodeBmp(rgba, width, height).slice()], { type: info.mime });
	if (settings.format === 'tiff') return new Blob([encodeTiff(rgba, width, height).slice()], { type: info.mime });

	const base = {
		op: 'encode',
		rgba,
		width,
		height,
		quality: settings.quality,
		exif: exifFor(settings, photo),
	} as const;
	const bytes = await (settings.format === 'png'
		? encodeImage({ ...base, format: 'png', lossless: !settings.pngLossy })
		: settings.format === 'avif'
			? encodeImage({ ...base, format: 'avif', speed: AVIF_SPEED[settings.avifEffort] })
			: settings.format === 'jxl'
				? encodeImage({ ...base, format: 'jxl', effort: JXL_EFFORT })
				: encodeImage({ ...base, format: 'jpeg' }));
	return new Blob([new Uint8Array(bytes)], { type: info.mime });
}

/**
 * An icon: the picture drawn square at each icon size up to its own, each from the source so small
 * sizes stay sharp, stored as PNGs.
 */
async function exportIco(source: ImageBitmap, doc: ImageDoc, size: Size): Promise<Blob> {
	const largest = Math.min(256, Math.max(size.width, size.height));
	const sizes = ICO_SIZES.filter((side) => side <= largest);
	if (sizes.length === 0) sizes.push(largest);
	const pictures: { size: number; png: Uint8Array }[] = [];
	for (const side of sizes) {
		// A picture that isn't square is fitted in the middle, on transparency.
		const scale = side / Math.max(size.width, size.height);
		const inner = {
			width: Math.max(1, Math.round(size.width * scale)),
			height: Math.max(1, Math.round(size.height * scale)),
		};
		// Sequential on purpose: one picture and one encoder call at a time.
		// oxlint-disable-next-line no-await-in-loop
		const picture = await renderPicture(source, doc, inner, false);
		const square = new OffscreenCanvas(side, side);
		const context = square.getContext('2d');
		if (!context) throw new Error('No 2D canvas');
		context.drawImage(picture.canvas, Math.round((side - inner.width) / 2), Math.round((side - inner.height) / 2));
		const rgba = new Uint8Array(context.getImageData(0, 0, side, side).data.buffer);
		// oxlint-disable-next-line no-await-in-loop
		const png = await encodeImage({
			op: 'encode',
			format: 'png',
			lossless: true,
			rgba,
			width: side,
			height: side,
			quality: 100,
			exif: new Uint8Array(),
		});
		pictures.push({ size: side, png: new Uint8Array(png) });
	}
	return new Blob([packIco(pictures).slice()], { type: FORMAT_INFO.ico.mime });
}

export function exportName(original: string, format: ImageFormat): string {
	return outputName(
		original,
		FORMAT_INFO[format].extension,
		format === 'jpeg' ? ['jpeg', 'jpg'] : format === 'tiff' ? ['tiff', 'tif'] : [],
	);
}

/**
 * Saves a file. Where the browser allows it, the user picks the destination; otherwise the file
 * goes to the downloads folder. Resolves with false if the user cancelled.
 */
export async function saveFile(blob: Blob, name: string): Promise<boolean> {
	if (window.showSaveFilePicker) {
		try {
			const handle = await window.showSaveFilePicker({
				suggestedName: name,
				types: [{ description: blob.type, accept: { [blob.type]: [`.${name.split('.').pop() ?? ''}`] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
			return true;
		} catch (error) {
			if (isPickerCancel(error)) return false;
			// Other failures (permissions, policy) fall back to a regular download.
		}
	}
	download(blob, name);
	return true;
}
