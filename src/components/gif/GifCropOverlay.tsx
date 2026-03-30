import { memo, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SelectionBox, type SelectionHandle } from '@/components/ui/SelectionBox.tsx';
import { CROP_ASPECT_RATIOS, useGifEditorStore, type CropRect } from '@/stores/gifEditor.ts';

interface GifCropOverlayProps {
	sourceWidth: number;
	sourceHeight: number;
}

const MIN_SIZE = 8;

const DRAG_CURSORS: Record<string, string> = {
	move: 'grabbing',
	n: 'ns-resize',
	s: 'ns-resize',
	e: 'ew-resize',
	w: 'ew-resize',
	nw: 'nwse-resize',
	ne: 'nesw-resize',
	sw: 'nesw-resize',
	se: 'nwse-resize',
};

interface DragState {
	handle: SelectionHandle;
	pointerId: number;
	offsetX: number;
	offsetY: number;
	anchorX: number;
	anchorY: number;
	startCrop: CropRect;
	startClientX: number;
	startClientY: number;
}

export const GifCropOverlay = memo(function GifCropOverlay({ sourceWidth, sourceHeight }: GifCropOverlayProps) {
	const { crop, setCrop, cropLockAspect, cropAspect } = useGifEditorStore(
		useShallow((s) => ({
			crop: s.crop,
			setCrop: s.setCrop,
			cropLockAspect: s.cropLockAspect,
			cropAspect: s.cropAspect,
		})),
	);

	const dragRef = useRef<DragState | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	const presetRatio = CROP_ASPECT_RATIOS[cropAspect];
	const lockedRatio = presetRatio ?? (cropLockAspect && crop && crop.height > 0 ? crop.width / crop.height : null);

	const toSource = useCallback(
		(clientX: number, clientY: number): { x: number; y: number } => {
			const rect = rootRef.current?.getBoundingClientRect();
			if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
			return {
				x: ((clientX - rect.left) / rect.width) * sourceWidth,
				y: ((clientY - rect.top) / rect.height) * sourceHeight,
			};
		},
		[sourceWidth, sourceHeight],
	);

	/** Clamp dimensions to source bounds while strictly preserving ratio when locked. */
	const clampWithRatio = useCallback(
		(x: number, y: number, w: number, h: number, ratio: number | null): CropRect => {
			// Enforce minimum
			w = Math.max(MIN_SIZE, w);
			h = Math.max(MIN_SIZE, h);

			if (ratio) {
				// Max size that fits the source at this ratio
				const maxW = Math.min(sourceWidth, sourceHeight * ratio);
				const maxH = maxW / ratio;
				// Clamp to max while keeping ratio exact
				if (w > maxW) {
					w = maxW;
				}
				h = w / ratio;
				if (h > maxH) {
					h = maxH;
					w = h * ratio;
				}
				// Re-enforce minimum after max clamp
				if (w < MIN_SIZE) {
					w = MIN_SIZE;
					h = w / ratio;
				}
			} else {
				w = Math.min(w, sourceWidth);
				h = Math.min(h, sourceHeight);
			}

			// Clamp position
			x = Math.max(0, Math.min(x, sourceWidth - w));
			y = Math.max(0, Math.min(y, sourceHeight - h));

			return { x, y, width: w, height: h };
		},
		[sourceWidth, sourceHeight],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent, handle: SelectionHandle) => {
			if (!crop) return;
			e.preventDefault();
			e.stopPropagation();
			rootRef.current?.setPointerCapture(e.pointerId);

			const cursor = toSource(e.clientX, e.clientY);

			const left = crop.x;
			const right = crop.x + crop.width;
			const cTop = crop.y;
			const bottom = crop.y + crop.height;

			let anchorX = left;
			let anchorY = cTop;
			let offsetX = 0;
			let offsetY = 0;

			if (handle.includes('e')) {
				anchorX = left;
				offsetX = cursor.x - right;
			} else if (handle.includes('w')) {
				anchorX = right;
				offsetX = cursor.x - left;
			}
			if (handle.includes('s')) {
				anchorY = cTop;
				offsetY = cursor.y - bottom;
			} else if (handle.includes('n')) {
				anchorY = bottom;
				offsetY = cursor.y - cTop;
			}

			dragRef.current = {
				handle,
				pointerId: e.pointerId,
				offsetX,
				offsetY,
				anchorX,
				anchorY,
				startCrop: { ...crop },
				startClientX: e.clientX,
				startClientY: e.clientY,
			};

			if (rootRef.current) {
				rootRef.current.style.cursor = DRAG_CURSORS[handle] ?? 'default';
			}
		},
		[crop, toSource],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			const d = dragRef.current;
			if (!d || e.pointerId !== d.pointerId) return;

			const sc = d.startCrop;

			// ── Move ──
			if (d.handle === 'move') {
				const rect = rootRef.current?.getBoundingClientRect();
				const es = rect && rect.width > 0 ? rect.width / sourceWidth : 1;
				const dx = (e.clientX - d.startClientX) / es;
				const dy = (e.clientY - d.startClientY) / es;
				setCrop(clampWithRatio(sc.x + dx, sc.y + dy, sc.width, sc.height, lockedRatio));
				return;
			}

			// ── Resize ──
			const cursor = toSource(e.clientX, e.clientY);
			const edgeX = cursor.x - d.offsetX;
			const edgeY = cursor.y - d.offsetY;

			const h = d.handle;
			const hasH = h.includes('e') || h.includes('w');
			const hasV = h.includes('s') || h.includes('n');

			// Raw signed distance from anchor to cursor-edge
			const rawW = hasH ? edgeX - d.anchorX : sc.width;
			const rawH = hasV ? edgeY - d.anchorY : sc.height;

			// Unsigned desired size
			let nw = Math.abs(rawW);
			let nh = Math.abs(rawH);

			// ── Ratio lock: one dimension always derives from the other ──
			if (lockedRatio) {
				if (hasH && hasV) {
					// Corner: the dominant axis (whichever cursor moved more relative to ratio) drives
					if (nw / lockedRatio >= nh) {
						nh = nw / lockedRatio;
					} else {
						nw = nh * lockedRatio;
					}
				} else if (hasH) {
					// E/W edge: width drives
					nh = nw / lockedRatio;
				} else {
					// N/S edge: height drives
					nw = nh * lockedRatio;
				}
			}

			// ── Position from anchor ──
			let nx: number;
			let ny: number;

			if (hasH) {
				nx = rawW >= 0 ? d.anchorX : d.anchorX - nw;
			} else if (lockedRatio) {
				// N/S edge with lock: center horizontally around crop center
				nx = sc.x + sc.width / 2 - nw / 2;
			} else {
				nx = sc.x;
			}

			if (hasV) {
				ny = rawH >= 0 ? d.anchorY : d.anchorY - nh;
			} else if (lockedRatio) {
				// E/W edge with lock: center vertically around crop center
				ny = sc.y + sc.height / 2 - nh / 2;
			} else {
				ny = sc.y;
			}

			// ── Clamp with ratio preserved ──
			setCrop(clampWithRatio(nx, ny, nw, nh, lockedRatio));
		},
		[sourceWidth, sourceHeight, lockedRatio, clampWithRatio, setCrop, toSource],
	);

	const handlePointerUp = useCallback(() => {
		dragRef.current = null;
		if (rootRef.current) {
			rootRef.current.style.cursor = '';
		}
	}, []);

	if (!crop) return null;

	return (
		<div
			ref={rootRef}
			className="absolute inset-0 z-10 pointer-events-auto"
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			style={{ touchAction: 'none' }}
		>
			<SelectionBox
				left={`${(crop.x / sourceWidth) * 100}%`}
				top={`${(crop.y / sourceHeight) * 100}%`}
				width={`${(crop.width / sourceWidth) * 100}%`}
				height={`${(crop.height / sourceHeight) * 100}%`}
				displayWidth={Math.round(crop.width)}
				displayHeight={Math.round(crop.height)}
				onHandlePointerDown={handlePointerDown}
			/>
		</div>
	);
});
