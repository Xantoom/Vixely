import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Rect } from '@/editors/image/document';
import { m } from '@/paraglide/messages.js';
import { backingSize } from '../ZoomStage';
import { drawOverlays, overlaySize, traceStroke, useOverlayAssets } from './draw';
import { type OverlayEditing, placeOverlay, updateZone, useBrush, useOverlaySelection } from './editing';
import { createDrawing, fitDrawing, type Overlay } from './model';

type Gesture =
	| { kind: 'move'; id: string; x: number; y: number; start: Overlay }
	| { kind: 'resize'; id: string; distance: number; start: Overlay }
	| { kind: 'stretch'; id: string; start: Overlay }
	| { kind: 'rotate'; id: string; start: Overlay };

/** How close to the middle, in screen pixels, a moved overlay snaps to it. */
const SNAP = 6;

function describe(overlay: Overlay): string {
	if (overlay.kind === 'text') return m.overlay_text({ text: overlay.text.split('\n')[0] ?? '' });
	if (overlay.kind === 'sticker') return m.overlay_sticker();
	if (overlay.kind === 'zone') return overlay.effect === 'blur' ? m.layers_zone_blur() : m.layers_zone_pixelate();
	if (overlay.kind === 'drawing') return m.layers_drawing();
	return m.overlay_shape();
}

/**
 * The text and stickers while the picture is cropped: they belong to the cropped output, so they
 * lie in the crop frame, `crop` in picture pixels shown `scale` times, and move with it.
 */
export function CroppedLayers({ overlays, crop, scale }: { overlays: readonly Overlay[]; crop: Rect; scale: number }) {
	if (overlays.length === 0) return null;
	return (
		<div
			className="pointer-events-none absolute overflow-hidden"
			style={{
				left: crop.x * scale,
				top: crop.y * scale,
				width: crop.width * scale,
				height: crop.height * scale,
			}}
		>
			<OverlayLayer overlays={overlays} width={crop.width * scale} height={crop.height * scale} />
		</div>
	);
}

/**
 * Text and stickers over the preview: drawn by the same code as the export, with a frame to move,
 * resize and turn the one selected when `editing` is given. Its box is the output, `width` by
 * `height` CSS pixels.
 */
