import { ChevronsLeftRight, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clampView, MIN_VIEW, type Range } from '@/document/timemap';
import { TimeRuler } from '@/editor/TimeRuler';
import { TrimHandle } from '@/editor/TrimHandle';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useBoxSize } from '@/ui/use-box-size';
import { frameAt, type OutputFrame, setTrim } from './document';
import type { GifEngine } from './engine';
import type { FrameSource } from './source';
import { useGifDoc, useGifEditor } from './store';

/** Height of the filmstrip, in CSS pixels. */
const STRIP_HEIGHT = 64;

/** The output time that shows a source time: the frame whose picture is closest. */
function outputTimeOf(frames: readonly OutputFrame[], source: number): number {
	let best: OutputFrame | null = null;
	for (const frame of frames) {
		if (!best || Math.abs(frame.source - source) < Math.abs(best.source - source)) best = frame;
	}
	return best?.start ?? 0;
}

/** Pictures of the whole source side by side, so a moment can be found by eye. */
function Filmstrip({ source, width, view }: { source: FrameSource; width: number; view: Range }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(STRIP_HEIGHT * ratio);
		const thumbWidth = (source.width / source.height) * canvas.height;
		const count = Math.ceil(canvas.width / thumbWidth);
		let active = true;
		void (async () => {
			for (let i = 0; i < count; i++) {
				const time = view.start + ((i + 0.5) * thumbWidth * (view.end - view.start)) / canvas.width;
				// Thumbnails are read one by one, left to right.
				// oxlint-disable-next-line no-await-in-loop
				const picture = await source.fetch(Math.min(time, source.duration - 1e-3));
				if (!active) return;
				// A picture freed while switching files has no size left: it is skipped.
				if (picture && !(picture instanceof ImageBitmap && picture.width === 0)) {
					context.drawImage(picture, i * thumbWidth, 0, thumbWidth, canvas.height);
				}
			}
		})().catch(() => undefined);
		return () => {
			active = false;
		};
	}, [source, width, view.start, view.end]);
	return <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />;
}

/**
 * Timeline of the GIF editor: the whole source as a filmstrip, the kept part between two handles,
 * and a playhead following the frame on screen.
 */
