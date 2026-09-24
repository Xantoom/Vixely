import { useEffect, useRef } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import type { Rect } from '@/editors/image/document';
import { cropRatio } from '@/editors/image/store';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { frameAt } from './document';
import type { GifEngine } from './engine';
import { outputSize } from './export';
import { useGifDoc, useGifEditor } from './store';

/**
 * The animation as it will be saved, playing in a loop. With the crop tool, the whole picture
 * shows with the crop frame on top.
 */
export function GifViewer({ engine, cropping }: { engine: GifEngine; cropping: boolean }) {
	const doc = useGifDoc();
	const playhead = useGifEditor((state) => state.playhead);
	const aspect = useGifEditor((state) => state.cropAspect);
	const width = useGifEditor((state) => state.exportSettings.width);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const areaRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const area = useBoxSize(areaRef);
	const { source, frames } = engine;

	const bounds = { width: source?.width ?? 1, height: source?.height ?? 1 };
	const full: Rect = { x: 0, y: 0, ...bounds };
	const crop = doc.crop ?? full;
	const region = cropping ? full : crop;
	const scale = area.width && area.height ? Math.min(area.width / region.width, area.height / region.height) : 0;
	const display = { width: Math.floor(region.width * scale), height: Math.floor(region.height * scale) };
	const frame = frameAt(frames, playhead);
	const output = outputSize(crop, width);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !source || !frame || display.width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const pixelWidth = Math.max(1, Math.round(display.width * ratio));
		const pixelHeight = Math.max(1, Math.round(display.height * ratio));
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
		<div className="flex h-full w-full flex-col gap-3">
			<div ref={areaRef} className="relative min-h-0 flex-1">
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={display}>
					<canvas
						ref={canvasRef}
						className="block size-full rounded-[3px] bg-[conic-gradient(var(--surface-2)_25%,var(--bg)_0_50%,var(--surface-2)_0_75%,var(--bg)_0)] bg-size-[16px_16px] shadow-[0_0_0_1px_var(--line)]"
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
				</div>
			</div>
			<div className="text-small text-muted tabular flex h-9 flex-none items-center justify-center gap-5 font-mono">
				<span>
					{output.width} × {output.height}
				</span>
				<span>{m.frames_count({ count: frames.length })}</span>
				<span>{formatPreciseTime(engine.length)}</span>
			</div>
		</div>
	);
}
