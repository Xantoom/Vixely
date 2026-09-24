import type { Rect } from '@/editors/image/document';
import { GifEncoder } from '@/media/gif-codec';
import { type GifDoc, outputFrames } from './document';
import type { FrameSource } from './source';
import type { GifExportSettings } from './store';

/**
 * Size of the output: the chosen width, never wider than the crop (a GIF gains nothing from being
 * enlarged), the height following the crop's proportions.
 */
export function outputSize(crop: Rect, width: number | null): { width: number; height: number } {
	const outWidth = Math.max(1, Math.round(Math.min(width ?? crop.width, crop.width)));
	return { width: outWidth, height: Math.max(1, Math.round((crop.height * outWidth) / crop.width)) };
}

export interface ExportGifOptions {
	source: FrameSource;
	doc: GifDoc;
	settings: GifExportSettings;
	signal: AbortSignal;
	/** Share of the frames prepared, then null while gifski encodes them. */
	onProgress: (fraction: number | null) => void;
}

/**
 * Makes the GIF. Every output frame is drawn cropped and resized, in order, and handed to gifski
 * in a worker; gifski then builds palettes across frames and dithers them over time. The frames
 * are the same list the preview plays.
 */
export async function exportGif({ source, doc, settings, signal, onProgress }: ExportGifOptions): Promise<Blob> {
	const frames = outputFrames(doc, source.timing);
	const crop = doc.crop ?? { x: 0, y: 0, width: source.width, height: source.height };
	const { width, height } = outputSize(crop, settings.width);
	const encoder = new GifEncoder({
		quality: settings.quality,
		lossy: Math.max(1, 100 - settings.compression),
		repeat: settings.repeat,
	});
	const stop = () => {
		encoder.cancel();
	};
	signal.addEventListener('abort', stop, { once: true });
	try {
		let index = 0;
		for await (const image of source.render(
			frames.map((frame) => frame.source),
			crop,
			width,
			height,
		)) {
			if (signal.aborted) throw new DOMException('The export was stopped.', 'AbortError');
			encoder.addFrame(image.data, width, height, frames[index]?.start ?? 0);
			index += 1;
			onProgress(index / frames.length);
		}
		onProgress(null);
		const bytes = await encoder.finish();
		if (signal.aborted) throw new DOMException('The export was stopped.', 'AbortError');
		return new Blob([bytes.slice()], { type: 'image/gif' });
	} finally {
		signal.removeEventListener('abort', stop);
	}
}
