import { effectiveCrop, fitWithin, type ImageDoc, type Size } from './document';
import { ImageRenderer } from './renderer';
import type { ExportSettings, ImageFormat } from './store';

export const FORMAT_INFO: Record<ImageFormat, { mime: string; extension: string; lossy: boolean; alpha: boolean }> = {
	jpeg: { mime: 'image/jpeg', extension: 'jpg', lossy: true, alpha: false },
	png: { mime: 'image/png', extension: 'png', lossy: false, alpha: true },
	webp: { mime: 'image/webp', extension: 'webp', lossy: true, alpha: true },
};

const supportCache = new Map<ImageFormat, Promise<boolean>>();

/** Browsers silently fall back to PNG for formats they can't encode, so support is tested once. */
export async function canEncode(format: ImageFormat): Promise<boolean> {
	let check = supportCache.get(format);
	if (!check) {
		check = new OffscreenCanvas(1, 1)
			.convertToBlob({ type: FORMAT_INFO[format].mime })
			.then((blob) => blob.type === FORMAT_INFO[format].mime)
			.catch(() => false);
		supportCache.set(format, check);
	}
	return check;
}

export function outputSize(doc: ImageDoc, source: Size, settings: ExportSettings): Size {
	const crop = effectiveCrop(doc, source);
	return settings.longestSide ? fitWithin(crop, settings.longestSide) : { width: crop.width, height: crop.height };
}

/** Renders the document at export size with the same renderer as the preview, then encodes it. */
export async function exportImage(source: ImageBitmap, doc: ImageDoc, settings: ExportSettings): Promise<Blob> {
	const size = outputSize(doc, source, settings);
	const canvas = new OffscreenCanvas(size.width, size.height);
	const renderer = new ImageRenderer(canvas);
	try {
		renderer.setSource(source);
		const info = FORMAT_INFO[settings.format];
		renderer.render(doc, { region: effectiveCrop(doc, source), opaque: !info.alpha });
		return await canvas.convertToBlob({
			type: info.mime,
			quality: info.lossy ? settings.quality / 100 : undefined,
		});
	} finally {
		renderer.dispose();
	}
}

export function exportName(original: string, format: ImageFormat): string {
	const dot = original.lastIndexOf('.');
	const base = dot > 0 ? original.slice(0, dot) : original;
	const extension = FORMAT_INFO[format].extension;
	const sameExtension =
		original.slice(dot + 1).toLowerCase() === extension || (extension === 'jpg' && /\.jpe?g$/i.test(original));
	return `${base}${sameExtension ? '-edited' : ''}.${extension}`;
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
			if (error instanceof DOMException && error.name === 'AbortError') return false;
			// Other failures (permissions, policy) fall back to a regular download.
		}
	}
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 10_000);
	return true;
}
