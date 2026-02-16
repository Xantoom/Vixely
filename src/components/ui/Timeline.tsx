import { useRef, useCallback, useState, type PointerEvent, type ReactNode } from 'react';

interface TimelineProps {
	duration: number;
	trimStart: number;
	trimEnd: number;
	currentTime: number;
	minGap?: number;
	onTrimStartChange: (v: number) => void;
	onTrimEndChange: (v: number) => void;
	onSeek: (v: number) => void;
	className?: string;
	headerStart?: ReactNode;
	headerEnd?: ReactNode;
	centerStart?: ReactNode;
	centerEnd?: ReactNode;
}

function formatTimecode(seconds: number): string {
	const totalCentiseconds = Math.max(0, Math.floor(seconds * 100));
	const h = Math.floor(totalCentiseconds / 360000);
	const m = Math.floor((totalCentiseconds % 360000) / 6000);
	const s = Math.floor((totalCentiseconds % 6000) / 100);
	const cs = totalCentiseconds % 100;
	if (h > 0) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

type DragTarget = 'start' | 'end' | 'playhead' | 'range' | null;

export function Timeline({
	duration,
	trimStart,
	trimEnd,
	currentTime,
	minGap = 0.1,
	onTrimStartChange,
	onTrimEndChange,
	onSeek,
	className = '',
	headerStart,
	headerEnd,
	centerStart,
	centerEnd,
}: TimelineProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const rangeDragOffsetRef = useRef(0);
	const rangeDurationRef = useRef(0);
	const movedDuringDragRef = useRef(false);
	const [dragging, setDragging] = useState<DragTarget>(null);

	const toFraction = (val: number) => (duration > 0 ? val / duration : 0);
	const fromClientX = useCallback(
		(clientX: number): number => {
			const track = trackRef.current;
			if (!track || duration <= 0) return 0;
			const rect = track.getBoundingClientRect();
			const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return fraction * duration;
		},
		[duration],
	);

	const handlePointerDown = useCallback(
		(target: DragTarget) => (e: PointerEvent) => {
			e.preventDefault();
			movedDuringDragRef.current = false;
			e.currentTarget.setPointerCapture(e.pointerId);
			if (target === 'range') {
				const val = fromClientX(e.clientX);
				rangeDragOffsetRef.current = val - trimStart;
				rangeDurationRef.current = Math.max(0, trimEnd - trimStart);
			}
			setDragging(target);
		},
		[fromClientX, trimStart, trimEnd],
	);

	const handlePointerMove = useCallback(
		(e: PointerEvent) => {
			if (!dragging) return;
			movedDuringDragRef.current = true;
			const val = fromClientX(e.clientX);
			if (dragging === 'start') {
				onTrimStartChange(Math.min(val, trimEnd - minGap));
			} else if (dragging === 'end') {
				onTrimEndChange(Math.max(val, trimStart + minGap));
			} else if (dragging === 'playhead') {
				onSeek(Math.max(trimStart, Math.min(trimEnd, val)));
			} else if (dragging === 'range') {
				const rangeDuration = Math.max(0, rangeDurationRef.current);
				const unclampedStart = val - rangeDragOffsetRef.current;
				const nextStart = Math.min(Math.max(unclampedStart, 0), Math.max(0, duration - rangeDuration));
				const nextEnd = nextStart + rangeDuration;
				onTrimStartChange(nextStart);
				onTrimEndChange(nextEnd);
				if (currentTime < nextStart || currentTime > nextEnd) {
					onSeek(Math.max(nextStart, Math.min(nextEnd, currentTime)));
				}
			}
		},
		[
			currentTime,
			dragging,
			duration,
			fromClientX,
			trimStart,
			trimEnd,
			minGap,
			onTrimStartChange,
			onTrimEndChange,
			onSeek,
		],
	);

	const handlePointerUp = useCallback(() => {
		setDragging(null);
	}, []);

	// Click on the track to seek
	const handleTrackClick = useCallback(
		(e: React.MouseEvent) => {
			if (movedDuringDragRef.current) {
				movedDuringDragRef.current = false;
				return;
			}
			if (dragging) return;
			const val = fromClientX(e.clientX);
			onSeek(Math.max(trimStart, Math.min(trimEnd, val)));
		},
		[fromClientX, dragging, trimStart, trimEnd, onSeek],
	);

	const startPct = `${toFraction(trimStart) * 100}%`;
	const endPct = `${toFraction(trimEnd) * 100}%`;
	const playheadPct = `${toFraction(currentTime) * 100}%`;
	const clipDuration = trimEnd - trimStart;
	const hasHeaderSlots = Boolean(headerStart || headerEnd || centerStart || centerEnd);

	return (
		<div className={`flex flex-col gap-2 select-none ${className}`}>
			{/* Timecodes */}
			<div className="flex items-center justify-between gap-2 text-[13px] font-mono text-text-tertiary tabular-nums">
				<div className="flex min-w-0 items-center gap-2">
					<span className={hasHeaderSlots ? 'hidden sm:inline' : ''}>{formatTimecode(trimStart)}</span>
					{headerStart}
				</div>
				<div className="flex items-center gap-1">
					{centerStart}
					<span className="text-text-secondary font-semibold">{formatTimecode(currentTime)}</span>
					{centerEnd}
				</div>
				<div className="flex min-w-0 items-center justify-end gap-2">
					{headerEnd}
					<span className={hasHeaderSlots ? 'hidden sm:inline' : ''}>{formatTimecode(trimEnd)}</span>
				</div>
			</div>

			{/* Track */}
			<div
				ref={trackRef}
				className="relative h-12 rounded-lg bg-surface-raised cursor-pointer touch-none"
				onClick={handleTrackClick}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				{/* Dimmed regions outside trim */}
				<div
					className="absolute inset-y-0 left-0 bg-bg/60 rounded-l-lg pointer-events-none"
					style={{ width: startPct }}
				/>
				<div
					className="absolute inset-y-0 right-0 bg-bg/60 rounded-r-lg pointer-events-none"
					style={{ width: `${100 - toFraction(trimEnd) * 100}%` }}
				/>

				{/* Selected region */}
				<div
					className={`absolute inset-y-0 border-y-2 border-accent/40 z-10 transition-colors ${
						dragging === 'range' ? 'bg-accent/20 cursor-grabbing' : 'bg-accent/10 cursor-grab'
					}`}
					style={{ left: startPct, right: `${100 - toFraction(trimEnd) * 100}%` }}
					onPointerDown={handlePointerDown('range')}
				/>

				{/* Start handle */}
				<div
					className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full cursor-ew-resize z-20 transition-colors ${
						dragging === 'start' ? 'bg-accent' : 'bg-accent/70 hover:bg-accent'
					}`}
					style={{ left: startPct }}
					onPointerDown={handlePointerDown('start')}
				>
					<div className="absolute -top-1 -bottom-1 -left-3 -right-3" />
				</div>

				{/* End handle */}
				<div
					className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full cursor-ew-resize z-20 transition-colors ${
						dragging === 'end' ? 'bg-accent' : 'bg-accent/70 hover:bg-accent'
					}`}
					style={{ left: endPct }}
					onPointerDown={handlePointerDown('end')}
				>
					<div className="absolute -top-1 -bottom-1 -left-3 -right-3" />
				</div>

				{/* Playhead */}
				<div
					className={`absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-30 cursor-ew-resize ${
						dragging === 'playhead' ? 'bg-white' : 'bg-white/80'
					}`}
					style={{ left: playheadPct }}
					onPointerDown={handlePointerDown('playhead')}
				>
					<div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-sm bg-white rotate-45" />
					<div className="absolute -top-1 -bottom-1 -left-3 -right-3" />
				</div>
			</div>

			{/* Duration info */}
			<div className="flex items-center justify-between text-[13px] text-text-tertiary">
				<span>Selection: {formatTimecode(clipDuration)}</span>
				<span>Total: {formatTimecode(duration)}</span>
			</div>
		</div>
	);
}

function formatCompactTime(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
	if (m > 0) return `${m}m${String(s).padStart(2, '0')}`;
	return `${s}s`;
}

function formatPlayerTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export { formatTimecode, formatCompactTime, formatPlayerTime };
