import { useEffect, useRef } from 'react';
import { cuesAt, type SubtitleDoc } from './document';
import { pictureBitmap } from './pgs';

/**
 * PGS pictures at the playhead, drawn where the disc places them. Positions refer to the video
 * size of the subtitles, scaled to the frame on screen. It fills its parent.
 */
export function PgsOverlay({ doc, time }: { doc: SubtitleDoc; time: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = doc.pgsSize ?? { width: 1920, height: 1080 };
	// The last line starting wins: PGS shows one composition at a time.
	const cue = cuesAt(doc, time * 1000).findLast((line) => line.picture);
	const picture = cue?.picture;

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
		const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		context.clearRect(0, 0, width, height);
		if (!picture) return;
		let current = true;
		void pictureBitmap(picture).then((bitmap) => {
			if (!current || !bitmap || bitmap.width === 0) return;
			// Positions refer to the disc's frame; a cropped video still gets them inside its picture.
			const sx = width / size.width;
			const sy = height / size.height;
			context.clearRect(0, 0, width, height);
			context.imageSmoothingQuality = 'high';
			context.drawImage(bitmap, picture.x * sx, picture.y * sy, picture.width * sx, picture.height * sy);
		});
		return () => {
			current = false;
		};
	});

	return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}
