import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { formatPreciseTime, formatTimecode } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import type { MediaInfo } from '@/media/probe';
import { m } from '@/paraglide/messages.js';
import { TimeRuler } from './TimeRuler';

/** Head frame of a clip, drawn at the track height. Real per-second thumbnails come with playback. */
function ClipHead({ poster }: { poster: ImageBitmap }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.height = 96;
		canvas.width = Math.round((poster.width / poster.height) * 96);
		canvas.getContext('2d')?.drawImage(poster, 0, 0, canvas.width, canvas.height);
	}, [poster]);
	return <canvas ref={ref} className="h-full w-auto rounded-l-xs" />;
}

/** Where the file is: follows playback, moved on every frame without redrawing the lanes. */
function Playhead({ duration }: { duration: number }) {
	const time = usePlayback((state) => state.time);
	return (
		<div
			className="bg-ink pointer-events-none absolute top-0 -bottom-1 w-0.5 -translate-x-1/2"
			style={{ left: `${Math.min(1, Math.max(0, time / duration)) * 100}%` }}
			aria-hidden="true"
		/>
	);
}

/** Seconds moved by the arrow keys; with Shift, one frame. */
const KEY_STEP = 5;

/**
 * The file along time: the ruler and the picture. Pressing anywhere moves playback there,
 * dragging scrubs, and the arrow keys step through it.
 */
export function Timeline({ file, info, poster }: { file: File; info: MediaInfo | null; poster: ImageBitmap | null }) {
	const cues = info?.cues ?? null;
	const lastCue = cues?.at(-1)?.start ?? 0;
	const duration = info?.duration ?? (cues?.length ? lastCue + 4 : null);
	const fps = info?.video?.fps ?? 30;
	// Playback may still be opening the file, or be another file's.
	const live = usePlayback((state) => state.file === file && state.details !== null);
	const seek = usePlayback((state) => state.seek);
	const slider = useRef<HTMLDivElement>(null);

	// The slider's value follows playback on the element itself: drawing the whole timeline
	// again on every frame only for it would cost far more.
	useEffect(() => {
		const element = slider.current;
		if (!live || !element) return undefined;
		const show = (time: number) => {
			element.setAttribute('aria-valuenow', String(time));
			element.setAttribute('aria-valuetext', formatPreciseTime(time));
		};
		show(usePlayback.getState().time);
		const stop = usePlayback.subscribe((state, previous) => {
			if (state.time !== previous.time) show(state.time);
		});
		return () => {
			stop();
			element.removeAttribute('aria-valuenow');
			element.removeAttribute('aria-valuetext');
		};
	}, [live, duration]);

	const seekAt = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!duration) return;
		const rect = event.currentTarget.getBoundingClientRect();
		seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!duration) return;
		const step = event.shiftKey ? 1 / fps : KEY_STEP;
		const { time } = usePlayback.getState();
		const moves: Record<string, number> = {
			ArrowLeft: time - step,
			ArrowRight: time + step,
			Home: 0,
			End: duration,
		};
		const next = moves[event.key];
		if (next === undefined) return;
		event.preventDefault();
		seek(Math.min(duration, Math.max(0, next)));
	};

	return (
		<section aria-label={m.timeline()} className="border-line grid gap-1.5 border-t px-4 pt-2.5 pb-4">
			<div className="text-ui flex items-baseline gap-2">
				<span className="text-muted">{m.info_duration()}</span>
				<span className="tabular font-mono text-[12.5px]">
					{duration === null ? '–' : formatTimecode(duration, fps)}
				</span>
			</div>

			{duration !== null && duration > 0 && (
				<div
					ref={slider}
					role={live ? 'slider' : undefined}
					tabIndex={live ? 0 : undefined}
					aria-label={live ? m.playhead() : undefined}
					aria-valuemin={live ? 0 : undefined}
					aria-valuemax={live ? duration : undefined}
					onKeyDown={live ? onKeyDown : undefined}
					onPointerDown={(event) => {
						if (!live || event.button !== 0) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						seekAt(event);
					}}
					onPointerMove={(event) => {
						if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event);
					}}
					className={`relative grid touch-none gap-1.5 rounded-xs select-none ${live ? 'cursor-pointer' : ''}`}
				>
					<TimeRuler view={{ start: 0, end: duration }} />
					{info?.video && (
						<div className="flex h-12 overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--video-1)_16%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--video-1)_35%,transparent)]">
							{poster && <ClipHead poster={poster} />}
						</div>
					)}
					{live && <Playhead duration={duration} />}
				</div>
			)}
		</section>
	);
}
