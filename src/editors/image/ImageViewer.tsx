import { Eye } from 'lucide-react';
import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { m } from '@/paraglide/messages.js';
import { dragCrop, type Handle } from './crop';
import { effectiveCrop, orientedSize, type Rect, type Size } from './document';
import { ImageRenderer } from './renderer';
import { cropRatio, useImageDoc, useImageEditor } from './store';

const HANDLES: { handle: Handle; className: string; cursor: string }[] = [
	{ handle: 'nw', className: '-top-3 -left-3', cursor: 'nwse-resize' },
	{ handle: 'n', className: '-top-3 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
	{ handle: 'ne', className: '-top-3 -right-3', cursor: 'nesw-resize' },
	{ handle: 'e', className: 'top-1/2 -right-3 -translate-y-1/2', cursor: 'ew-resize' },
	{ handle: 'se', className: '-right-3 -bottom-3', cursor: 'nwse-resize' },
	{ handle: 's', className: '-bottom-3 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
	{ handle: 'sw', className: '-bottom-3 -left-3', cursor: 'nesw-resize' },
	{ handle: 'w', className: 'top-1/2 -left-3 -translate-y-1/2', cursor: 'ew-resize' },
];

function useBoxSize(ref: RefObject<HTMLElement | null>): Size {
	const [size, setSize] = useState<Size>({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [ref]);
	return size;
}

/** Crop frame drawn over the full oriented image, in screen pixels. */
function CropOverlay({ crop, scale, bounds }: { crop: Rect; scale: number; bounds: Size }) {
	const preview = useImageEditor((state) => state.preview);
	const settle = useImageEditor((state) => state.settle);
	const ratio = useImageEditor((state) => cropRatio(state.cropAspect, bounds));

	const start = (event: ReactPointerEvent<HTMLElement>, handle: Handle) => {
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget;
		target.setPointerCapture(event.pointerId);
		const origin = { x: event.clientX, y: event.clientY };
		const initial = crop;
		const move = (moveEvent: PointerEvent) => {
			const dx = (moveEvent.clientX - origin.x) / scale;
			const dy = (moveEvent.clientY - origin.y) / scale;
			const next = dragCrop(initial, handle, dx, dy, bounds, ratio);
			preview((doc) => ({ ...doc, crop: next }));
		};
		const end = () => {
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', end);
			target.removeEventListener('pointercancel', end);
			settle();
		};
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', end);
		target.addEventListener('pointercancel', end);
	};

	const frame = { left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale };
	return (
		<>
			{/* The dimmed outside is clipped to the image; the frame and its handles are not. */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]">
				<div className="absolute shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]" style={frame} />
			</div>
			<div className="absolute touch-none outline-[1.5px] outline-white" style={frame}>
				<div
					className="absolute inset-0 cursor-move bg-[linear-gradient(to_right,transparent_33.2%,rgb(255_255_255/0.35)_33.2%,rgb(255_255_255/0.35)_33.5%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.35)_66.5%,rgb(255_255_255/0.35)_66.8%,transparent_66.8%),linear-gradient(to_bottom,transparent_33.2%,rgb(255_255_255/0.35)_33.2%,rgb(255_255_255/0.35)_33.5%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.35)_66.5%,rgb(255_255_255/0.35)_66.8%,transparent_66.8%)]"
					onPointerDown={(event) => {
						start(event, 'move');
					}}
				/>
				{HANDLES.map(({ handle, className, cursor }) => (
					<div
						key={handle}
						className={`absolute grid size-6 place-items-center ${className}`}
						style={{ cursor }}
						onPointerDown={(event) => {
							start(event, handle);
						}}
					>
						<span className="size-2.5 rounded-[2px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.45)]" />
					</div>
				))}
			</div>
		</>
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
					{cropping && <CropOverlay crop={crop} scale={scale} bounds={bounds} />}
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
