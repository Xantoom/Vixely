import { Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
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

/**
 * The image preview. Drawn with the same WebGL renderer as the export, at the display resolution.
 * With the crop tool, the whole image shows with the crop frame on top.
 */
export function ImageViewer({ source, cropping }: { source: ImageBitmap; cropping: boolean }) {
	const doc = useImageDoc();
	const areaRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<ImageRenderer | null>(null);
	const [comparing, setComparing] = useState(false);
	const area = useBoxSize(areaRef);

	const bounds = orientedSize(source, doc.rotation);
	const crop = effectiveCrop(doc, source);
	const region: Rect = cropping ? { x: 0, y: 0, ...bounds } : crop;
	const scale = area.width && area.height ? Math.min(area.width / region.width, area.height / region.height) : 0;
	const display = { width: Math.floor(region.width * scale), height: Math.floor(region.height * scale) };

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
		if (!canvas || !renderer || display.width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.max(1, Math.round(display.width * ratio));
		canvas.height = Math.max(1, Math.round(display.height * ratio));
		renderer.render(doc, { region, original: comparing });
	});

	const shown = cropping ? bounds : crop;

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div ref={areaRef} className="relative min-h-0 flex-1">
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={display}>
					{/* The checkerboard shows through transparent areas. */}
					<canvas
						ref={canvasRef}
						className="block size-full rounded-[3px] bg-[conic-gradient(var(--surface-2)_25%,var(--bg)_0_50%,var(--surface-2)_0_75%,var(--bg)_0)] bg-size-[16px_16px] shadow-[0_0_0_1px_var(--line)]"
					/>
					{cropping && <ImageCropOverlay crop={crop} scale={scale} bounds={bounds} />}
				</div>
			</div>
			<div className="grid h-9 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3">
				<span className="text-small text-muted tabular font-mono">
					{shown.width} × {shown.height}
				</span>
				<button
					type="button"
					onPointerDown={() => {
						setComparing(true);
					}}
					onPointerUp={() => {
						setComparing(false);
					}}
					onPointerLeave={() => {
						setComparing(false);
					}}
					onKeyDown={(event) => {
						if (event.key === ' ' || event.key === 'Enter') setComparing(true);
					}}
					onKeyUp={() => {
						setComparing(false);
					}}
					aria-pressed={comparing}
					className="text-ui text-ink-2 hover:bg-surface aria-pressed:bg-surface-2 aria-pressed:text-ink flex h-9 items-center gap-2 rounded-sm px-3 font-medium transition-colors select-none"
				>
					<Eye size={16} aria-hidden="true" />
					{m.compare_hold()}
				</button>
				<span />
			</div>
		</div>
	);
}
