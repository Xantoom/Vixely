import { useEffect, useRef } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { CroppedLayers, OverlayLayer } from '@/editor/overlays/OverlayLayer';
import { backingSize, useStageZoom, ZoomStage, ZoomStatus } from '@/editor/ZoomStage';
import { effectiveCrop, orientedSize, type Size, wholePictureDoc } from '@/editors/image/document';
import { cropRatio } from '@/editors/image/store';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { FrameComposer } from './compose';
import { frameAt, type FrameLayout, frameLayout, type GifDoc, NO_FADE } from './document';
import type { GifEngine } from './engine';
import { exportLayout } from './export';
import { useGifDoc, useGifEditor } from './store';

/**
 * The document drawn while cropping: the whole picture turned, with its colours and blurred zones.
 * Text and stickers lie in the crop frame, over it; bands and fades wait for the crop.
 */
function croppingDoc(doc: GifDoc, source: Size): GifDoc {
	const crop = effectiveCrop(doc.picture, source);
	const whole = wholePictureDoc(doc.picture, crop, orientedSize(source, doc.picture.rotation));
	const zones = whole.overlays.filter((overlay) => overlay.kind === 'zone');
	return { ...doc, picture: { ...whole, crop: null, overlays: zones }, bands: null, fade: NO_FADE };
}

/** The frame on screen, drawn at the scale of the stage by the export's own composer. */
function GifPicture({
	engine,
	cropping,
	scale,
	layout,
	overlays,
	onEditText,
}: {
	engine: GifEngine;
	cropping: boolean;
	scale: number;
	layout: FrameLayout;
	overlays?: OverlayEditing;
	onEditText?: () => void;
}) {
	const doc = useGifDoc();
	const aspect = useGifEditor((state) => state.cropAspect);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const comparing = useStageZoom((state) => state.comparing);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const composer = useRef<FrameComposer | null>(null);
	const { source, frames, length } = engine;
	const size = { width: source?.width ?? 1, height: source?.height ?? 1 };
	const shown = cropping ? croppingDoc(doc, size) : doc;
	// Only a new frame draws again, not every moment of playback.
	const frame = useGifEditor((state) => frameAt(frames, state.playhead));
	const bounds = orientedSize(size, doc.picture.rotation);
	const crop = effectiveCrop(doc.picture, size);

	useEffect(() => {
		try {
			composer.current = new FrameComposer();
		} catch {
			composer.current = null;
		}
		return () => {
			composer.current?.dispose();
			composer.current = null;
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !source || !frame || !composer.current) return;
		const pixelWidth = backingSize(layout.width * scale, layout.width);
		const pixelHeight = backingSize(layout.height * scale, layout.height);
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		const draw = (picture: CanvasImageSource) => {
			// A picture freed while switching files is skipped; the next one draws.
			if (picture instanceof ImageBitmap && picture.width === 0) return;
			if (
				!(
					picture instanceof ImageBitmap ||
					picture instanceof HTMLCanvasElement ||
					picture instanceof OffscreenCanvas
				)
			)
				return;
			composer.current?.draw(context, picture, size, shown, layout, {
				time: frame.start,
				length,
				original: comparing,
				overlays: !overlays,
			});
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
				className={`block size-full stage-picture bg-[conic-gradient(var(--surface-2)_25%,var(--bg)_0_50%,var(--surface-2)_0_75%,var(--bg)_0)] bg-size-[16px_16px] ${scale > 1.5 ? '[image-rendering:pixelated]' : ''}`}
			/>
			{!cropping && !comparing && overlays && (
				<OverlayLayer
					overlays={doc.picture.overlays}
					width={layout.width * scale}
					height={layout.height * scale}
					editing={overlays}
					onEditText={onEditText}
				/>
			)}
			{cropping && source && <CroppedLayers overlays={doc.picture.overlays} crop={crop} scale={scale} />}
			{cropping && source && (
				<CropOverlay
					crop={crop}
					scale={scale}
					bounds={bounds}
					ratio={cropRatio(aspect, bounds)}
					onChange={(next) => {
						preview((current) => ({ ...current, picture: { ...current.picture, crop: next } }));
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
export function GifViewer({
	engine,
	cropping,
	overlays,
	onEditText,
}: {
	engine: GifEngine;
	cropping: boolean;
	/** Given while the text or sticker tool is open: they can be moved on the picture. */
	overlays?: OverlayEditing;
	onEditText?: () => void;
}) {
	const doc = useGifDoc();
	const { source } = engine;
	const size = { width: source?.width ?? 1, height: source?.height ?? 1 };
	const layout = frameLayout(cropping ? croppingDoc(doc, size) : doc, size, null);
	return (
		<ZoomStage width={layout.width} height={layout.height} compare={!cropping}>
			{(scale) => (
				<GifPicture
					engine={engine}
					cropping={cropping}
					scale={scale}
					layout={layout}
					overlays={overlays}
					onEditText={onEditText}
				/>
			)}
		</ZoomStage>
	);
}

/** Width over height of the picture the preview shows: whole while cropping, cropped otherwise. */
export function useGifAspect(engine: GifEngine, cropping: boolean): number | undefined {
	const doc = useGifDoc();
	const { source } = engine;
	if (!source) return undefined;
	const layout = frameLayout(
		cropping ? croppingDoc(doc, source) : doc,
		{ width: source.width, height: source.height },
		null,
	);
	return layout.width / Math.max(1, layout.height);
}

/** Along the bottom of the preview: zoom, then the size, frame count and length of the output. */
export function GifStatus({ engine }: { engine: GifEngine }) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const { source, frames } = engine;
	const { width, height } = exportLayout(doc, { width: source?.width ?? 1, height: source?.height ?? 1 }, settings);
	const output = { width, height };
	return (
		<ZoomStatus size={output}>
			<span>{m.frames_count({ count: frames.length })}</span>
			<span>{formatPreciseTime(engine.length)}</span>
		</ZoomStatus>
	);
}
