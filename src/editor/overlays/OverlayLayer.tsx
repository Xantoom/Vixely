import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { m } from '@/paraglide/messages.js';
import { backingSize } from '../ZoomStage';
import { drawOverlays, overlaySize, useOverlayAssets } from './draw';
import { type OverlayEditing, placeOverlay, useOverlaySelection } from './editing';
import type { Overlay } from './model';

type Gesture =
	| { kind: 'move'; id: string; x: number; y: number; start: Overlay }
	| { kind: 'resize'; id: string; distance: number; start: Overlay }
	| { kind: 'rotate'; id: string; start: Overlay };

/** How close to the middle, in screen pixels, a moved overlay snaps to it. */
const SNAP = 6;

function describe(overlay: Overlay): string {
	if (overlay.kind === 'text') return m.overlay_text({ text: overlay.text.split('\n')[0] ?? '' });
	if (overlay.kind === 'sticker') return m.overlay_sticker();
	return m.overlay_shape();
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
							className={`pointer-events-auto absolute cursor-move touch-none rounded-[2px] outline-none ${active ? 'shadow-[0_0_0_1.5px_var(--ed),0_0_0_3px_rgb(255_255_255/0.6)]' : 'hover:shadow-[0_0_0_1px_rgb(255_255_255/0.8),0_0_0_2px_rgb(0_0_0/0.25)] focus-visible:shadow-[0_0_0_1.5px_var(--ed)]'}`}
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
									<span aria-hidden="true" className="bg-ed absolute -top-6 left-1/2 h-4.5 w-px" />
									<span
										aria-hidden="true"
										onPointerDown={(event) => {
											begin(event, { kind: 'rotate', id: overlay.id, start: overlay });
										}}
										onPointerMove={onMove}
										onPointerUp={onUp}
										className="border-ed absolute -top-8 left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 bg-white shadow-sm"
									/>
								</>
							)}
						</div>
					);
				})}
		</div>
	);
}
