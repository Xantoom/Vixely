import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useImageEditorStore, type CropRect, type ViewTransform } from '@/stores/imageEditor.ts';
import { formatDimensions } from '@/utils/format.ts';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

const HANDLE_SIZE = 8;

interface CropOverlayProps {
	containerRef: RefObject<HTMLDivElement | null>;
	view: ViewTransform;
	imageWidth: number;
	imageHeight: number;
	getIsPanning: () => boolean;
}

function screenToImage(
	clientX: number,
	clientY: number,
	containerRect: DOMRect,
	view: ViewTransform,
): { x: number; y: number } {
	return {
		x: (clientX - containerRect.left - view.panX) / view.zoom,
		y: (clientY - containerRect.top - view.panY) / view.zoom,
	};
}

function imageToScreen(ix: number, iy: number, view: ViewTransform): { x: number; y: number } {
	return { x: ix * view.zoom + view.panX, y: iy * view.zoom + view.panY };
}

function clampRect(r: CropRect, imgW: number, imgH: number): CropRect {
	let { x, y, width, height } = r;
	// Ensure positive dimensions
	if (width < 0) {
		x += width;
		width = -width;
	}
	if (height < 0) {
		y += height;
		height = -height;
	}
	// Clamp to image bounds
	x = Math.max(0, Math.min(x, imgW));
	y = Math.max(0, Math.min(y, imgH));
	width = Math.min(width, imgW - x);
	height = Math.min(height, imgH - y);
	return { x, y, width, height };
}

