import { Columns2, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useBoxSize } from '@/ui/use-box-size';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

interface StageZoom {
	/** Scale of the picture on screen; null fits it in the preview. */
	zoom: number | null;
	/** The scale that fits, as last measured by the stage. */
	fit: number;
	pan: { x: number; y: number };
	/** Held down by the compare button or the C key: the preview shows the original. */
	comparing: boolean;
	setZoom: (zoom: number | null) => void;
	zoomBy: (factor: number) => void;
	setComparing: (comparing: boolean) => void;
}

/** The zoom of the preview on screen, shared by the stage, the status bar and the shortcuts. */
export const useStageZoom = create<StageZoom>()((set, get) => ({
	zoom: null,
	fit: 1,
	pan: { x: 0, y: 0 },
	comparing: false,
	setZoom: (zoom) => {
		set({
			zoom: zoom === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
			...(zoom === null && { pan: { x: 0, y: 0 } }),
		});
	},
	zoomBy: (factor) => {
		const { zoom, fit, setZoom } = get();
		setZoom((zoom ?? fit) * factor);
	},
	setComparing: (comparing) => {
		set({ comparing });
	},
}));

/** Pixels a canvas needs to look sharp at `display` CSS pixels, never more than the source has. */
export function backingSize(display: number, source: number): number {
	const ratio = window.devicePixelRatio || 1;
	return Math.max(1, Math.round(Math.min(display * ratio, source, 8192)));
}

/**
 * The preview area of the image, GIF and video editors: the picture fitted, or zoomed and moved
 * around. Ctrl or ⌘ + wheel zooms around the pointer; once zoomed in, the wheel and a drag move it.
 * Elements marked `data-no-pan` (the crop frame, text on the picture) keep their own drags.
 */
