import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { formatClock } from '@/lib/format';
import type { ImageDoc } from '../image/document';
import { useImageEditor } from '../image/store';

/**
 * The picture of a video at a time, as a PNG file, turned upright as players show it. Its edits
 * are not burnt in: they go to the image editor as its own, so they stay adjustable.
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
		const name = `${file.name.replace(/\.[^.]+$/, '')} ${formatClock(time).replaceAll(':', '-')}.png`;
		return new File([blob], name, { type: 'image/png', lastModified: Date.now() });
	} finally {
		input.dispose();
	}
}

/** Starts the image editor on a captured picture with the video's crop, turns and colours. */
export function carryEdits(picture: File, doc: ImageDoc) {
	const editor = useImageEditor.getState();
	editor.load(picture);
	editor.apply(() => doc);
}
