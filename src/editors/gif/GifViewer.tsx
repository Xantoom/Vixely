import { useEffect, useRef } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import { backingSize, ZoomStage, ZoomStatus } from '@/editor/ZoomStage';
import type { Rect } from '@/editors/image/document';
import { cropRatio } from '@/editors/image/store';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { frameAt } from './document';
import type { GifEngine } from './engine';
import { outputSize } from './export';
import { useGifDoc, useGifEditor } from './store';

/** The frame on screen, drawn at the scale of the stage. */
function GifPicture({ engine, cropping, scale }: { engine: GifEngine; cropping: boolean; scale: number }) {
	const doc = useGifDoc();
	const playhead = useGifEditor((state) => state.playhead);
	const aspect = useGifEditor((state) => state.cropAspect);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { source, frames } = engine;
	const bounds = { width: source?.width ?? 1, height: source?.height ?? 1 };
	const full: Rect = { x: 0, y: 0, ...bounds };
	const crop = doc.crop ?? full;
	const region = cropping ? full : crop;
	const frame = frameAt(frames, playhead);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !source || !frame) return;
		const pixelWidth = backingSize(region.width * scale, region.width);
		const pixelHeight = backingSize(region.height * scale, region.height);
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		const draw = (picture: CanvasImageSource) => {
			// Video pictures are read at preview size: the source rectangle scales with them.
			const pictureWidth = picture instanceof ImageBitmap ? picture.width : source.width;
			const factor = pictureWidth / source.width;
			context.imageSmoothingQuality = 'high';
			context.clearRect(0, 0, pixelWidth, pixelHeight);
			// A picture freed while switching files is skipped; the next one draws.
			if (picture instanceof ImageBitmap && picture.width === 0) return;
			context.drawImage(
				picture,
				region.x * factor,
				region.y * factor,
				region.width * factor,
				region.height * factor,
				0,
				0,
				pixelWidth,
				pixelHeight,
			);
		};
		const ready = source.peek(frame.source);
		if (ready) {
			draw(ready);
			return;
		}
		// Not read yet (a video): the previous picture stays until this one arrives.
		let current = true;
		void source.fetch(frame.source).then((picture) => {
			if (current && picture) draw(picture);
		});
		return () => {
			current = false;
		};
	});

	return (
		<>
			<canvas
				ref={canvasRef}
				className={`block size-full rounded-[3px] bg-[conic-gradient(var(--surface-2)_25%,var(--bg)_0_50%,var(--surface-2)_0_75%,var(--bg)_0)] bg-size-[16px_16px] shadow-[0_1px_3px_rgb(0_0_0/0.18),0_12px_40px_-12px_rgb(0_0_0/0.35)] ${scale > 1.5 ? '[image-rendering:pixelated]' : ''}`}
			/>
			{cropping && source && (
				<CropOverlay
					crop={crop}
					scale={scale}
					bounds={bounds}
					ratio={cropRatio(aspect, bounds)}
					onChange={(next) => {
						preview((current) => ({ ...current, crop: next }));
					}}
					onEnd={settle}
				/>
			)}
		</>
	);
}

/**
 * The animation as it will be saved, playing in a loop. With the crop tool, the whole picture
 * shows with the crop frame on top.
 */
export function GifViewer({ engine, cropping }: { engine: GifEngine; cropping: boolean }) {
	const doc = useGifDoc();
	const { source } = engine;
	const full: Rect = { x: 0, y: 0, width: source?.width ?? 1, height: source?.height ?? 1 };
	const region = cropping ? full : (doc.crop ?? full);
	return (
		<ZoomStage width={region.width} height={region.height}>
			{(scale) => <GifPicture engine={engine} cropping={cropping} scale={scale} />}
		</ZoomStage>
	);
}

/** Under the preview: zoom, then the size, frame count and length of the output. */
export function GifStatus({ engine }: { engine: GifEngine }) {
	const doc = useGifDoc();
	const width = useGifEditor((state) => state.exportSettings.width);
	const { source, frames } = engine;
	const crop = doc.crop ?? { x: 0, y: 0, width: source?.width ?? 1, height: source?.height ?? 1 };
	const output = outputSize(crop, width);
	return (
		<ZoomStatus size={output}>
			<span>{m.frames_count({ count: frames.length })}</span>
			<span>{formatPreciseTime(engine.length)}</span>
		</ZoomStatus>
	);
}
