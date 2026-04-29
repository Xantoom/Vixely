import { useCallback, useState } from 'react';
import { useObjectUrlState } from './useObjectUrlState.ts';
import { useVideoProcessor } from './useVideoProcessor.ts';

export type QuickGifStatus = 'idle' | 'converting' | 'ready' | 'error';

export interface UseQuickGifConversionResult {
	status: QuickGifStatus;
	progress: number;
	gifBlob: Blob | null;
	gifUrl: string | null;
	error: string | null;
	isReady: boolean;
	start: (videoBlob: Blob, fileName: string, opts?: { sourceFps?: number }) => Promise<void>;
	cancel: () => void;
	reset: () => void;
}

// Soft upper cap so we don't accidentally encode a 4K → GIF that's hundreds of
// MB. Anything bigger is clamped while preserving aspect ratio.
const MAX_QUICK_GIF_WIDTH = 1280;
const FALLBACK_FPS = 15;

async function readVideoDimensions(videoBlob: Blob): Promise<{ width: number; height: number } | null> {
	const url = URL.createObjectURL(videoBlob);
	const video = document.createElement('video');
	video.muted = true;
	video.preload = 'metadata';
	video.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				video.removeEventListener('loadedmetadata', onLoad);
				video.removeEventListener('error', onError);
			};
			const onLoad = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error('metadata load failed'));
			};
			video.addEventListener('loadedmetadata', onLoad);
			video.addEventListener('error', onError);
		});
		const w = video.videoWidth;
		const h = video.videoHeight;
		if (w > 0 && h > 0) return { width: w, height: h };
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function useQuickGifConversion(): UseQuickGifConversionResult {
	const { ready, processing, progress, createGif, cancel: cancelProcessor } = useVideoProcessor();
	const [status, setStatus] = useState<QuickGifStatus>('idle');
	const [gifBlob, setGifBlob] = useState<Blob | null>(null);
	const [gifUrl, setGifUrl] = useObjectUrlState();
	const [error, setError] = useState<string | null>(null);

	const reset = useCallback(() => {
		setStatus('idle');
		setGifBlob(null);
		setGifUrl(null);
		setError(null);
	}, [setGifUrl]);

	const cancel = useCallback(() => {
		cancelProcessor();
		setStatus('idle');
	}, [cancelProcessor]);

	const start = useCallback(
		async (videoBlob: Blob, fileName: string, opts?: { sourceFps?: number }) => {
			setError(null);
			setStatus('converting');
			setGifBlob(null);
			setGifUrl(null);

			try {
				const dims = await readVideoDimensions(videoBlob);
				let width = dims?.width ?? MAX_QUICK_GIF_WIDTH;
				let height = dims?.height;
				if (width > MAX_QUICK_GIF_WIDTH) {
					if (dims && height) {
						height = Math.round((MAX_QUICK_GIF_WIDTH * height) / width);
					}
					width = MAX_QUICK_GIF_WIDTH;
				}

				const fps =
					opts?.sourceFps && Number.isFinite(opts.sourceFps) && opts.sourceFps > 0
						? Math.round(opts.sourceFps)
						: FALLBACK_FPS;

				const file = new File([videoBlob], fileName, { type: videoBlob.type || 'video/mp4' });
				const data = await createGif({ file, fps, width, height, loopCount: 0 });
				const blob = new Blob([new Uint8Array(data)], { type: 'image/gif' });
				setGifBlob(blob);
				setGifUrl(URL.createObjectURL(blob));
				setStatus('ready');
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg === 'Cancelled') {
					setStatus('idle');
					return;
				}
				console.error('[quick-gif] conversion failed', err);
				setError('Conversion failed');
				setStatus('error');
			}
		},
		[createGif, setGifUrl],
	);

	return {
		status,
		progress: processing ? progress : 0,
		gifBlob,
		gifUrl,
		error,
		isReady: ready,
		start,
		cancel,
		reset,
	};
}
