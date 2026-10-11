import { ChevronsLeftRight, Columns2, Eye } from 'lucide-react';
import {
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	type Ref,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { create } from 'zustand';
import { m } from '@/paraglide/messages.js';
import { isLayoutMoving } from '@/ui/layout-motion';
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
	/** Held down by the hold button or the C key: the original shows instead of the result. */
	holding: boolean;
	/** Turned on by the side-by-side button: the original shows left of a line. */
	comparing: boolean;
	/** Where the line between the original and the result stands, across the picture, from 0 to 1. */
	split: number;
	/** The stage on screen offers the comparison (not while cropping, where it shows the whole picture). */
	comparable: boolean;
	setZoom: (zoom: number | null) => void;
	zoomBy: (factor: number) => void;
	setHolding: (holding: boolean) => void;
	setComparing: (comparing: boolean) => void;
	setSplit: (split: number) => void;
}

/**
 * Whether a zoom from `current` to `next` comes back to the fitted size: it reaches it or passes
 * over it. The zoom stops there, as on a notch, and counts as not zoomed.
 */
function backToFit(current: number, next: number, fit: number): boolean {
	return Math.abs(next - fit) < fit * 0.005 || (current - fit) * (next - fit) < 0;
}

/** The zoom of the preview on screen, shared by the stage, the status bar and the shortcuts. */
export const useStageZoom = create<StageZoom>()((set, get) => ({
	zoom: null,
	fit: 1,
	pan: { x: 0, y: 0 },
	holding: false,
	comparing: false,
	split: 0.5,
	comparable: false,
	setZoom: (zoom) => {
		set({
			zoom: zoom === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
			...(zoom === null && { pan: { x: 0, y: 0 } }),
		});
	},
	zoomBy: (factor) => {
		const { zoom, fit, setZoom } = get();
		const current = zoom ?? fit;
		setZoom(backToFit(current, current * factor, fit) ? null : current * factor);
	},
	setHolding: (holding) => {
		set({ holding: holding && !get().comparing });
	},
	setComparing: (comparing) => {
		set({ comparing, holding: false });
	},
	setSplit: (split) => {
		set({ split: Math.min(1, Math.max(0, split)) });
	},
}));

/** The original is drawn: held to be seen whole, or side by side with the result. */
export function useShowsOriginal(): boolean {
	return useStageZoom((state) => state.comparable && (state.holding || state.comparing));
}

/**
 * Copies a picture just drawn to the canvas showing the original, at its size. A WebGL canvas is
 * copied in the same task as its drawing, before the page shows it and drops its pixels.
 */
export function copyPicture(from: HTMLCanvasElement | OffscreenCanvas, to: HTMLCanvasElement | null): void {
	if (!to) return;
	if (to.width !== from.width) to.width = from.width;
	if (to.height !== from.height) to.height = from.height;
	const context = to.getContext('2d');
	if (!context) return;
	context.clearRect(0, 0, to.width, to.height);
	context.drawImage(from, 0, 0);
}

/**
 * The original, over the result left of the comparison line: placed in the picture's box, over
 * what the edits add (text, fades) and under what isn't an edit (subtitles).
 */
export function OriginalPicture({ ref }: { ref: Ref<HTMLCanvasElement> }) {
	return (
		<canvas
			ref={ref}
			className="pointer-events-none absolute inset-0 size-full [clip-path:inset(0_calc(100%-var(--split,50%))_0_0)]"
			aria-hidden="true"
		/>
	);
}

/** Pixels a canvas needs to look sharp at `display` CSS pixels, never more than the source has. */
export function backingSize(display: number, source: number): number {
	const ratio = window.devicePixelRatio || 1;
	return Math.max(1, Math.round(Math.min(display * ratio, source, 8192)));
}

