import { encodeImage } from '@/media/image-codec';
import { effectiveCrop, fitWithin, type ImageDoc, type Size } from './document';
import { ImageRenderer } from './renderer';
import type { ExportSettings, ImageFormat } from './store';

export const FORMAT_INFO: Record<ImageFormat, { mime: string; extension: string; alpha: boolean }> = {
	jpeg: { mime: 'image/jpeg', extension: 'jpg', alpha: false },
	png: { mime: 'image/png', extension: 'png', alpha: true },
	webp: { mime: 'image/webp', extension: 'webp', alpha: true },
	avif: { mime: 'image/avif', extension: 'avif', alpha: true },
	jxl: { mime: 'image/jxl', extension: 'jxl', alpha: true },
};

/** Whether the quality setting applies, given the other settings. */
export function usesQuality(settings: ExportSettings): boolean {
	return settings.format !== 'png' || settings.pngLossy;
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
	return settings.longestSide ? fitWithin(crop, settings.longestSide) : { width: crop.width, height: crop.height };
}

/**
 * Renders the document at export size with the same renderer as the preview, then encodes it:
 * jpegli, PNG, AVIF and JPEG XL in the codec worker, WebP with the browser.
 */
export async function exportImage(source: ImageBitmap, doc: ImageDoc, settings: ExportSettings): Promise<Blob> {
	const { width, height } = outputSize(doc, source, settings);
	const info = FORMAT_INFO[settings.format];
	const canvas = new OffscreenCanvas(width, height);
	const renderer = new ImageRenderer(canvas);
	const region = effectiveCrop(doc, source);
	renderer.setSource(source);

	if (settings.format === 'webp') {
		try {
			renderer.render(doc, { region });
			return await canvas.convertToBlob({ type: info.mime, quality: settings.quality / 100 });
		} finally {
			renderer.dispose();
		}
	}

	renderer.render(doc, { region, opaque: !info.alpha, flipY: true });
	const rgba = renderer.readPixels();
	renderer.dispose();

	const base = { op: 'encode', rgba, width, height, quality: settings.quality } as const;
	const bytes = await (settings.format === 'png'
		? encodeImage({ ...base, format: 'png', lossless: !settings.pngLossy })
		: settings.format === 'avif'
			? encodeImage({ ...base, format: 'avif', speed: AVIF_SPEED[settings.avifEffort] })
			: settings.format === 'jxl'
				? encodeImage({ ...base, format: 'jxl', effort: JXL_EFFORT })
				: encodeImage({ ...base, format: 'jpeg' }));
	return new Blob([new Uint8Array(bytes)], { type: info.mime });
}

export function exportName(original: string, format: ImageFormat): string {
	const dot = original.lastIndexOf('.');
	const base = dot > 0 ? original.slice(0, dot) : original;
	const extension = FORMAT_INFO[format].extension;
	const current = original.slice(dot + 1).toLowerCase();
	const sameExtension = current === extension || (extension === 'jpg' && current === 'jpeg');
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
