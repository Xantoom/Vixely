import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface UseTimelineScrubControllerParams {
	videoRef: RefObject<HTMLVideoElement | null>;
	trimStart: number;
	trimEnd: number;
	processing: boolean;
	setCurrentTime: (time: number) => void;
}

interface UseTimelineScrubControllerResult {
	timelineScrubbing: boolean;
	clampToTrim: (time: number) => number;
	handleSeek: (time: number) => void;
	handleTimelineScrubStart: () => void;
	handleTimelineScrubEnd: () => void;
	handleTimeUpdate: () => void;
}

export function useTimelineScrubController({
	videoRef,
	trimStart,
	trimEnd,
	processing,
	setCurrentTime,
}: UseTimelineScrubControllerParams): UseTimelineScrubControllerResult {
	const [timelineScrubbing, setTimelineScrubbing] = useState(false);
	const scrubSeekTimeRef = useRef<number | null>(null);
	const scrubSeekRafRef = useRef<number | null>(null);
	const lastSeekDispatchMsRef = useRef(0);
	const isTimelineScrubbingRef = useRef(false);

	const clampToTrim = useCallback(
		(time: number) => {
			if (!Number.isFinite(time)) return trimStart;
			return Math.min(trimEnd, Math.max(trimStart, time));
		},
		[trimStart, trimEnd],
	);

	const applyVideoSeek = useCallback(
		(time: number, mode: 'exact' | 'fast' = 'exact') => {
			if (!Number.isFinite(time)) return;
			const video = videoRef.current;
			const clamped = clampToTrim(time);
			if (!Number.isFinite(clamped)) return;
			if (video && mode === 'fast' && typeof video.fastSeek === 'function') {
				try {
					video.fastSeek(clamped);
					return;
				} catch {
					// Fallback to exact seek.
				}
			}
			if (video && (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - clamped) > 1e-4)) {
				video.currentTime = clamped;
			}
		},
		[videoRef, clampToTrim],
	);

	const runScrubSeekLoop = useCallback(() => {
		scrubSeekRafRef.current = null;
		const pending = scrubSeekTimeRef.current;
		if (pending == null) return;
		const video = videoRef.current;
		if (!video) {
			scrubSeekTimeRef.current = null;
			return;
		}
		const clamped = clampToTrim(pending);
		if (!Number.isFinite(clamped)) {
			scrubSeekTimeRef.current = null;
			return;
		}

		const now = performance.now();
		const isScrubbing = isTimelineScrubbingRef.current;
		const minIntervalMs = isScrubbing ? 90 : video.seeking ? 33 : 16;
		const current = Number.isFinite(video.currentTime) ? video.currentTime : Number.NaN;
		const hasMeaningfulDelta = !Number.isFinite(current) || Math.abs(current - clamped) > 0.03;
		if (hasMeaningfulDelta && now - lastSeekDispatchMsRef.current >= minIntervalMs) {
			applyVideoSeek(clamped, isScrubbing ? 'fast' : 'exact');
			lastSeekDispatchMsRef.current = now;
		}

		const refreshed = Number.isFinite(video.currentTime) ? video.currentTime : Number.NaN;
		if (Number.isFinite(refreshed) && Math.abs(refreshed - clamped) <= 0.02) {
			scrubSeekTimeRef.current = null;
		}

		if (scrubSeekTimeRef.current != null) {
			scrubSeekRafRef.current = requestAnimationFrame(() => {
				runScrubSeekLoop();
			});
		}
	}, [videoRef, clampToTrim, applyVideoSeek]);

	const handleSeek = useCallback(
		(time: number) => {
			if (!Number.isFinite(time)) return;
			const clamped = clampToTrim(time);
			if (!Number.isFinite(clamped)) return;
			setCurrentTime(clamped);
			scrubSeekTimeRef.current = clamped;
			if (scrubSeekRafRef.current != null) return;
			scrubSeekRafRef.current = requestAnimationFrame(() => {
				runScrubSeekLoop();
			});
		},
		[clampToTrim, runScrubSeekLoop, setCurrentTime],
	);

	const handleTimelineScrubStart = useCallback(() => {
		isTimelineScrubbingRef.current = true;
		setTimelineScrubbing(true);
	}, []);

	const handleTimelineScrubEnd = useCallback(() => {
		isTimelineScrubbingRef.current = false;
		setTimelineScrubbing(false);
		const pending = scrubSeekTimeRef.current;
		if (pending == null) return;
		const clamped = clampToTrim(pending);
		if (!Number.isFinite(clamped)) return;
		scrubSeekTimeRef.current = clamped;
		setCurrentTime(clamped);
		applyVideoSeek(clamped, 'exact');
		if (scrubSeekRafRef.current == null) {
			scrubSeekRafRef.current = requestAnimationFrame(() => {
				runScrubSeekLoop();
			});
		}
	}, [clampToTrim, setCurrentTime, applyVideoSeek, runScrubSeekLoop]);

	const handleTimeUpdate = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const pendingSeek = scrubSeekTimeRef.current;
		if (pendingSeek != null) {
			if (!Number.isFinite(video.currentTime)) return;
			const pendingDelta = Math.abs(video.currentTime - pendingSeek);
			if (pendingDelta > 0.04) return;
			scrubSeekTimeRef.current = null;
		}
		if (!Number.isFinite(video.currentTime)) {
			video.currentTime = trimStart;
			setCurrentTime(trimStart);
			return;
		}

		if (video.currentTime < trimStart) {
			video.currentTime = trimStart;
			setCurrentTime(trimStart);
			return;
		}

		if (video.currentTime >= trimEnd) {
			video.currentTime = trimEnd;
			setCurrentTime(trimEnd);
			if (!video.paused) video.pause();
			return;
		}

		setCurrentTime(video.currentTime);
	}, [videoRef, trimStart, trimEnd, setCurrentTime]);

	useEffect(() => {
		return () => {
			if (scrubSeekRafRef.current != null) {
				cancelAnimationFrame(scrubSeekRafRef.current);
				scrubSeekRafRef.current = null;
			}
			scrubSeekTimeRef.current = null;
			isTimelineScrubbingRef.current = false;
		};
	}, []);

	useEffect(() => {
		const video = videoRef.current;
		if (video && !processing) {
			const clamped = clampToTrim(video.currentTime);
			if (Math.abs(clamped - video.currentTime) > 0.0001) {
				video.currentTime = clamped;
				setCurrentTime(clamped);
			}
			if (clamped >= trimEnd && !video.paused) {
				video.pause();
			}
		}
	}, [videoRef, processing, clampToTrim, trimEnd, setCurrentTime]);

	return {
		timelineScrubbing,
		clampToTrim,
		handleSeek,
		handleTimelineScrubStart,
		handleTimelineScrubEnd,
		handleTimeUpdate,
	};
}