export function GifTimeline({ engine }: { engine: GifEngine }) {
	const doc = useGifDoc();
	const playing = useGifEditor((state) => state.playing);
	const playhead = useGifEditor((state) => state.playhead);
	const preview = useGifEditor((state) => state.preview);
	const settle = useGifEditor((state) => state.settle);
	const stripRef = useRef<HTMLDivElement>(null);
	const { width } = useBoxSize(stripRef);
	const { source, frames } = engine;
	const [zoom, setZoom] = useState<Range | null>(null);
	const view = clampView(zoom ?? { start: 0, end: doc.duration }, doc.duration);
	const span = view.end - view.start;
	const shown = frameAt(frames, playhead);
	const percent = (time: number) => `${((time - view.start) / span) * 100}%`;
	const length = (time: number) => `${(time / span) * 100}%`;
	const seekSource = (time: number) => {
		engine.seek(outputTimeOf(frames, time));
	};
	const zoomBy = (factor: number, anchor = shown?.source ?? view.start + span / 2) => {
		setZoom(
			clampView(
				{ start: anchor - (anchor - view.start) * factor, end: anchor + (view.end - anchor) * factor },
				doc.duration,
			),
		);
	};

	// Ctrl or ⌘ + wheel zooms around the pointer; the wheel alone scrolls a zoomed strip.
	useEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;
		const onWheel = (event: WheelEvent) => {
			const rect = strip.getBoundingClientRect();
			const at = view.start + ((event.clientX - rect.left) / rect.width) * span;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				zoomBy(Math.exp(event.deltaY * 0.0025), at);
				return;
			}
			if (span >= doc.duration) return;
			const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
			if (delta === 0) return;
			event.preventDefault();
			const shift = (delta / rect.width) * span;
			setZoom(clampView({ start: view.start + shift, end: view.end + shift }, doc.duration));
		};
		strip.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			strip.removeEventListener('wheel', onWheel);
		};
	});

	return (
		<section aria-label={m.timeline()} className="border-line grid gap-2 border-t px-4 pt-2.5 pb-3">
			<div className="flex items-center gap-3">
				<button
					type="button"
					aria-label={playing ? m.pause() : m.play()}
					title={playing ? m.pause() : m.play()}
					disabled={!source}
					onClick={engine.togglePlay}
					className="bg-ed text-ed-ink grid size-9 flex-none place-items-center rounded-full transition-[filter] enabled:hover:brightness-[1.07] disabled:opacity-45"
				>
					{playing ? (
						<Pause size={16} fill="currentColor" strokeWidth={0} />
					) : (
						<Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
					)}
				</button>
				<span className="tabular font-mono text-[15px] font-medium" aria-label={m.playhead()}>
					{formatPreciseTime(playhead)}
				</span>
				<span className="text-ui text-muted tabular font-mono">/ {formatPreciseTime(engine.length)}</span>
				<div className="ml-auto flex gap-0.5">
					<IconButton
						label={m.zoom_out()}
						disabled={span >= doc.duration}
						onClick={() => {
							zoomBy(2);
						}}
					>
						<ZoomOut size={17} />
					</IconButton>
					<IconButton
						label={m.zoom_in()}
						disabled={span <= MIN_VIEW}
						onClick={() => {
							zoomBy(0.5);
						}}
					>
						<ZoomIn size={17} />
					</IconButton>
					<IconButton
						label={m.zoom_fit()}
						disabled={span >= doc.duration}
						onClick={() => {
							setZoom(null);
						}}
					>
						<ChevronsLeftRight size={17} />
					</IconButton>
				</div>
			</div>
			<div className="grid gap-1">
				<TimeRuler view={view} onSeek={seekSource} />
				<div
					ref={stripRef}
					role="group"
					aria-label={m.filmstrip()}
					className="bg-surface-2 relative cursor-pointer touch-none overflow-visible rounded-xs select-none"
					style={{ height: STRIP_HEIGHT }}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						const rect = event.currentTarget.getBoundingClientRect();
						seekSource(view.start + ((event.clientX - rect.left) / rect.width) * span);
					}}
				>
					{/* Everything drawn to the timeline scale is clipped to the strip when zoomed in. */}
					<div className="absolute inset-0 overflow-hidden rounded-xs">
						{source && <Filmstrip source={source} width={width} view={view} />}
						{[
							{ start: 0, end: doc.trim.start },
							{ start: doc.trim.end, end: doc.duration },
						]
							.filter((range) => range.end > range.start)
							.map((range) => (
								<div
									key={range.start}
									className="bg-canvas/75 pointer-events-none absolute inset-y-0"
									style={{ left: percent(range.start), width: length(range.end - range.start) }}
								/>
							))}
						<div
							className="shadow-[inset_0_0_0_2px_var(--ed)] pointer-events-none absolute inset-y-0 rounded-xs"
							style={{ left: percent(doc.trim.start), width: length(doc.trim.end - doc.trim.start) }}
						/>
					</div>
					{(['start', 'end'] as const).map((side) => (
						<TrimHandle
							key={side}
							label={side === 'start' ? m.trim_handle_start() : m.trim_handle_end()}
							time={doc.trim[side]}
							duration={doc.duration}
							view={view}
							onMove={(time) => {
								preview((current) => setTrim(current, { ...current.trim, [side]: time }));
							}}
							onEnd={settle}
						/>
					))}
					{shown && shown.source >= view.start && shown.source <= view.end && (
						<div
							className="bg-ink pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2"
							style={{ left: percent(shown.source) }}
							aria-hidden="true"
						/>
					)}
				</div>
			</div>
		</section>
	);
}
