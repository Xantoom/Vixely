import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SelectionBox, type SelectionHandle } from '@/components/ui/SelectionBox.tsx';
import { useImageEditorStore, type CropRect, type ViewTransform } from '@/stores/imageEditor.ts';

interface CropOverlayProps {
	containerRef: RefObject<HTMLDivElement | null>;
	view: ViewTransform;
	imageWidth: number;
	imageHeight: number;
	getIsPanning: () => boolean;
}

function screenToImage(clientX: number, clientY: number, containerRect: DOMRect, view: ViewTransform) {
	return {
		x: (clientX - containerRect.left - view.panX) / view.zoom,
		y: (clientY - containerRect.top - view.panY) / view.zoom,
	};
}

function clampRect(r: CropRect, imgW: number, imgH: number): CropRect {
	let { x, y, width, height } = r;
	if (width < 0) {
		x += width;
		width = -width;
	}
	if (height < 0) {
		y += height;
		height = -height;
	}
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

	const dragging = useRef<{ handle: SelectionHandle; startX: number; startY: number; startCrop: CropRect } | null>(
		null,
	);
	const creating = useRef<{ startX: number; startY: number } | null>(null);

	const getRect = useCallback(() => containerRef.current?.getBoundingClientRect(), [containerRef]);

	/* ── Create new crop by dragging on empty area ── */
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || getIsPanning() || dragging.current) return;
			if (!(e.target instanceof HTMLElement)) return;
			if (e.target.dataset.cropHandle || e.target.dataset.cropArea) return;

			const rect = getRect();
			if (!rect) return;
			const pt = screenToImage(e.clientX, e.clientY, rect, view);
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
				if (crop && (crop.width < 2 || crop.height < 2)) setCrop(null);
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
		(e: React.PointerEvent, handle: SelectionHandle) => {
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
				if (handle.includes('e')) width += dx;
				if (handle.includes('n')) {
					y += dy;
					height -= dy;
				}
				if (handle.includes('s')) height += dy;

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
		[crop, view.zoom, imageWidth, imageHeight, cropAspectRatio, setCrop],
	);

	const onHandlePointerUp = useCallback(() => {
		dragging.current = null;
	}, []);

	if (!crop || crop.width < 1 || crop.height < 1) return null;

	// Convert image-space crop to screen-space
	const sx = crop.x * view.zoom + view.panX;
	const sy = crop.y * view.zoom + view.panY;
	const sw = crop.width * view.zoom;
	const sh = crop.height * view.zoom;

	// Image bounds in screen space for the scrim
	const imgLeft = view.panX;
	const imgTop = view.panY;
	const imgW = imageWidth * view.zoom;
	const imgH = imageHeight * view.zoom;

	return (
		<div
			className="absolute inset-0 pointer-events-none"
			onPointerMove={onHandlePointerMove}
			onPointerUp={onHandlePointerUp}
			onPointerCancel={onHandlePointerUp}
		>
			{/* Scrim outside crop (image area only) */}
			<div
				className="absolute pointer-events-none"
				style={{
					left: imgLeft,
					top: imgTop,
					width: imgW,
					height: imgH,
					background: 'rgba(0, 0, 0, 0.50)',
					clipPath: `polygon(
						0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
						${sx - imgLeft}px ${sy - imgTop}px,
						${sx - imgLeft}px ${sy - imgTop + sh}px,
						${sx - imgLeft + sw}px ${sy - imgTop + sh}px,
						${sx - imgLeft + sw}px ${sy - imgTop}px,
						${sx - imgLeft}px ${sy - imgTop}px
					)`,
				}}
			/>

			{/* Shared selection box */}
			<div className="pointer-events-auto" data-crop-area="true">
				<SelectionBox
					left={sx}
					top={sy}
					width={sw}
					height={sh}
					displayWidth={Math.round(crop.width)}
					displayHeight={Math.round(crop.height)}
					showEdgeHandles
					onHandlePointerDown={onHandlePointerDown}
				/>
			</div>
		</div>
	);
}