export function OverlayLayer({
	overlays,
	width,
	height,
	editing,
	onEditText,
}: {
	overlays: readonly Overlay[];
	width: number;
	height: number;
	/** Given while the text or sticker tool is open. */
	editing?: OverlayEditing;
	/** A double-click on text: the panel's text field takes focus. */
	onEditText?: () => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const assets = useOverlayAssets(overlays);
	const selected = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const gesture = useRef<Gesture | null>(null);
	const [guides, setGuides] = useState({ x: false, y: false });
	const brush = useBrush();
	const drawing = brush.active && editing !== undefined;
	/** The line being drawn, points as shares of the output, until the pointer lifts. */
	const stroke = useRef<number[] | null>(null);
	const inkRef = useRef<HTMLCanvasElement>(null);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || width === 0) return;
		// Sharp at the screen's density, but never larger than the canvas limit.
		const pixels = { width: backingSize(width, 8192), height: backingSize(height, 8192) };
		if (canvas.width !== pixels.width) canvas.width = pixels.width;
		if (canvas.height !== pixels.height) canvas.height = pixels.height;
		context.clearRect(0, 0, canvas.width, canvas.height);
		drawOverlays(context, overlays, pixels);
	}, [overlays, width, height, assets]);

	// Delete removes the selection, arrows nudge it; not while typing.
	useEffect(() => {
		if (!editing || !selected) return;
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select')))
				return;
			const overlay = editing.overlays.find((candidate) => candidate.id === selected);
			if (!overlay) return;
			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				editing.apply((list) => list.filter((candidate) => candidate.id !== selected));
				select(null);
			} else if (event.key === 'Escape') select(null);
			else if (event.key.startsWith('Arrow')) {
				event.preventDefault();
				const step = event.shiftKey ? 10 : 1;
				const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
				const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
				editing.apply(placeOverlay(selected, { x: overlay.x + dx / width, y: overlay.y + dy / height }));
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
		};
	}, [editing, selected, select, width, height]);

	/** The overlay's centre on screen. */
	const centre = (overlay: Overlay) => {
		const rect = boxRef.current?.getBoundingClientRect();
		return { x: (rect?.left ?? 0) + overlay.x * width, y: (rect?.top ?? 0) + overlay.y * height };
	};

	const onMove = (event: React.PointerEvent) => {
		const current = gesture.current;
		if (!current || !editing) return;
		const { start } = current;
		if (current.kind === 'move') {
			let x = start.x + (event.clientX - current.x) / width;
			let y = start.y + (event.clientY - current.y) / height;
			const snapX = !event.altKey && Math.abs(x - 0.5) * width < SNAP;
			const snapY = !event.altKey && Math.abs(y - 0.5) * height < SNAP;
			if (snapX) x = 0.5;
			if (snapY) y = 0.5;
			setGuides({ x: snapX, y: snapY });
			editing.preview(placeOverlay(current.id, { x, y }));
		} else if (current.kind === 'stretch') {
			// A zone's corners pull its sides freely, around its centre.
			const point = centre(start);
			const halfWidth = Math.max(4, Math.abs(event.clientX - point.x));
			const halfHeight = Math.max(4, Math.abs(event.clientY - point.y));
			const unit = Math.min(width, height);
			editing.preview(updateZone(current.id, { size: (halfHeight * 2) / unit, aspect: halfWidth / halfHeight }));
		} else if (current.kind === 'resize') {
			const point = centre(start);
			const distance = Math.hypot(event.clientX - point.x, event.clientY - point.y);
			const size = Math.min(3, Math.max(0.01, (start.size * distance) / Math.max(1, current.distance)));
			editing.preview(placeOverlay(current.id, { size }));
		} else {
			const point = centre(start);
			let rotation = (Math.atan2(event.clientY - point.y, event.clientX - point.x) * 180) / Math.PI + 90;
			rotation = (((rotation % 360) + 540) % 360) - 180;
			// Straight and diagonal angles catch the handle, unless Shift is held.
			const nearest = Math.round(rotation / 45) * 45;
			if (!event.shiftKey && Math.abs(rotation - nearest) < 4) rotation = nearest;
			editing.preview(placeOverlay(current.id, { rotation: Math.round(rotation * 10) / 10 }));
		}
	};

	const onUp = () => {
		if (!gesture.current || !editing) return;
		gesture.current = null;
		setGuides({ x: false, y: false });
		editing.settle();
	};

	/** Where the pointer is, as shares of the output. */
	const share = (event: React.PointerEvent) => {
		const rect = boxRef.current?.getBoundingClientRect();
		return [(event.clientX - (rect?.left ?? 0)) / width, (event.clientY - (rect?.top ?? 0)) / height];
	};
	const paint = () => {
		const canvas = inkRef.current;
		const context = canvas?.getContext('2d');
		const points = stroke.current;
		if (!canvas || !context || !points) return;
		const pixels = { width: backingSize(width, 8192), height: backingSize(height, 8192) };
		if (canvas.width !== pixels.width) canvas.width = pixels.width;
		if (canvas.height !== pixels.height) canvas.height = pixels.height;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.strokeStyle = brush.color;
		context.lineWidth = brush.width * Math.min(canvas.width, canvas.height);
		const inPixels = points.map((value, index) => value * (index % 2 === 0 ? canvas.width : canvas.height));
		traceStroke(context, inPixels, 1);
		context.stroke();
	};
	const endStroke = () => {
		const points = stroke.current;
		stroke.current = null;
		inkRef.current?.getContext('2d')?.clearRect(0, 0, inkRef.current.width, inkRef.current.height);
		if (!points || !editing) return;
		const line = { color: brush.color, width: brush.width, points };
		const output = { width, height };
		// Lines drawn one after the other gather in the drawing selected.
		const current = editing.overlays.find((overlay) => overlay.id === selected);
		if (current?.kind === 'drawing') {
			const next = fitDrawing(current, [line], output);
			if (next) editing.apply((list) => list.map((overlay) => (overlay.id === current.id ? next : overlay)));
			return;
		}
		const made = createDrawing([line], output);
		if (!made) return;
		editing.apply((list) => [...list, made]);
		select(made.id);
	};

	const begin = (event: React.PointerEvent, next: Gesture) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		gesture.current = next;
		select(next.id);
	};

	return (
		<div ref={boxRef} className="pointer-events-none absolute inset-0">
			<canvas ref={canvasRef} className="absolute inset-0 size-full" />
			{editing && (
				<div
					className="pointer-events-auto absolute inset-0"
					onClick={() => {
						select(null);
					}}
				/>
			)}
			{guides.x && <div className="bg-ed pointer-events-none absolute inset-y-0 left-1/2 w-px" />}
			{guides.y && <div className="bg-ed pointer-events-none absolute inset-x-0 top-1/2 h-px" />}
			{editing &&
				overlays.map((overlay) => {
					const size = overlaySize(overlay, { width, height });
					const active = overlay.id === selected;
					return (
						<div
							key={overlay.id}
							data-no-pan
							role="button"
							tabIndex={0}
							aria-label={describe(overlay)}
							aria-pressed={active}
							onFocus={() => {
								select(overlay.id);
							}}
							onDoubleClick={() => {
								if (overlay.kind === 'text') onEditText?.();
							}}
							onPointerDown={(event) => {
								begin(event, {
									kind: 'move',
									id: overlay.id,
									x: event.clientX,
									y: event.clientY,
									start: overlay,
								});
							}}
							onPointerMove={onMove}
							onPointerUp={onUp}
							onPointerCancel={onUp}
							className={`pointer-events-auto absolute cursor-move touch-none outline-none ${overlay.kind === 'zone' && overlay.round ? 'rounded-[50%]' : 'rounded-[2px]'} ${overlay.kind === 'zone' && !active ? 'outline-1 outline-dashed outline-white/70' : ''} ${active ? 'shadow-[0_0_0_1.5px_var(--ed),0_0_0_3px_rgb(255_255_255/0.6)]' : 'hover:shadow-[0_0_0_1px_rgb(255_255_255/0.8),0_0_0_2px_rgb(0_0_0/0.25)] focus-visible:shadow-[0_0_0_1.5px_var(--ed)]'}`}
							style={{
								left: overlay.x * width,
								top: overlay.y * height,
								width: size.width,
								height: size.height,
								transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg)`,
							}}
						>
							{active && (
								<>
									{/* Corners resize, the knob above turns. */}
									{(
										[
											'-left-1.5 -top-1.5',
											'-right-1.5 -top-1.5',
											'-left-1.5 -bottom-1.5',
											'-right-1.5 -bottom-1.5',
										] as const
									).map((corner) => (
										<span
											key={corner}
											aria-hidden="true"
											onPointerDown={(event) => {
												if (overlay.kind === 'zone') {
													begin(event, { kind: 'stretch', id: overlay.id, start: overlay });
													return;
												}
												const point = centre(overlay);
												begin(event, {
													kind: 'resize',
													id: overlay.id,
													distance: Math.hypot(
														event.clientX - point.x,
														event.clientY - point.y,
													),
													start: overlay,
												});
											}}
											onPointerMove={onMove}
											onPointerUp={onUp}
											className={`border-ed absolute size-3 cursor-nwse-resize rounded-full border-2 bg-white shadow-sm ${corner}`}
										/>
									))}
									{overlay.kind !== 'zone' && (
										<>
											<span
												aria-hidden="true"
												className="bg-ed absolute -top-6 left-1/2 h-4.5 w-px"
											/>
											<span
												aria-hidden="true"
												onPointerDown={(event) => {
													begin(event, { kind: 'rotate', id: overlay.id, start: overlay });
												}}
												onPointerMove={onMove}
												onPointerUp={onUp}
												className="border-ed cursor-rotate absolute -top-8 left-1/2 size-3.5 -translate-x-1/2 rounded-full border-2 bg-white shadow-sm"
											/>
										</>
									)}
								</>
							)}
						</div>
					);
				})}
			{drawing && (
				<>
					<canvas ref={inkRef} className="pointer-events-none absolute inset-0 size-full" />
					<div
						data-no-pan
						aria-label={m.brush_surface()}
						className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							event.stopPropagation();
							event.currentTarget.setPointerCapture(event.pointerId);
							stroke.current = share(event);
							paint();
						}}
						onPointerMove={(event) => {
							if (!stroke.current) return;
							// Every coalesced point, so fast lines stay round.
							const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
							const rect = boxRef.current?.getBoundingClientRect();
							for (const point of events) {
								stroke.current.push(
									(point.clientX - (rect?.left ?? 0)) / width,
									(point.clientY - (rect?.top ?? 0)) / height,
								);
							}
							paint();
						}}
						onPointerUp={endStroke}
						onPointerCancel={endStroke}
					/>
				</>
			)}
		</div>
	);
}
