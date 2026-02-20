import { useCallback, useEffect, useRef, type RefObject } from 'react';

interface UseFrameStepControllerParams {
	videoRef: RefObject<HTMLVideoElement | null>;
	processing: boolean;
	frameDuration: number;
	videoFps: number;
	clampToTrim: (time: number) => number;
	handleSeek: (time: number) => void;
}

interface UseFrameStepControllerResult {
	stepCurrentFrame: (direction: -1 | 1) => void;
	startFrameHold: (direction: -1 | 1) => void;
	stopFrameHold: () => void;
}

export function useFrameStepController({
	videoRef,
	processing,
	frameDuration,
	videoFps,
	clampToTrim,
	handleSeek,
}: UseFrameStepControllerParams): UseFrameStepControllerResult {
	const frameHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const stopFrameHold = useCallback(() => {
		if (!frameHoldTimerRef.current) return;
		clearTimeout(frameHoldTimerRef.current);
		frameHoldTimerRef.current = null;
	}, []);

	const stepCurrentFrame = useCallback(
		(direction: -1 | 1) => {
			const video = videoRef.current;
			if (!video) return;
			if (!video.paused) video.pause();
			const target = clampToTrim(video.currentTime + direction * frameDuration);
			handleSeek(target);
		},
		[videoRef, clampToTrim, frameDuration, handleSeek],
	);

	const startFrameHold = useCallback(
		(direction: -1 | 1) => {
			if (processing) return;
			stopFrameHold();

			const release = () => {
				stopFrameHold();
				window.removeEventListener('pointerup', release);
				window.removeEventListener('pointercancel', release);
			};
			window.addEventListener('pointerup', release, { once: true });
			window.addEventListener('pointercancel', release, { once: true });

			stepCurrentFrame(direction);
			const startedAt = performance.now();
			const tick = () => {
				const elapsed = performance.now() - startedAt;
				const targetRate = Math.min(videoFps, Math.max(2, 3 + elapsed / 120));
				stepCurrentFrame(direction);
				frameHoldTimerRef.current = setTimeout(tick, 1000 / Math.max(1, targetRate));
			};
			frameHoldTimerRef.current = setTimeout(tick, 220);
		},
		[processing, stopFrameHold, stepCurrentFrame, videoFps],
	);

	useEffect(() => {
		return () => {
			stopFrameHold();
		};
	}, [stopFrameHold]);

	return { stepCurrentFrame, startFrameHold, stopFrameHold };
}