export function ZoomStage({
	width,
	height,
	compare = false,
	children,
}: {
	/** Size of the picture shown, in its own pixels. */
	width: number;
	height: number;
	/** Offers the button showing the original while held. */
	compare?: boolean;
	/** Draws the picture at the given scale; it fills a box of the scaled size. */
	children: (scale: number) => ReactNode;
}) {
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const { zoom, pan, comparing, setComparing } = useStageZoom();
	useZoomShortcuts();
	const [panning, setPanning] = useState(false);
	const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);

	const fit = area.width && area.height && width && height ? Math.min(area.width / width, area.height / height) : 0;
	const scale = zoom ?? fit;
	const display = { width: Math.round(width * scale), height: Math.round(height * scale) };
	const zoomed = zoom !== null && zoom > fit * 1.001;

	useEffect(() => {
		useStageZoom.setState({ fit });
	}, [fit]);
	// A new picture starts fitted.
	useEffect(() => {
		useStageZoom.setState({ zoom: null, pan: { x: 0, y: 0 } });
	}, [width, height]);

	/** Keeps at least a quarter of the picture on screen. */
	const clampPan = (next: { x: number; y: number }, size = display) => {
		const limitX = Math.max(0, (size.width + area.width) / 2 - Math.min(size.width, area.width) / 4);
		const limitY = Math.max(0, (size.height + area.height) / 2 - Math.min(size.height, area.height) / 4);
		return { x: Math.min(limitX, Math.max(-limitX, next.x)), y: Math.min(limitY, Math.max(-limitY, next.y)) };
	};

	useEffect(() => {
		const element = areaRef.current;
		if (!element) return;
		const onWheel = (event: WheelEvent) => {
			const state = useStageZoom.getState();
			const current = state.zoom ?? fit;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * Math.exp(-event.deltaY * 0.0022)));
				// Zoom around the pointer: the point under it stays under it.
				const rect = element.getBoundingClientRect();
				const px = event.clientX - rect.left - rect.width / 2 - state.pan.x;
				const py = event.clientY - rect.top - rect.height / 2 - state.pan.y;
				const k = next / current;
				const size = { width: width * next, height: height * next };
				useStageZoom.setState({
					zoom: next,
					pan:
						next <= fit
							? { x: 0, y: 0 }
							: clampPan({ x: state.pan.x - px * (k - 1), y: state.pan.y - py * (k - 1) }, size),
				});
				return;
			}
			if (state.zoom === null || state.zoom <= fit) return;
			event.preventDefault();
			useStageZoom.setState({ pan: clampPan({ x: state.pan.x - event.deltaX, y: state.pan.y - event.deltaY }) });
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			element.removeEventListener('wheel', onWheel);
		};
	});

	const offset = zoomed ? pan : { x: 0, y: 0 };

	return (
		<div
			ref={areaRef}
			className={`relative size-full touch-none overflow-visible ${zoomed ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
			onPointerDown={(event) => {
				if (!zoomed || event.button > 1) return;
				if (event.target instanceof Element && event.target.closest('[data-no-pan]')) return;
				drag.current = { x: event.clientX, y: event.clientY, pan };
				event.currentTarget.setPointerCapture(event.pointerId);
				setPanning(true);
			}}
			onPointerMove={(event) => {
				const from = drag.current;
				if (!from) return;
				useStageZoom.setState({
					pan: clampPan({ x: from.pan.x + event.clientX - from.x, y: from.pan.y + event.clientY - from.y }),
				});
			}}
			onPointerUp={() => {
				drag.current = null;
				setPanning(false);
			}}
		>
			{scale > 0 && (
				<div
					className="absolute top-1/2 left-1/2 will-change-transform"
					style={{
						width: display.width,
						height: display.height,
						transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
					}}
				>
					{children(scale)}
				</div>
			)}
			{compare && (
				<button
					type="button"
					aria-label={m.compare_hold()}
					title={m.compare_hold()}
					aria-pressed={comparing}
					onPointerDown={(event) => {
						event.stopPropagation();
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
					className="ease-spring bg-bg/85 aria-pressed:bg-ed aria-pressed:text-ed-ink absolute -top-2 -right-2 z-10 grid size-11 place-items-center rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_24px_-8px_rgb(0_0_0/0.25)] backdrop-blur-md transition-transform duration-200 select-none hover:scale-105 aria-pressed:scale-95 md:-top-4 md:-right-4"
				>
					<Columns2 className="size-5" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

/** Zoom controls and the picture's size, for the status bar under the preview. */
export function ZoomStatus({
	size,
	children,
}: {
	size: { width: number; height: number } | null;
	/** More about the output, after its size. */
	children?: ReactNode;
}) {
	const { zoom, fit, setZoom, zoomBy } = useStageZoom();
	const percent = Math.round((zoom ?? fit) * 100);
	return (
		<>
			<IconButton
				label={m.zoom_out()}
				onClick={() => {
					zoomBy(0.8);
				}}
				disabled={(zoom ?? fit) <= MIN_ZOOM}
			>
				<ZoomOut className="size-5" />
			</IconButton>
			<button
				type="button"
				title={m.zoom_fit()}
				onClick={() => {
					setZoom(null);
				}}
				className="text-ui hover:bg-surface tabular min-w-16 rounded-xs px-1 py-1.5 text-center font-mono font-medium transition-colors"
			>
				{percent} %
			</button>
			<IconButton
				label={m.zoom_in()}
				onClick={() => {
					zoomBy(1.25);
				}}
				disabled={(zoom ?? fit) >= MAX_ZOOM}
			>
				<ZoomIn className="size-5" />
			</IconButton>
			<IconButton
				label={m.zoom_fit()}
				onClick={() => {
					setZoom(null);
				}}
				disabled={zoom === null}
			>
				<Scan className="size-5" />
			</IconButton>
			{size && (
				<>
					<span className="bg-line mx-2 h-6 w-px" aria-hidden="true" />
					<span className="text-small text-muted tabular font-mono">
						{size.width} × {size.height} px
					</span>
				</>
			)}
			{children && <span className="text-small text-muted tabular ml-5 flex gap-5 font-mono">{children}</span>}
		</>
	);
}

/**
 * Zoom and compare from the keyboard: + and − zoom, 0 fits, C held shows the original. Not while
 * typing in a field.
 */
export function useZoomShortcuts() {
	useEffect(() => {
		const typing = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input,textarea,select') !== null);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
			const zoom = useStageZoom.getState();
			if (event.key === '+' || event.key === '=') zoom.zoomBy(1.25);
			else if (event.key === '-') zoom.zoomBy(0.8);
			else if (event.key === '0') zoom.setZoom(null);
			else if ((event.key === 'c' || event.key === 'C') && !event.repeat) zoom.setComparing(true);
			else return;
			event.preventDefault();
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === 'c' || event.key === 'C') useStageZoom.getState().setComparing(false);
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, []);
}
