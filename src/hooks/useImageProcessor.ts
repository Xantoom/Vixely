import { useState, useCallback, useRef, useEffect } from 'react';
import type { Filters } from '@/stores/imageEditor.ts';

interface ImageProcessorState {
	ready: boolean;
	processing: boolean;
	error: string | null;
}

/**
 * Apply blur via canvas filter. Kept on main thread (needs canvas API).
 */
function applyBlur(imageData: ImageData, blurPx: number): ImageData {
	const { width, height } = imageData;
	const srcCanvas = document.createElement('canvas');
	srcCanvas.width = width;
	srcCanvas.height = height;
	const srcCtx = srcCanvas.getContext('2d')!;
	srcCtx.putImageData(imageData, 0, 0);

	const dstCanvas = document.createElement('canvas');
	dstCanvas.width = width;
	dstCanvas.height = height;
	const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
	dstCtx.filter = `blur(${blurPx}px)`;
	dstCtx.drawImage(srcCanvas, 0, 0);

	return dstCtx.getImageData(0, 0, width, height);
}

export function useImageProcessor() {
	const [state, setState] = useState<ImageProcessorState>({ ready: false, processing: false, error: null });
	const workerRef = useRef<Worker | null>(null);
	const pendingResolve = useRef<((data: ImageData) => void) | null>(null);
	const pendingReject = useRef<((err: Error) => void) | null>(null);
	const pendingFilters = useRef<Filters | null>(null);

	useEffect(() => {
		const worker = new Worker(new URL('../workers/image-worker.ts', import.meta.url), { type: 'module' });

		worker.onmessage = (e: MessageEvent) => {
			const msg = e.data;

			if (msg.type === 'READY') {
				setState((s) => ({ ...s, ready: true }));
				return;
			}

			if (msg.type === 'DONE') {
				const result = new ImageData(new Uint8ClampedArray(msg.pixels), msg.width, msg.height);

				// Apply blur on main thread if needed (requires canvas API)
				const filters = pendingFilters.current;
				let final = result;
				if (filters && filters.blur > 0) {
					final = applyBlur(result, filters.blur);
				}

				pendingResolve.current?.(final);
				pendingResolve.current = null;
				pendingReject.current = null;
				pendingFilters.current = null;
				return;
			}

			if (msg.type === 'ERROR') {
				pendingReject.current?.(new Error(msg.error));
				pendingResolve.current = null;
				pendingReject.current = null;
				pendingFilters.current = null;
				return;
			}
		};

		workerRef.current = worker;
		worker.postMessage({ type: 'INIT' });

		return () => {
			worker.terminate();
			workerRef.current = null;
		};
	}, []);

	const processImageData = useCallback((imageData: ImageData, filters: Filters): Promise<ImageData> => {
		return new Promise<ImageData>((resolve, reject) => {
			if (!workerRef.current) {
				reject(new Error('Worker not initialized'));
				return;
			}

			// Copy pixel data for transfer to worker
			const pixels = new Uint8Array(imageData.data.buffer.slice(0));

			pendingResolve.current = resolve;
			pendingReject.current = reject;
			pendingFilters.current = filters;

			workerRef.current.postMessage(
				{ type: 'PROCESS', pixels: pixels.buffer, width: imageData.width, height: imageData.height, filters },
				[pixels.buffer],
			);
		});
	}, []);

	const processFile = useCallback(
		async (file: File, filters: Filters): Promise<Blob> => {
			setState((s) => ({ ...s, processing: true, error: null }));

			try {
				const bitmap = await createImageBitmap(file);
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(bitmap, 0, 0);
				bitmap.close();

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const result = await processImageData(imageData, filters);

				ctx.putImageData(result, 0, 0);
				const blob = await canvas.convertToBlob({ type: 'image/png' });

				setState((s) => ({ ...s, processing: false }));
				return blob;
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				setState((s) => ({ ...s, processing: false, error }));
				throw err;
			}
		},
		[processImageData],
	);

	const loadPreview = useCallback((file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsDataURL(file);
		});
	}, []);

	return { ...state, processImageData, processFile, loadPreview };
}
