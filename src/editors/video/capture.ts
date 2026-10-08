import { ALL_FORMATS, BlobSource, CanvasSink, Input, VideoSampleSink } from 'mediabunny';
import { loadOverlayAssets } from '@/editor/overlays/draw';
import { shownAt } from '@/editor/overlays/model';
import { formatClock } from '@/lib/format';
import type { ImageDoc, Size } from '../image/document';
import { useImageEditor } from '../image/store';
import { type BurnJob, createBurner } from './burn';
import { burnBox, outputSize, PictureProcessor } from './export';

/**
 * The picture of a video at a time, as a PNG file, turned upright as players show it, without
 * its edits.
 */
export async function capturePicture(file: File, time: number): Promise<File> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error('No video track');
		// Decoded by the CPU: one picture, and one that doesn't depend on the graphics driver.
		const sink = new CanvasSink(track, {
			poolSize: 0,
			decoderOptions: { hardwareAcceleration: 'prefer-software' },
		});
		const frame = await sink.getCanvas(Math.max(time, await track.getFirstTimestamp()));
		if (!frame) throw new Error('No picture at this time');
		const canvas = frame.canvas;
		const blob =
			canvas instanceof OffscreenCanvas
				? await canvas.convertToBlob({ type: 'image/png' })
				: await new Promise<Blob>((resolve, reject) => {
						canvas.toBlob((result) => {
							if (result) resolve(result);
							else reject(new Error('Could not encode the picture'));
						}, 'image/png');
					});
		return pngFile(blob, file, time);
	} finally {
		input.dispose();
	}
}

/** `clip 1-04.png`: the video's name and the time of the picture. */
function pngFile(blob: Blob, video: File, time: number): File {
	const name = `${video.name.replace(/\.[^.]+$/, '')} ${formatClock(time).replaceAll(':', '-')}.png`;
	return new File([blob], name, { type: 'image/png', lastModified: Date.now() });
}

/** What the preview shows over the picture at a time, to draw it into a capture. */
export interface ShownPicture {
	picture: ImageDoc;
	/** The video's picture turned upright, as playback gives it. */
	upright: Size;
	/** The subtitles shown, if any. */
	subtitles: BurnJob | null;
	/** How visible the picture is in a fade, from 1 down to 0. */
	level: number;
}

/**
 * The picture of a video at a time as the preview shows it, as a PNG file at the crop's full
 * size: drawn as the export draws it, with the edits, the text and stickers, the subtitles shown
 * and the fade.
 */
export async function captureShown(file: File, time: number, shown: ShownPicture): Promise<File> {
	const { picture, upright, subtitles, level } = shown;
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const size = outputSize(picture, upright, null);
	let processor: PictureProcessor | null = null;
	const burner = subtitles ? await createBurner(subtitles, upright, burnBox(picture, upright, size)) : null;
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error('No video track');
		if (picture.overlays.length > 0) await loadOverlayAssets(picture.overlays);
		const sample = await new VideoSampleSink(track).getSample(Math.max(time, await track.getFirstTimestamp()));
		if (!sample) throw new Error('No picture at this time');
		processor = new PictureProcessor(picture, upright, size, burner);
		const drawn = await processor.draw(sample, 0, time, 0, level);
		const canvas = new OffscreenCanvas(size.width, size.height);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('No 2D context');
		drawn.draw(context, 0, 0, size.width, size.height);
		drawn.close();
		sample.close();
		return pngFile(await canvas.convertToBlob({ type: 'image/png' }), file, time);
	} finally {
		processor?.dispose();
		burner?.dispose();
		input.dispose();
	}
}

/** A captured picture with subtitles drawn in, where they lie on the whole picture. */
export async function withSubtitles(picture: File, subtitles: BurnJob, time: number): Promise<ImageBitmap> {
	const bitmap = await createImageBitmap(picture);
	const size = { width: bitmap.width, height: bitmap.height };
	const canvas = new OffscreenCanvas(size.width, size.height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('No 2D context');
	context.drawImage(bitmap, 0, 0);
	bitmap.close();
	const burner = await createBurner(subtitles, size, { x: 0, y: 0, ...size });
	try {
		await burner.draw(context, time);
	} finally {
		burner.dispose();
	}
	return canvas.transferToImageBitmap();
}

/**
 * Starts the image editor on a captured picture with the video's edits as its own, so they stay
 * adjustable: crop, turns, colours, and the text, stickers and zones shown at that time.
 */
export function carryEdits(picture: File, doc: ImageDoc, time: number) {
	const editor = useImageEditor.getState();
	const overlays = doc.overlays
		.filter((overlay) => shownAt(overlay, time))
		.map((overlay) => ({ ...overlay, span: null }));
	editor.load(picture);
	editor.apply(() => ({ ...doc, overlays }));
}
