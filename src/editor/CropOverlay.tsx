import type { PointerEvent as ReactPointerEvent } from 'react';
import { dragCrop, type Handle } from '@/editors/image/crop';
import type { Rect, Size } from '@/editors/image/document';

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

interface CropOverlayProps {
	crop: Rect;
	/** Screen pixels per picture pixel. */
	scale: number;
	bounds: Size;
	/** Width over height to keep, or null for a free crop. */
	ratio: number | null;
	/** Called while dragging, with the new crop. */
	onChange: (crop: Rect) => void;
	/** Called once the drag ends: the whole drag is one undo step. */
	onEnd: () => void;
}

/**
 * Crop frame drawn over the whole picture, in screen pixels: drag inside to move it, drag a
 * handle to resize it. Shared by every editor that crops.
 */
export function CropOverlay({ crop, scale, bounds, ratio, onChange, onEnd }: CropOverlayProps) {
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
			onChange(next);
		};
		const end = () => {
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', end);
			target.removeEventListener('pointercancel', end);
			onEnd();
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
