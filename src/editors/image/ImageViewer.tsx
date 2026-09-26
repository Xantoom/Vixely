import { useEffect, useRef } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { OverlayLayer } from '@/editor/overlays/OverlayLayer';
import { backingSize, useStageZoom, ZoomStage } from '@/editor/ZoomStage';
import { effectiveCrop, orientedSize, type Rect, type Size } from './document';
import { ImageRenderer } from './renderer';
import { cropRatio, useImageDoc, useImageEditor } from './store';

/** The crop frame, bound to the image editor's document and aspect. */
function ImageCropOverlay({ crop, scale, bounds }: { crop: Rect; scale: number; bounds: Size }) {
	const preview = useImageEditor((state) => state.preview);
	const settle = useImageEditor((state) => state.settle);
	const ratio = useImageEditor((state) => cropRatio(state.cropAspect, bounds));
	return (
		<CropOverlay
			crop={crop}
			scale={scale}
			bounds={bounds}
			ratio={ratio}
			onChange={(next) => {
				preview((doc) => ({ ...doc, crop: next }));
			}}
			onEnd={settle}
		/>
	);
}

/** The picture drawn by the WebGL renderer at the scale of the stage, sharp but never beyond the source. */
function Picture({
	source,
	region,
	scale,
	cropping,
	overlays,
	onEditText,
}: {
	source: ImageBitmap;
	region: Rect;
	scale: number;
	cropping: boolean;
	overlays?: OverlayEditing;
	onEditText?: () => void;
}) {
	const doc = useImageDoc();
	const comparing = useStageZoom((state) => state.comparing);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<ImageRenderer | null>(null);
	const bounds = orientedSize(source, doc.rotation);
	const crop = effectiveCrop(doc, source);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const renderer = new ImageRenderer(canvas);
		renderer.setSource(source);
		rendererRef.current = renderer;
		return () => {
			renderer.dispose();
			rendererRef.current = null;
		};
	}, [source]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const renderer = rendererRef.current;
		if (!canvas || !renderer) return;
		canvas.width = backingSize(region.width * scale, region.width);
		canvas.height = backingSize(region.height * scale, region.height);
		renderer.render(doc, { region, original: comparing });
	});

	return (
		<>
			{/* The checkerboard shows through transparent areas. */}
			<canvas
				ref={canvasRef}
				className={`block size-full rounded-[3px] bg-[conic-gradient(var(--surface-2)_25%,var(--bg)_0_50%,var(--surface-2)_0_75%,var(--bg)_0)] bg-size-[16px_16px] shadow-[0_1px_3px_rgb(0_0_0/0.18),0_12px_40px_-12px_rgb(0_0_0/0.35)] ${scale > 1.5 ? '[image-rendering:pixelated]' : ''}`}
			/>
			{/* Text and stickers belong to the cropped output: hidden while cropping and comparing. */}
			{!cropping && !comparing && doc.overlays.length + (overlays ? 1 : 0) > 0 && (
				<OverlayLayer
					overlays={doc.overlays}
					width={region.width * scale}
					height={region.height * scale}
					editing={overlays}
					onEditText={onEditText}
				/>
			)}
			{cropping && <ImageCropOverlay crop={crop} scale={scale} bounds={bounds} />}
		</>
	);
}

/**
 * The image preview. Drawn with the same WebGL renderer as the export, at the display resolution.
 * With the crop tool, the whole image shows with the crop frame on top.
 */
export function ImageViewer({
	source,
	cropping,
	overlays,
	onEditText,
}: {
	source: ImageBitmap;
	cropping: boolean;
	/** Given while the text or sticker tool is open: they can be moved on the picture. */
	overlays?: OverlayEditing;
	onEditText?: () => void;
}) {
	const doc = useImageDoc();
	const bounds = orientedSize(source, doc.rotation);
	const crop = effectiveCrop(doc, source);
	const region: Rect = cropping ? { x: 0, y: 0, ...bounds } : crop;
	return (
		<ZoomStage width={region.width} height={region.height} compare>
			{(scale) => (
				<Picture
					source={source}
					region={region}
					scale={scale}
					cropping={cropping}
					overlays={overlays}
					onEditText={onEditText}
				/>
			)}
		</ZoomStage>
	);
}
