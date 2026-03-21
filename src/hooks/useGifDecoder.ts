import { useEffect, useRef, useState } from 'react';

export interface DecodedGifFrame {
	bitmap: ImageBitmap;
	/** Frame duration in milliseconds */
	durationMs: number;
}

interface UseGifDecoderResult {
	frames: DecodedGifFrame[];
	/** True while decoding is in progress */
	decoding: boolean;
	/** True if ImageDecoder API is available */
	supported: boolean;
	/** Natural dimensions of the GIF */
	naturalWidth: number;
	naturalHeight: number;
}

/** Whether the browser supports the ImageDecoder API for GIF decoding */
const IMAGE_DECODER_SUPPORTED = typeof globalThis.ImageDecoder === 'function';

/**
 * Decodes GIF frames using the browser's ImageDecoder API (Chrome/Edge 94+).
 * Returns an array of ImageBitmap frames with timing info for canvas playback.
 * Falls back gracefully — `supported` will be false on Firefox/Safari.
 */
export function useGifDecoder(blobUrl: string | null): UseGifDecoderResult {
	const [frames, setFrames] = useState<DecodedGifFrame[]>([]);
	const [decoding, setDecoding] = useState(false);
	const [dims, setDims] = useState({ w: 0, h: 0 });
	const prevUrlRef = useRef<string | null>(null);

	useEffect(() => {
		if (!IMAGE_DECODER_SUPPORTED || !blobUrl) {
			setFrames([]);
			setDecoding(false);
			prevUrlRef.current = null;
			return;
		}

		// Skip if same URL already decoded
		if (prevUrlRef.current === blobUrl && frames.length > 0) return;
		prevUrlRef.current = blobUrl;

		let cancelled = false;
		const bitmapsToCleanup: ImageBitmap[] = [];

		async function decode() {
			setDecoding(true);
			try {
				const response = await fetch(blobUrl!);
				const body = response.body;
				if (!body || cancelled) return;

				const decoder = new ImageDecoder({ data: body, type: 'image/gif' });
				await decoder.completed;

				if (cancelled) {
					decoder.close();
					return;
				}

				const track = decoder.tracks.selectedTrack;
				if (!track) {
					decoder.close();
					return;
				}

				const frameCount = track.frameCount;
				const decodedFrames: DecodedGifFrame[] = [];

				// Canvas for compositing — GIF frames can be partial/delta
				const compositeCanvas = new OffscreenCanvas(1, 1);
				const compositeCtx = compositeCanvas.getContext('2d')!;
				let canvasInitialized = false;

				// GIF frames must be decoded sequentially (composite/delta rendering)
				// eslint-disable-next-line no-await-in-loop
				for (let i = 0; i < frameCount; i++) {
					if (cancelled) break;

					// eslint-disable-next-line no-await-in-loop
					const result = await decoder.decode({ frameIndex: i });
					const videoFrame = result.image;

					// Initialize canvas from first frame dimensions
					if (!canvasInitialized) {
						const w = videoFrame.displayWidth;
						const h = videoFrame.displayHeight;
						compositeCanvas.width = w;
						compositeCanvas.height = h;
						setDims({ w, h });
						canvasInitialized = true;
					}

					// Read duration before closing (microseconds → ms, default 100ms)
					const durationMs = videoFrame.duration ? videoFrame.duration / 1000 : 100;

					// Draw frame onto composite canvas (handles partial/delta frames)
					compositeCtx.drawImage(videoFrame, 0, 0);
					videoFrame.close();

					// eslint-disable-next-line no-await-in-loop
					const bitmap = await createImageBitmap(compositeCanvas);
					bitmapsToCleanup.push(bitmap);

					decodedFrames.push({ bitmap, durationMs });
				}

				decoder.close();

				if (!cancelled) {
					setFrames(decodedFrames);
				}
			} catch {
				// Silently fail — fallback to native <img> preview
			} finally {
				if (!cancelled) {
					setDecoding(false);
				}
			}
		}

		void decode();

		return () => {
			cancelled = true;
			// Clean up bitmaps if we're unmounting before completion
			for (const bmp of bitmapsToCleanup) {
				bmp.close();
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [blobUrl]);

	return { frames, decoding, supported: IMAGE_DECODER_SUPPORTED, naturalWidth: dims.w, naturalHeight: dims.h };
}