export function CropOverlay({ containerRef, view, imageWidth, imageHeight, getIsPanning }: CropOverlayProps) {
	const { crop, cropAspectRatio, setCrop } = useImageEditorStore(
		useShallow((s) => ({ crop: s.crop, cropAspectRatio: s.cropAspectRatio, setCrop: s.setCrop })),
	);

	const dragging = useRef<{ handle: Handle; startX: number; startY: number; startCrop: CropRect } | null>(null);
	const creating = useRef<{ startX: number; startY: number } | null>(null);

	const getRect = useCallback(() => containerRef.current?.getBoundingClientRect(), [containerRef]);

	/* ── Create new crop by dragging on empty area ── */
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || getIsPanning() || dragging.current) return;
			if (!(e.target instanceof HTMLElement)) return;
			// Only create if clicking on the overlay area (not on a handle)
			if (e.target.dataset.cropHandle) return;
			if (e.target.dataset.cropArea) return;

			const rect = getRect();
			if (!rect) return;
			const pt = screenToImage(e.clientX, e.clientY, rect, view);

			// Only start if inside image bounds
			if (pt.x < 0 || pt.y < 0 || pt.x > imageWidth || pt.y > imageHeight) return;

			creating.current = { startX: pt.x, startY: pt.y };
			el.setPointerCapture(e.pointerId);
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!creating.current) return;
			const rect = getRect();
			if (!rect) return;
			const pt = screenToImage(e.clientX, e.clientY, rect, view);
			const sx = creating.current.startX;
			const sy = creating.current.startY;
			let w = pt.x - sx;
			let h = pt.y - sy;

			if (cropAspectRatio) {
				const absW = Math.abs(w);
				const absH = Math.abs(h);
				if (absW / cropAspectRatio > absH) {
					h = (Math.sign(h || 1) * absW) / cropAspectRatio;
				} else {
					w = Math.sign(w || 1) * absH * cropAspectRatio;
				}
			}

			setCrop(clampRect({ x: sx, y: sy, width: w, height: h }, imageWidth, imageHeight));
		};

		const onPointerUp = () => {
			if (creating.current) {
				creating.current = null;
				// Remove tiny crops
				if (crop && (crop.width < 2 || crop.height < 2)) {
					setCrop(null);
				}
			}
		};

		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerUp);
		return () => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerUp);
		};
	}, [containerRef, view, imageWidth, imageHeight, crop, cropAspectRatio, setCrop, getRect, getIsPanning]);

	/* ── Handle dragging (move / resize existing crop) ── */
	const onHandlePointerDown = useCallback(
		(e: React.PointerEvent, handle: Handle) => {
			e.stopPropagation();
			if (!crop) return;
			dragging.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		[crop],
	);

	const onHandlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragging.current || !crop) return;
			const rect = getRect();
			if (!rect) return;

			const { handle, startCrop } = dragging.current;
			const dx = (e.clientX - dragging.current.startX) / view.zoom;
			const dy = (e.clientY - dragging.current.startY) / view.zoom;

			let newCrop: CropRect;

			if (handle === 'move') {
				newCrop = {
					x: Math.max(0, Math.min(startCrop.x + dx, imageWidth - startCrop.width)),
					y: Math.max(0, Math.min(startCrop.y + dy, imageHeight - startCrop.height)),
					width: startCrop.width,
					height: startCrop.height,
				};
			} else {
				let { x, y, width, height } = startCrop;

				if (handle.includes('w')) {
					x += dx;
					width -= dx;
				}
				if (handle.includes('e')) {
					width += dx;
				}
				if (handle.includes('n')) {
					y += dy;
					height -= dy;
				}
				if (handle.includes('s')) {
					height += dy;
				}

				if (cropAspectRatio) {
					if (handle === 'n' || handle === 's') {
						width = Math.abs(height) * cropAspectRatio;
					} else {
						height = Math.abs(width) / cropAspectRatio;
					}
				}

				newCrop = clampRect({ x, y, width, height }, imageWidth, imageHeight);
			}

			setCrop(newCrop);
		},
		[crop, view.zoom, imageWidth, imageHeight, cropAspectRatio, setCrop, getRect],
	);

	const onHandlePointerUp = useCallback(() => {
		dragging.current = null;
	}, []);

	if (!crop || crop.width < 1 || crop.height < 1) return null;

	// Convert image-space crop to screen-space
	const tl = imageToScreen(crop.x, crop.y, view);
	const br = imageToScreen(crop.x + crop.width, crop.y + crop.height, view);
	const sx = tl.x;
	const sy = tl.y;
	const sw = br.x - tl.x;
	const sh = br.y - tl.y;

	// Image bounds in screen space
	const imgTL = imageToScreen(0, 0, view);
	const imgBR = imageToScreen(imageWidth, imageHeight, view);

	const handlePositions: { handle: Handle; x: number; y: number; cursor: string }[] = [
		{ handle: 'nw', x: sx, y: sy, cursor: 'nwse-resize' },
		{ handle: 'n', x: sx + sw / 2, y: sy, cursor: 'ns-resize' },
		{ handle: 'ne', x: sx + sw, y: sy, cursor: 'nesw-resize' },
		{ handle: 'e', x: sx + sw, y: sy + sh / 2, cursor: 'ew-resize' },
		{ handle: 'se', x: sx + sw, y: sy + sh, cursor: 'nwse-resize' },
		{ handle: 's', x: sx + sw / 2, y: sy + sh, cursor: 'ns-resize' },
		{ handle: 'sw', x: sx, y: sy + sh, cursor: 'nesw-resize' },
		{ handle: 'w', x: sx, y: sy + sh / 2, cursor: 'ew-resize' },
	];

	return (
		<div className="absolute inset-0 pointer-events-none">
			{/* Dimmed regions outside crop (using clip-path) */}
			<div
				className="absolute pointer-events-none"
				style={{
					left: imgTL.x,
					top: imgTL.y,
					width: imgBR.x - imgTL.x,
					height: imgBR.y - imgTL.y,
					background: 'rgba(0, 0, 0, 0.55)',
					clipPath: `polygon(
						0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
						${sx - imgTL.x}px ${sy - imgTL.y}px,
						${sx - imgTL.x}px ${sy - imgTL.y + sh}px,
						${sx - imgTL.x + sw}px ${sy - imgTL.y + sh}px,
						${sx - imgTL.x + sw}px ${sy - imgTL.y}px,
						${sx - imgTL.x}px ${sy - imgTL.y}px
					)`,
				}}
			/>

			{/* Crop border */}
			<div
				className="absolute border border-white/80 pointer-events-none"
				style={{ left: sx, top: sy, width: sw, height: sh, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }}
			>
				{/* Rule of thirds grid */}
				<div className="absolute inset-0">
					<div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
					<div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
					<div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
					<div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
				</div>
			</div>

			{/* Move area (inside crop) */}
			<div
				data-crop-area="true"
				className="absolute pointer-events-auto cursor-move"
				style={{ left: sx, top: sy, width: sw, height: sh }}
				onPointerDown={(e) => {
					onHandlePointerDown(e, 'move');
				}}
				onPointerMove={onHandlePointerMove}
				onPointerUp={onHandlePointerUp}
			/>

			{/* Resize handles */}
			{handlePositions.map(({ handle, x, y, cursor }) => (
				<div
					key={handle}
					data-crop-handle="true"
					className="absolute pointer-events-auto bg-white rounded-sm shadow-md border border-black/20"
					style={{
						left: x - HANDLE_SIZE / 2,
						top: y - HANDLE_SIZE / 2,
						width: HANDLE_SIZE,
						height: HANDLE_SIZE,
						cursor,
					}}
					onPointerDown={(e) => {
						onHandlePointerDown(e, handle);
					}}
					onPointerMove={onHandlePointerMove}
					onPointerUp={onHandlePointerUp}
				/>
			))}

			{/* Crop dimensions label */}
			<div
				className="absolute text-[14px] font-mono text-white bg-black/60 rounded px-1.5 py-0.5 pointer-events-none"
				style={{ left: sx + sw / 2, top: sy + sh + 8, transform: 'translateX(-50%)' }}
			>
				{formatDimensions(Math.round(crop.width), Math.round(crop.height))}
			</div>
		</div>
	);
}
