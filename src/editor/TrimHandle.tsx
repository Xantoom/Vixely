import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Range } from '@/document/timemap';
import { formatPreciseTime } from '@/lib/format';

/** Arrow keys move a handle by this much; with Shift, ten times more. */
const STEP = 0.1;

interface TrimHandleProps {
	label: string;
	/** Where the handle stands, in source seconds. */
	time: number;
	duration: number;
	/** Visible part of the timeline, in source seconds. */
	view: Range;
	/** Called while dragging or pressing arrows, with the wanted time. */
	onMove: (time: number) => void;
	/** Called when the gesture ends: it becomes one undo step. */
	onEnd: () => void;
}

/**
 * Handle at one end of the kept part of a timeline. Dragged, or moved with the arrow keys. It
 * sits in a positioned track whose width spans `view`.
 */
export function TrimHandle({ label, time, duration, view, onMove, onEnd }: TrimHandleProps) {
	const span = view.end - view.start;
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
		const track = event.currentTarget.parentElement;
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width;
		onMove(Math.min(duration, Math.max(0, view.start + x * span)));
	};
	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		event.stopPropagation();
		const step = event.shiftKey ? STEP * 10 : STEP;
		onMove(time + (event.key === 'ArrowLeft' ? -step : step));
	};
	if (time < view.start || time > view.end) return null;
	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={time}
			aria-valuetext={formatPreciseTime(time)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onEnd}
			onPointerCancel={onEnd}
			onKeyDown={onKeyDown}
			onKeyUp={onEnd}
			onBlur={onEnd}
			className="group absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
			style={{ left: `${((time - view.start) / span) * 100}%` }}
		>
			<span className="bg-ed absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full" />
			<span className="bg-ed absolute top-1/2 left-1/2 h-7 w-2.5 -translate-1/2 rounded-full shadow-[0_0_0_2px_var(--bg)] transition-transform group-hover:scale-110 group-focus-visible:scale-110" />
		</div>
	);
}
