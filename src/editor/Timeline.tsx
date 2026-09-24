import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { formatPreciseTime, formatTimecode } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import type { MediaInfo } from '@/media/probe';
import { m } from '@/paraglide/messages.js';
import { usePlaybackPeaks, Waveform } from './PlaybackWaveform';
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
 * The file as tracks along time: the ruler, the picture, the sound (its waveform, for the audio
 * track heard) and the subtitle lines. Pressing anywhere moves playback there, dragging scrubs,
 * and the arrow keys step through it.
 *
 * Tracks are coloured by media type everywhere in the app: an audio track is always pink and
 * subtitles are always violet, whichever editor shows them.
 */
export function Timeline({ file, info, poster }: { file: File; info: MediaInfo | null; poster: ImageBitmap | null }) {
	const cues = info?.cues ?? null;
	const lastCue = cues?.at(-1)?.start ?? 0;
	const duration = info?.duration ?? (cues?.length ? lastCue + 4 : null);
	const fps = info?.video?.fps ?? 30;
	// Playback may still be opening the file, or be another file's.
	const live = usePlayback((state) => state.file === file && state.details !== null);
	const time = usePlayback((state) => state.time);
	const seek = usePlayback((state) => state.seek);
	const { peaks, version } = usePlaybackPeaks();

	const seekAt = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!duration) return;
		const rect = event.currentTarget.getBoundingClientRect();
		seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!duration) return;
		const step = event.shiftKey ? 1 / fps : KEY_STEP;
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
					role={live ? 'slider' : undefined}
					tabIndex={live ? 0 : undefined}
					aria-label={live ? m.playhead() : undefined}
					aria-valuemin={live ? 0 : undefined}
					aria-valuemax={live ? duration : undefined}
					aria-valuenow={live ? time : undefined}
					aria-valuetext={live ? formatPreciseTime(time) : undefined}
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
					{info?.audio && (
						<div className="relative h-9 overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--audio-1)_12%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--audio-1)_30%,transparent)]">
							{live && peaks ? (
								<Waveform peaks={peaks} version={version} view={{ start: 0, end: duration }} />
							) : (
								<div className="bg-audio absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 opacity-60" />
							)}
						</div>
					)}
					{cues && (
						<div className="relative h-5">
							{cues.map((cue) => (
								<span
									key={`${cue.start}-${cue.text}`}
									className="bg-subtitles absolute inset-y-0 w-1.5 rounded-[3px] opacity-90"
									style={{ left: `${(cue.start / duration) * 100}%` }}
								/>
							))}
						</div>
					)}
					{live && <Playhead duration={duration} />}
				</div>
			)}
		</section>
	);
}
