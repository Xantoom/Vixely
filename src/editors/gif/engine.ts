import { useEffect, useMemo, useState } from 'react';
import type { OpenedFile } from '@/media/session';
import { createGifDoc, FRAME_RATES, type OutputFrame, outputFrames, outputLength } from './document';
import { type FrameSource, openAnimation, openVideo } from './source';
import { useGifDoc, useGifEditor } from './store';

/** Width a GIF made from a video starts at: wider ones weigh too much for most uses. */
const VIDEO_WIDTH = 480;
/** Frame rate a GIF made from a video starts at: gifski's own default, smooth and light. */
const VIDEO_FPS = 20;

export interface GifEngine {
	source: FrameSource | null;
	/** Frames decoded so far while an animation opens, null once it is ready. */
	reading: number | null;
	failed: boolean;
	/** The frames of the output, as played and exported. */
	frames: OutputFrame[];
	length: number;
	togglePlay: () => void;
	/** Moves the playhead, in output seconds. */
	seek: (time: number) => void;
}

/** The fastest standard rate at or under both the target and the source's own rate. */
function startRate(sourceFps: number | null): number {
	const ceiling = Math.min(VIDEO_FPS, sourceFps ?? VIDEO_FPS);
	return FRAME_RATES.toReversed().find((rate) => rate <= ceiling + 0.01) ?? FRAME_RATES[0] ?? 10;
}

/**
 * Opens the pictures of a file, a GIF or a video, and plays the output. Animations keep their own
 * frames and size by default; a video starts at 20 fps and 480 px wide, what most GIFs need.
 */
export function useGifEngine(opened: OpenedFile | null, batchKey: object | null): GifEngine {
	const doc = useGifDoc();
	const load = useGifEditor((state) => state.load);
	const retarget = useGifEditor((state) => state.retarget);
	const setPlayhead = useGifEditor((state) => state.setPlayhead);
	const setPlaying = useGifEditor((state) => state.setPlaying);
	const playing = useGifEditor((state) => state.playing);
	const [source, setSource] = useState<FrameSource | null>(null);
	const [reading, setReading] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const file = opened?.file ?? null;
	const isVideo = Boolean(opened?.info?.video);
	const format = opened?.format ?? '';
	const videoFps = opened?.info?.video?.fps ?? null;

	useEffect(() => {
		if (!file) return;
		const controller = new AbortController();
		let opening: FrameSource | null = null;
		setFailed(false);
		setReading(0);
		const ready = (next: FrameSource) => {
			opening = next;
			if (controller.signal.aborted) {
				next.dispose();
				return;
			}
			const fps = next.timing ? null : startRate(next.fps);
			const width = next.timing ? null : Math.min(next.width, VIDEO_WIDTH);
			const doc = createGifDoc(next.duration, fps);
			// A batch keeps its export settings from file to file; a single file starts afresh.
			if (batchKey && useGifEditor.getState().owner === batchKey) retarget(doc);
			else load(batchKey ?? file, doc, width, !batchKey && !isVideo && format === 'gif');
			setSource(next);
			setReading(null);
		};
		const open = isVideo ? openVideo(file, videoFps) : openAnimation(file, format, setReading, controller.signal);
		open.then(ready).catch(() => {
			if (!controller.signal.aborted) {
				setFailed(true);
				setReading(null);
			}
		});
		return () => {
			controller.abort();
			setSource(null);
			// Freed once the views have let go of it: they still draw it during this render.
			const previous = opening;
			setTimeout(() => {
				previous?.dispose();
			}, 0);
			setPlaying(false);
		};
	}, [file, isVideo, format, videoFps, batchKey, load, retarget, setPlaying]);

	const frames = useMemo(() => (source && doc.duration > 0 ? outputFrames(doc, source.timing) : []), [source, doc]);
	const length = outputLength(frames);

	// Pictures of a video are read ahead, so playback is smooth from the second loop at the latest.
	useEffect(() => {
		source?.prefetch(frames.map((frame) => frame.source));
	}, [source, frames]);

	// Playback loops, like the GIF will.
	useEffect(() => {
		if (!playing || length <= 0) return;
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			const { playhead } = useGifEditor.getState();
			setPlayhead((playhead + (now - last) / 1000) % length);
			last = now;
			frame = requestAnimationFrame(tick);
		});
		return () => {
			cancelAnimationFrame(frame);
		};
	}, [playing, length, setPlayhead]);

	return useMemo(
		() => ({
			source,
			reading,
			failed,
			frames,
			length,
			togglePlay: () => {
				setPlaying(!useGifEditor.getState().playing);
			},
			seek: (time: number) => {
				setPlayhead(Math.min(Math.max(0, time), Math.max(0, length - 1e-3)));
			},
		}),
		[source, reading, failed, frames, length, setPlaying, setPlayhead],
	);
}
