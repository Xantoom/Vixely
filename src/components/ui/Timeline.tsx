import { useRef, useCallback, useState, type PointerEvent } from 'react';

interface TimelineProps {
	duration: number;
	trimStart: number;
	trimEnd: number;
	currentTime: number;
	onTrimStartChange: (v: number) => void;
	onTrimEndChange: (v: number) => void;
	onSeek: (v: number) => void;
	className?: string;
}

function formatTimecode(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 100);
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

type DragTarget = 'start' | 'end' | 'playhead' | null;

export function Timeline({
	duration,
	trimStart,
	trimEnd,
	currentTime,
	onTrimStartChange,
	onTrimEndChange,
	onSeek,
	className = '',
}: TimelineProps) {
	const trackRef = useRef<HTMLDivElement>(null);
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
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setDragging(target);
		},
		[],
	);

	const handlePointerMove = useCallback(
		(e: PointerEvent) => {
			if (!dragging) return;
			const val = fromClientX(e.clientX);
			if (dragging === 'start') {
				onTrimStartChange(Math.min(val, trimEnd - 0.1));
			} else if (dragging === 'end') {
				onTrimEndChange(Math.max(val, trimStart + 0.1));
			} else if (dragging === 'playhead') {
				onSeek(Math.max(trimStart, Math.min(trimEnd, val)));
			}
		},
		[dragging, fromClientX, trimStart, trimEnd, onTrimStartChange, onTrimEndChange, onSeek],
	);

	const handlePointerUp = useCallback(() => {
		setDragging(null);
	}, []);

	// Click on the track to seek
	const handleTrackClick = useCallback(
		(e: React.MouseEvent) => {
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

	return (
		<div className={`flex flex-col gap-2 select-none ${className}`}>
			{/* Timecodes */}
			<div className="flex items-center justify-between text-[13px] font-mono text-text-tertiary tabular-nums">
				<span>{formatTimecode(trimStart)}</span>
				<span className="text-text-secondary font-semibold">{formatTimecode(currentTime)}</span>
				<span>{formatTimecode(trimEnd)}</span>
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
					className="absolute inset-y-0 border-y-2 border-accent/40 pointer-events-none"
					style={{ left: startPct, right: `${100 - toFraction(trimEnd) * 100}%` }}
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
			<div className="flex items-center justify-between text-[12px] text-text-tertiary">
				<span>Selection: {formatTimecode(clipDuration)}</span>
				<span>Total: {formatTimecode(duration)}</span>
			</div>
		</div>
	);
}

export { formatTimecode };
