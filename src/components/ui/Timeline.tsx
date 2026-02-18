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
	onScrubStart?: () => void;
	onScrubEnd?: () => void;
}

function formatTimecode(seconds: number): string {
	if (!Number.isFinite(seconds)) return '00:00.00';
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
	onScrubStart,
	onScrubEnd,
}: TimelineProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const rangeDragOffsetRef = useRef(0);
	const rangeDurationRef = useRef(0);
	const movedDuringDragRef = useRef(false);
	const [dragging, setDragging] = useState<DragTarget>(null);

	const toFraction = (val: number) => {
		if (!Number.isFinite(duration) || duration <= 0) return 0;
		if (!Number.isFinite(val)) return 0;
		return Math.max(0, Math.min(1, val / duration));
	};
	const fromClientX = useCallback(
		(clientX: number): number => {
			const track = trackRef.current;
			if (!track || !Number.isFinite(duration) || duration <= 0) return 0;
			const rect = track.getBoundingClientRect();
			if (!Number.isFinite(rect.width) || rect.width <= 0) return 0;
			const raw = (clientX - rect.left) / rect.width;
			if (!Number.isFinite(raw)) return 0;
			const fraction = Math.max(0, Math.min(1, raw));
			return fraction * duration;
		},
		[duration],
	);

	const handlePointerDown = useCallback(
		(target: DragTarget) => (e: PointerEvent) => {
			e.preventDefault();
			if (dragging == null) onScrubStart?.();
			movedDuringDragRef.current = false;
			e.currentTarget.setPointerCapture(e.pointerId);
			if (target === 'range') {
				const val = fromClientX(e.clientX);
				rangeDragOffsetRef.current = val - trimStart;
				rangeDurationRef.current = Math.max(0, trimEnd - trimStart);
			}
			setDragging(target);
		},
		[dragging, fromClientX, onScrubStart, trimStart, trimEnd],
	);

	const handlePointerMove = useCallback(
		(e: PointerEvent) => {
			if (!dragging) return;
			movedDuringDragRef.current = true;
			const val = fromClientX(e.clientX);
			if (!Number.isFinite(val)) return;
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
		onScrubEnd?.();
	}, [onScrubEnd]);

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
	const trimEndRightPct = `${100 - toFraction(trimEnd) * 100}%`;

	return (
		<div className={`select-none ${className}`}>
			<div className="rounded-2xl border border-border/70 bg-surface-raised/40 px-2.5 py-2.5 sm:px-3.5 sm:py-3">
				<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[12px] text-text-tertiary sm:text-[13px]">
					<div className="flex min-w-0 items-center gap-2">
						<span className="inline-flex rounded-md border border-border/70 bg-bg/50 px-2 py-0.5 font-mono tabular-nums text-text-secondary">
							{formatTimecode(trimStart)}
						</span>
						<div className="min-w-0">{headerStart}</div>
					</div>

					<div className="flex items-center justify-center gap-1.5">
						{centerStart}
						<span className="inline-flex rounded-md border border-accent/35 bg-accent/10 px-2 py-0.5 font-mono tabular-nums text-text">
							{formatTimecode(currentTime)}
						</span>
						{centerEnd}
					</div>

					<div className="flex min-w-0 items-center justify-end gap-2">
						<div className="min-w-0">{headerEnd}</div>
						<span className="inline-flex rounded-md border border-border/70 bg-bg/50 px-2 py-0.5 font-mono tabular-nums text-text-secondary">
							{formatTimecode(trimEnd)}
						</span>
					</div>
				</div>

				<div
					ref={trackRef}
					className="relative mt-3 h-14 overflow-hidden rounded-xl border border-border/70 bg-bg/55 cursor-pointer touch-none"
					onClick={handleTrackClick}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
				>
					<div className="absolute inset-0 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_24px,rgba(255,255,255,0.06)_25px)] pointer-events-none" />

					<div
						className="absolute inset-y-0 left-0 bg-bg/65 pointer-events-none"
						style={{ width: startPct }}
					/>
					<div
						className="absolute inset-y-0 right-0 bg-bg/65 pointer-events-none"
						style={{ width: trimEndRightPct }}
					/>

					<div
						className={`absolute top-1 bottom-1 z-10 rounded-lg border border-accent/40 transition-colors ${
							dragging === 'range' ? 'bg-accent/25 cursor-grabbing' : 'bg-accent/10 cursor-grab'
						}`}
						style={{ left: startPct, right: trimEndRightPct }}
						onPointerDown={handlePointerDown('range')}
					/>

					<div
						className={`absolute top-1/2 z-20 h-8 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 transition-colors ${
							dragging === 'start' ? 'bg-accent' : 'bg-accent/80 hover:bg-accent'
						} cursor-ew-resize`}
						style={{ left: startPct }}
						onPointerDown={handlePointerDown('start')}
					>
						<div className="absolute -top-3 -bottom-3 -left-3 -right-3" />
					</div>

					<div
						className={`absolute top-1/2 z-20 h-8 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 transition-colors ${
							dragging === 'end' ? 'bg-accent' : 'bg-accent/80 hover:bg-accent'
						} cursor-ew-resize`}
						style={{ left: endPct }}
						onPointerDown={handlePointerDown('end')}
					>
						<div className="absolute -top-3 -bottom-3 -left-3 -right-3" />
					</div>

					<div
						className={`absolute inset-y-1 z-30 w-[2px] -translate-x-1/2 cursor-ew-resize ${
							dragging === 'playhead' ? 'bg-white' : 'bg-white/85'
						}`}
						style={{ left: playheadPct }}
						onPointerDown={handlePointerDown('playhead')}
					>
						<div className="absolute -top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-black/20 bg-white shadow-sm" />
						<div className="absolute -top-3 -bottom-3 -left-3 -right-3" />
					</div>
				</div>

				<div className="mt-2.5 grid grid-cols-1 items-center gap-1 text-[12px] text-text-tertiary sm:grid-cols-3 sm:text-[13px]">
					<span className="font-mono tabular-nums">Selection: {formatTimecode(clipDuration)}</span>
					<span className="text-left sm:text-center">
						Trim {formatTimecode(trimStart)} → {formatTimecode(trimEnd)}
					</span>
					<span className="font-mono tabular-nums sm:text-right">Total: {formatTimecode(duration)}</span>
				</div>
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
