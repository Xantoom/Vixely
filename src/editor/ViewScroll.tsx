import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import type { Range } from '@/document/timemap';
import { m } from '@/paraglide/messages.js';

/** Thin bar under a zoomed timeline: shows and moves the visible part. */
export function ViewScroll({
	view,
	duration,
	onView,
	controls,
}: {
	view: Range;
	duration: number;
	onView: (view: Range) => void;
	/** Id of the timeline it scrolls. */
	controls: string;
}) {
	const grab = useRef<{ x: number; start: number } | null>(null);
	const span = view.end - view.start;
	// The row is always there, so zooming never changes the height of the timeline.
	if (span >= duration) return <div className="h-3" aria-hidden="true" />;

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const track = event.currentTarget;
		track.setPointerCapture(event.pointerId);
		const rect = track.getBoundingClientRect();
		const time = ((event.clientX - rect.left) / rect.width) * duration;
		// Pressing outside the thumb centres the view there first.
		const start = time < view.start || time > view.end ? time - span / 2 : view.start;
		onView({ start, end: start + span });
		grab.current = { x: event.clientX, start };
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = grab.current;
		if (!current) return;
		const shift = ((event.clientX - current.x) / event.currentTarget.clientWidth) * duration;
		onView({ start: current.start + shift, end: current.start + shift + span });
	};

	return (
		<div
			role="scrollbar"
			aria-label={m.timeline_scroll()}
			aria-orientation="horizontal"
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(view.start)}
			aria-controls={controls}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={() => {
				grab.current = null;
			}}
			className="group relative h-3 cursor-grab touch-none active:cursor-grabbing"
		>
			<div className="ease-out-soft absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-(--track-base) opacity-60 transition-[height] duration-150 group-hover:h-1.5" />
			<div
				className="ease-out-soft absolute top-1/2 h-1.5 min-w-6 -translate-y-1/2 rounded-full bg-(--scroll-thumb-hover) transition-[height,background-color] duration-150 group-hover:h-2.5 group-active:bg-(--ed)"
				style={{ left: `${(view.start / duration) * 100}%`, width: `${(span / duration) * 100}%` }}
			/>
		</div>
	);
}
