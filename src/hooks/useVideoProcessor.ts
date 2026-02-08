import { useState, useCallback, useRef, useEffect } from "react";

// ── Worker Message Types ──

interface TranscodeRequest {
	type: "TRANSCODE";
	file: File;
	args: string[];
	outputName: string;
}

interface GifRequest {
	type: "GIF";
	file: File;
	fps: number;
	width: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	maxColors?: number;
}

interface ScreenshotRequest {
	type: "SCREENSHOT";
	file: File;
	timestamp: number;
}

type WorkerRequest = TranscodeRequest | GifRequest | ScreenshotRequest;

interface ProgressResponse {
	type: "PROGRESS";
	progress: number;
	time: number;
}

interface DoneResponse {
	type: "DONE";
	data: Uint8Array;
	outputName: string;
}

interface ErrorResponse {
	type: "ERROR";
	error: string;
}

interface ReadyResponse {
	type: "READY";
}

interface LogResponse {
	type: "LOG";
	message: string;
}

type WorkerResponse = ProgressResponse | DoneResponse | ErrorResponse | ReadyResponse | LogResponse;

// ── Hook State ──

interface VideoProcessorState {
	ready: boolean;
	processing: boolean;
	progress: number;
	error: string | null;
}

interface TranscodeOptions {
	file: File;
	args: string[];
	outputName: string;
}

interface GifOptions {
	file: File;
	fps?: number;
	width?: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	maxColors?: number;
}

interface ScreenshotOptions {
	file: File;
	timestamp: number;
}

export function useVideoProcessor() {
	const [state, setState] = useState<VideoProcessorState>({
		ready: false,
		processing: false,
		progress: 0,
		error: null,
	});
	const workerRef = useRef<Worker | null>(null);
	const resolveRef = useRef<((data: Uint8Array) => void) | null>(null);
	const rejectRef = useRef<((err: Error) => void) | null>(null);

	useEffect(() => {
		const worker = new Worker(
			new URL("../workers/ffmpeg-worker.ts", import.meta.url),
			{ type: "module" },
		);

		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;

			switch (msg.type) {
				case "READY":
					setState((s) => ({ ...s, ready: true }));
					break;

				case "PROGRESS":
					setState((s) => ({ ...s, progress: msg.progress }));
					break;

				case "DONE":
					setState((s) => ({ ...s, processing: false, progress: 1 }));
					resolveRef.current?.(msg.data);
					resolveRef.current = null;
					rejectRef.current = null;
					break;

				case "ERROR":
					setState((s) => ({ ...s, processing: false, error: msg.error }));
					rejectRef.current?.(new Error(msg.error));
					resolveRef.current = null;
					rejectRef.current = null;
					break;

				case "LOG":
					// Available for debug; silently consumed by default
					break;
			}
		};

		workerRef.current = worker;

		return () => {
			worker.terminate();
			workerRef.current = null;
		};
	}, []);

	const sendCommand = useCallback((message: WorkerRequest): Promise<Uint8Array> => {
		return new Promise<Uint8Array>((resolve, reject) => {
			if (!workerRef.current) {
				reject(new Error("Worker not initialized"));
				return;
			}

			setState((s) => ({ ...s, processing: true, progress: 0, error: null }));
			resolveRef.current = resolve;
			rejectRef.current = reject;
			workerRef.current.postMessage(message);
		});
	}, []);

	const transcode = useCallback(
		(opts: TranscodeOptions): Promise<Uint8Array> => {
			return sendCommand({
				type: "TRANSCODE",
				file: opts.file,
				args: opts.args,
				outputName: opts.outputName,
			});
		},
		[sendCommand],
	);

	const createGif = useCallback(
		(opts: GifOptions): Promise<Uint8Array> => {
			return sendCommand({
				type: "GIF",
				file: opts.file,
				fps: opts.fps ?? 15,
				width: opts.width ?? 480,
				height: opts.height,
				startTime: opts.startTime,
				duration: opts.duration,
				speed: opts.speed,
				reverse: opts.reverse,
				maxColors: opts.maxColors,
			});
		},
		[sendCommand],
	);

	const captureFrame = useCallback(
		(opts: ScreenshotOptions): Promise<Uint8Array> => {
			return sendCommand({
				type: "SCREENSHOT",
				file: opts.file,
				timestamp: opts.timestamp,
			});
		},
		[sendCommand],
	);

	return {
		...state,
		transcode,
		createGif,
		captureFrame,
	};
}