/** The scale fitting a picture in `area`, leaving `margin` around it on larger screens. */
function fitIn(area: { width: number; height: number }, width: number, height: number, margin: number): number {
	// A phone's picture spans the screen's width: no room is left around it there.
	const room = matchMedia('(min-width: 48rem)').matches ? margin * 2 : 0;
	return area.width > room && area.height > room && width && height
		? Math.min((area.width - room) / width, (area.height - room) / height)
		: 0;
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
	margin = 16,
	children,
}: {
	/** Size of the picture shown, in its own pixels. */
	width: number;
	height: number;
	/**
	 * Room left around the fitted picture on larger screens, in CSS pixels: for the handles of a
	 * crop frame on its edges. Zoomed in, the picture uses the whole stage whatever this is.
	 */
	margin?: number;
	/** Offers the button showing the original while held. */
	compare?: boolean;
	/** Draws the picture at the given scale; it fills a box of the scaled size. */
	children: (scale: number) => ReactNode;
}) {
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const zoom = useStageZoom((state) => state.zoom);
	const pan = useStageZoom((state) => state.pan);
	const comparing = useStageZoom((state) => state.comparing);
	useZoomShortcuts();
	const [panning, setPanning] = useState(false);
	const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);

	const fit = fitIn(area, width, height, margin);
	const scale = zoom ?? fit;
	const display = { width: Math.round(width * scale), height: Math.round(height * scale) };

	// While the editor's columns slide, the stage's size waits for them to settle; meanwhile the
	// fitted picture follows the stage by a scale alone, drawn by the compositor.
	const boxRef = useRef<HTMLDivElement>(null);
	const fitRef = useRef(fit);
	fitRef.current = fit;
	useLayoutEffect(() => {
		const element = areaRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const box = boxRef.current;
			if (!entry || !box || !isLayoutMoving() || useStageZoom.getState().zoom !== null || fitRef.current <= 0)
				return;
			box.style.setProperty(
				'--live-scale',
				String(fitIn(entry.contentRect, width, height, margin) / fitRef.current),
			);
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [width, height, margin]);
	const shown = scale > 0;
	// The comparison line moves by a variable on the box, without drawing the pictures again.
	useLayoutEffect(() => {
		// Held, the original covers the whole picture.
		const show = ({ split, holding }: { split: number; holding: boolean }) =>
			boxRef.current?.style.setProperty('--split', `${(holding ? 1 : split) * 100}%`);
		show(useStageZoom.getState());
		return useStageZoom.subscribe((state, previous) => {
			if (state.split !== previous.split || state.holding !== previous.holding) show(state);
		});
	}, [shown]);
	// Measured again, the picture is drawn at its size: no scale left.
	useLayoutEffect(() => {
		boxRef.current?.style.removeProperty('--live-scale');
	}, [fit]);
	const zoomed = zoom !== null && zoom > fit * 1.001;

	useEffect(() => {
		useStageZoom.setState({ fit });
	}, [fit]);
	useEffect(() => {
		useStageZoom.setState({ comparable: compare });
		return () => {
			useStageZoom.setState({ comparable: false, comparing: false, holding: false });
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
				if (state.zoom !== null && backToFit(current, next, fit)) {
					useStageZoom.setState({ zoom: null, pan: { x: 0, y: 0 } });
					return;
				}
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
	// Moving the zoomed picture around or comparing leaves it as it is: drawn again only for a new
	// scale or new content.
	const picture = useMemo((): ReactNode => children(scale), [children, scale]);

	return (
		<div
			ref={areaRef}
			className={`relative size-full touch-none [overflow:clip] ${zoomed ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
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
			onLostPointerCapture={() => {
				drag.current = null;
				setPanning(false);
			}}
		>
			{shown && (
				<div
					ref={boxRef}
					className="absolute top-1/2 left-1/2 will-change-transform"
					style={{
						width: display.width,
						height: display.height,
						transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(var(--live-scale, 1))`,
					}}
				>
					{picture}
					{compare && comparing && <CompareLine />}
				</div>
			)}
			{compare && <HoldButton className="absolute top-2 right-2 z-10 md:hidden" onPicture />}
		</div>
	);
}

/**
 * Shows the original while held, by pointer or keyboard; disabled while the side-by-side
 * comparison is on. In the stage's bar on larger screens; on a phone, on the picture's corner,
 * where the thumb is.
 */
