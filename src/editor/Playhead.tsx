import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import type { Range } from '@/document/timemap';
import { timeAt } from './timeline-view';

/**
 * Where playback is on a timeline: a line topped with a diamond, in a positioned track whose width
 * spans `view`. It can be taken and dragged to scrub, from where it was grabbed so it doesn't jump
 * under the pointer; pressing it never starts what pressing the track does, such as a selection.
 */
export function Playhead({
	time,
	view,
	duration,
	onSeek,
	className = 'inset-y-0',
}: {
	time: number;
	view: Range;
	duration: number;
	onSeek: (time: number) => void;
	/** How far up and down the line reaches. */
	className?: string;
}) {
	// Pointer to line, in pixels, at the press.
	const offset = useRef(0);
	if (time < view.start || time > view.end) return null;

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const rect = event.currentTarget.getBoundingClientRect();
		offset.current = event.clientX - (rect.left + rect.width / 2);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const track = event.currentTarget.parentElement;
		if (!track || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
		onSeek(timeAt(track, event.clientX - offset.current, view, duration));
	};

	return (
		<div
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			className={`absolute z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none ${className}`}
			style={{ left: `${((time - view.start) / (view.end - view.start)) * 100}%` }}
			aria-hidden="true"
		>
			<span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[var(--ed)]" />
			<span className="absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-[var(--ed)]" />
		</div>
	);
}
