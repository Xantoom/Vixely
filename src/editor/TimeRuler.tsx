import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import type { Range } from '@/document/timemap';
import { formatClock } from '@/lib/format';
import { useBoxSize } from '@/ui/use-box-size';

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
/** Room each label needs, in CSS pixels. */
const LABEL_SPACING = 76;

/** The smallest round step that leaves room for every label. */
export function rulerStep(span: number, width: number): number {
	return STEPS.find((step) => (step / span) * width >= LABEL_SPACING) ?? 7200;
}

/** `1:04` on whole-second steps, `1:04.5` below. */
function label(time: number, step: number): string {
	if (step >= 1) return formatClock(time);
	const tenths = Math.round(time * 10);
	return `${formatClock(Math.floor(tenths / 10))}.${tenths % 10}`;
}

/**
 * Time ruler of a timeline, for the visible part of the source. Pressing on it moves the playhead
 * there, and dragging scrubs.
 */
export function TimeRuler({ view, onSeek }: { view: Range; onSeek?: (time: number) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const { width } = useBoxSize(ref);
	const span = view.end - view.start;
	const step = width > 0 && span > 0 ? rulerStep(span, width) : 0;
	const ticks: number[] = [];
	if (step > 0) {
		// Counted in steps rather than added up, so 0.1 steps don't drift to 0.30000000000000004.
		for (let i = Math.ceil(view.start / step); i * step < view.end; i++) ticks.push(i * step);
	}

	const seekAt = (event: ReactPointerEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		onSeek?.(view.start + x * span);
	};

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className={`text-caption text-muted relative h-[18px] overflow-hidden font-mono select-none ${onSeek ? 'cursor-pointer' : ''}`}
			onPointerDown={(event) => {
				if (!onSeek || event.button !== 0) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				seekAt(event);
			}}
			onPointerMove={(event) => {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event);
			}}
		>
			{ticks.map((t) => (
				<span
					key={t}
					className="border-line-2 absolute top-0 h-full border-l pl-1 leading-none"
					style={{ left: `${((t - view.start) / span) * 100}%` }}
				>
					{label(t, step)}
				</span>
			))}
		</div>
	);
}