function HoldButton({ className = '', onPicture = false }: { className?: string; onPicture?: boolean }) {
	const holding = useStageZoom((state) => state.holding);
	const comparing = useStageZoom((state) => state.comparing);
	const setHolding = useStageZoom((state) => state.setHolding);
	return (
		<button
			type="button"
			aria-label={m.compare_hold()}
			data-tip={comparing ? undefined : m.compare_hold()}
			aria-pressed={holding}
			disabled={comparing}
			onPointerDown={(event) => {
				event.stopPropagation();
				setHolding(true);
			}}
			onPointerUp={() => {
				setHolding(false);
			}}
			onPointerLeave={() => {
				setHolding(false);
			}}
			onKeyDown={(event) => {
				if (event.key === ' ' || event.key === 'Enter') setHolding(true);
			}}
			onKeyUp={() => {
				setHolding(false);
			}}
			onBlur={() => {
				setHolding(false);
			}}
			className={`aria-pressed:bg-ed aria-pressed:text-ed-ink grid size-9 place-items-center transition-colors duration-150 select-none disabled:cursor-default disabled:opacity-35 ${
				onPicture
					? 'rounded-full bg-black/55 text-white backdrop-blur-md'
					: 'text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink rounded-sm'
			} ${className}`}
		>
			<Eye className="size-[1.1rem]" aria-hidden="true" />
		</button>
	);
}

/** Turns the side-by-side comparison on and off: the original left of a line, the result right. */
function SideBySideButton() {
	const comparing = useStageZoom((state) => state.comparing);
	const setComparing = useStageZoom((state) => state.setComparing);
	return (
		<button
			type="button"
			aria-label={m.compare_side()}
			data-tip={m.compare_side()}
			aria-pressed={comparing}
			onClick={() => {
				setComparing(!comparing);
			}}
			className="aria-pressed:bg-ed aria-pressed:text-ed-ink text-ink-2 hover:bg-surface hover:text-ink grid size-9 place-items-center rounded-sm transition-colors duration-150 select-none"
		>
			<Columns2 className="size-[1.1rem]" aria-hidden="true" />
		</button>
	);
}

/** The two ways of comparing with the original, for the bar under the stage on larger screens. */
export function CompareButtons({ className = '' }: { className?: string }) {
	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<HoldButton />
			<SideBySideButton />
		</span>
	);
}

/** Arrow keys move the comparison line by this share of the picture; with Shift, more. */
const SPLIT_STEP = 0.02;

/**
 * The line between the original, on its left, and the result: dragged by its handle or anywhere
 * along it, or moved with the arrow keys. It stays where it was left between comparisons.
 */
function CompareLine() {
	const split = useStageZoom((state) => state.split);
	const setSplit = useStageZoom((state) => state.setSplit);
	const moveTo = (event: ReactPointerEvent<HTMLElement>) => {
		const box = event.currentTarget.parentElement?.getBoundingClientRect();
		if (box && box.width > 0) setSplit((event.clientX - box.left) / box.width);
	};
	const percent = Math.round(split * 100);
	return (
		<>
			<span className="pointer-events-none absolute top-2 left-2 rounded-xs bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
				{m.compare_original()}
			</span>
			<span className="pointer-events-none absolute top-2 right-2 rounded-xs bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
				{m.compare_result()}
			</span>
			<div
				role="slider"
				tabIndex={0}
				aria-label={m.compare_split()}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-valuetext={`${percent} %`}
				data-no-pan
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.stopPropagation();
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event);
				}}
				onKeyDown={(event) => {
					if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
					event.preventDefault();
					event.stopPropagation();
					const step = (event.shiftKey ? 5 : 1) * SPLIT_STEP;
					setSplit(split + (event.key === 'ArrowLeft' ? -step : step));
				}}
				className="group absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
				style={{ left: 'var(--split, 50%)' }}
			>
				<span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
				<span className="group-focus-visible:outline-ed-text absolute top-1/2 left-1/2 grid size-8 -translate-1/2 place-items-center rounded-full bg-white text-black shadow-[0_0_0_1px_rgb(0_0_0/0.15),0_4px_12px_rgb(0_0_0/0.35)] transition-transform group-hover:scale-105 group-focus-visible:outline-2 group-focus-visible:outline-offset-2">
					<ChevronsLeftRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
				</span>
			</div>
		</>
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
			<span className="ml-auto flex items-center gap-1">{comparable && <CompareButtons />}</span>
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
			else if ((event.key === 'c' || event.key === 'C') && !event.repeat) zoom.setHolding(true);
			else return;
			event.preventDefault();
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === 'c' || event.key === 'C') useStageZoom.getState().setHolding(false);
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, []);
}
