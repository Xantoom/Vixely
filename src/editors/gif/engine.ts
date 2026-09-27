import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenedFile } from '@/media/session';
import { createGifDoc, FRAME_RATES, type OutputFrame, outputFrames, outputLength } from './document';
import { type FrameSource, openAnimation, openImages, openVideo } from './source';
import { useGifDoc, useGifEditor } from './store';

/** Width a GIF made from a video starts at: wider ones weigh too much for most uses. */
const VIDEO_WIDTH = 480;
/** Frame rate a GIF made from a video starts at: gifski's own default, smooth and light. */
const VIDEO_FPS = 20;
/** Width a GIF made from photos starts at: sharp enough on a screen, still light. */
const IMAGES_WIDTH = 800;

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
	const images = opened?.images ?? null;
	// The images the source holds, so those added later are read on their own.
	const imageCount = useRef(0);
	const imagesRef = useRef(images);
	imagesRef.current = images;
	// The source shown last, freed when the file changes; and which opening it belongs to.
	const latest = useRef<FrameSource | null>(null);
	const generation = useRef(0);

	useEffect(() => {
		if (!file) return;
		const controller = new AbortController();
		generation.current += 1;
		setFailed(false);
		setReading(0);
		const ready = (next: FrameSource) => {
			if (controller.signal.aborted) {
				next.dispose();
				return;
			}
			const fps = next.timing ? null : startRate(next.fps);
			const width = next.addImages
				? Math.min(next.width, IMAGES_WIDTH)
				: next.timing
					? null
					: Math.min(next.width, VIDEO_WIDTH);
			const doc = createGifDoc(next.duration, fps);
			// A batch keeps its export settings from file to file; a single file starts afresh.
			if (batchKey && useGifEditor.getState().owner === batchKey) retarget(doc);
			else load(batchKey ?? file, doc, width, !batchKey && !isVideo && format === 'gif');
			latest.current = next;
			setSource(next);
			setReading(null);
		};
		const still = imagesRef.current;
		if (still) imageCount.current = still.length;
		const open = still
			? openImages(still, setReading)
			: isVideo
				? openVideo(file, videoFps)
				: openAnimation(file, format, setReading, controller.signal);
		open.then(ready).catch(() => {
			if (!controller.signal.aborted) {
				setFailed(true);
				setReading(null);
			}
		});
		return () => {
			controller.abort();
			generation.current += 1;
			setSource(null);
			// Freed once the views have let go of it: they still draw it during this render.
			const previous = latest.current;
			latest.current = null;
			setTimeout(() => {
				previous?.dispose();
			}, 0);
			setPlaying(false);
		};
	}, [file, isVideo, format, videoFps, batchKey, load, retarget, setPlaying]);

	// Images added to an animation made from images: read, then played at the end. The source
	// they join hands its pictures over to the new one.
	useEffect(() => {
		if (!source?.addImages || !images || images.length <= imageCount.current) return;
		const added = images.slice(imageCount.current);
		imageCount.current = images.length;
		const opening = generation.current;
		void source.addImages(added).then((next) => {
			if (opening !== generation.current) {
				next.dispose();
				return;
			}
			const before = source.duration;
			useGifEditor
				.getState()
				.apply((doc) => ({
					...doc,
					duration: next.duration,
					trim: { start: doc.trim.start, end: doc.trim.end >= before - 1e-6 ? next.duration : doc.trim.end },
				}));
			latest.current = next;
			setSource(next);
		});
	}, [source, images]);

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
