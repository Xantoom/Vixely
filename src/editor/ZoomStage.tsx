import { Columns2, Scan } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { wheelIntent } from './wheel';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

interface StageZoom {
	/** Scale of the picture on screen; null fits it in the preview. */
	zoom: number | null;
	/** The scale that fits, as last measured by the stage. */
	fit: number;
	pan: { x: number; y: number };
	/** Held down by the compare button or the C key: the preview shows the original. */
	comparing: boolean;
	/** The stage on screen offers the comparison (not while cropping, where it shows the whole picture). */
	comparable: boolean;
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
	comparable: false,
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
 * around. The wheel zooms around the pointer; once zoomed in, Shift + wheel and a drag move it.
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
	const { zoom, pan } = useStageZoom();
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
	useEffect(() => {
		useStageZoom.setState({ comparable: compare });
		return () => {
			useStageZoom.setState({ comparable: false, comparing: false });
		};
	}, [compare]);
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
			if (wheelIntent(event) === 'zoom') {
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
			const sideways = event.shiftKey && event.deltaX === 0;
			useStageZoom.setState({
				pan: clampPan({
					x: state.pan.x - (sideways ? event.deltaY : event.deltaX),
					y: state.pan.y - (sideways ? 0 : event.deltaY),
				}),
			});
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
			className={`relative size-full touch-none [overflow-clip-margin:10px] [overflow:clip] ${zoomed ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
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
			{compare && <CompareButton className="absolute top-2 right-2 z-10 md:hidden" onPicture />}
		</div>
	);
}

/**
 * Shows the original while held, by pointer or keyboard. In the stage's bar on larger screens;
 * on a phone, on the picture's corner, where the thumb is.
 */
export function CompareButton({ className = '', onPicture = false }: { className?: string; onPicture?: boolean }) {
	const comparing = useStageZoom((state) => state.comparing);
	const setComparing = useStageZoom((state) => state.setComparing);
	return (
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
			className={`aria-pressed:bg-ed aria-pressed:text-ed-ink flex items-center gap-2 transition-colors duration-150 select-none ${
				onPicture
					? 'size-9 justify-center rounded-full bg-black/55 text-white backdrop-blur-md'
					: 'text-ui text-ink-2 hover:bg-surface-2 h-9 rounded-sm px-3 font-medium'
			} ${className}`}
		>
			<Columns2 className="size-[1.1rem]" aria-hidden="true" />
			{!onPicture && <span aria-hidden="true">{m.compare_original()}</span>}
		</button>
	);
}

/**
 * The zoom as a percentage, which brings the picture back to fit when it was zoomed. Zooming
 * itself is done with the wheel, a pinch, or + and − on the keyboard.
 */
export function ZoomReset() {
	const zoom = useStageZoom((state) => state.zoom);
	const fit = useStageZoom((state) => state.fit);
	const setZoom = useStageZoom((state) => state.setZoom);
	const percent = Math.round((zoom ?? fit) * 100);
	const zoomed = zoom !== null;
	return (
		<button
			type="button"
			disabled={!zoomed}
			title={zoomed ? m.zoom_reset() : m.zoom_hint()}
			aria-label={zoomed ? `${m.zoom_reset()} (${percent} %)` : `${percent} %`}
			onClick={() => {
				setZoom(null);
			}}
			className="text-small tabular text-muted enabled:text-ink enabled:hover:bg-surface flex h-9 items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors disabled:cursor-default"
		>
			{zoomed && <Scan className="size-4" aria-hidden="true" />}
			{percent} %
		</button>
	);
}

/** The picture's size, then the comparison and the zoom, for the bar under the stage. */
export function ZoomStatus({
	size,
	children,
}: {
	size: { width: number; height: number } | null;
	/** More about the output, after its size. */
	children?: ReactNode;
}) {
	const comparable = useStageZoom((state) => state.comparable);
	return (
		<>
			{size && (
				<span className="text-small text-muted tabular">
					{size.width} × {size.height} px
				</span>
			)}
			{children && <span className="text-small text-muted tabular ml-4 flex gap-4">{children}</span>}
			<span className="ml-auto flex items-center gap-1">
				{comparable && <CompareButton />}
				<ZoomReset />
			</span>
		</>
	);
}

/**
 * Zoom and compare from the keyboard: + and − zoom, 0 fits, C held shows the original. Not while
 * typing in a field.
 */
function useZoomShortcuts() {
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
