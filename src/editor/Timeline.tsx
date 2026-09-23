import { useEffect, useRef } from 'react';
import { formatClock, formatTimecode } from '@/lib/format';
import type { MediaInfo } from '@/media/probe';
import { m } from '@/paraglide/messages.js';

/** Picks a ruler step that gives between 5 and 10 labels. */
function rulerStep(duration: number): number {
	const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
	return steps.find((step) => duration / step <= 10) ?? 3600;
}

function Ruler({ duration }: { duration: number }) {
	const step = rulerStep(duration);
	const ticks: number[] = [];
	for (let t = 0; t < duration - step * 0.4; t += step) ticks.push(t);
	return (
		<div className="text-caption text-muted relative h-[18px] font-mono" aria-hidden="true">
			{ticks.map((t) => (
				<span key={t} className="absolute top-0" style={{ left: `${(t / duration) * 100}%` }}>
					{formatClock(t)}
				</span>
			))}
			<span className="absolute top-0 right-0">{formatClock(duration)}</span>
		</div>
	);
}

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

/**
 * Tracks are coloured by media type everywhere in the app: an audio track is always pink and
 * subtitles are always violet, whichever editor shows them.
 */
export function Timeline({ info, poster }: { info: MediaInfo | null; poster: ImageBitmap | null }) {
	const cues = info?.cues ?? null;
	const lastCue = cues?.at(-1)?.start ?? 0;
	const duration = info?.duration ?? (cues?.length ? lastCue + 4 : null);
	const fps = info?.video?.fps ?? 30;

	return (
		<section aria-label={m.timeline()} className="border-line grid gap-1.5 border-t px-4 pt-2.5 pb-4">
			<div className="text-ui flex items-baseline gap-2">
				<span className="text-muted">{m.info_duration()}</span>
				<span className="tabular font-mono text-[12.5px]">
					{duration === null ? '–' : formatTimecode(duration, fps)}
				</span>
			</div>

			{duration !== null && duration > 0 && (
				<div className="relative grid gap-1.5">
					<Ruler duration={duration} />
					{info?.video && (
						<div className="flex h-12 overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--video-1)_16%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--video-1)_35%,transparent)]">
							{poster && <ClipHead poster={poster} />}
						</div>
					)}
					{info?.audio && (
						<div className="relative h-9 overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--audio-1)_12%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--audio-1)_30%,transparent)]">
							<div className="bg-audio absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 opacity-60" />
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
					<div
						className="bg-ink pointer-events-none absolute top-3 -bottom-1 left-0 w-0.5"
						aria-hidden="true"
					/>
				</div>
			)}
		</section>
	);
}
