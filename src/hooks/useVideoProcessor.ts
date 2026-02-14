import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProbeResultData } from '@/workers/ffmpeg-worker.ts';

// ── Worker Message Types ──

interface TranscodeRequest {
	type: 'TRANSCODE';
	file: File;
	args: string[];
	outputName: string;
}

interface GifRequest {
	type: 'GIF';
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
	type: 'SCREENSHOT';
	file: File;
	timestamp: number;
}

interface ProbeRequest {
	type: 'PROBE';
	file: File;
}

interface SubtitlePreviewRequest {
	type: 'SUBTITLE_PREVIEW';
	requestId: number;
	file: File;
	streamIndex: number;
	subtitleCodec?: string;
}

type WorkerRequest = TranscodeRequest | GifRequest | ScreenshotRequest | ProbeRequest | SubtitlePreviewRequest;

interface ProgressResponse {
	type: 'PROGRESS';
	progress: number;
	time: number;
	fps: number;
	frame: number;
	speed: number;
}

interface DoneResponse {
	type: 'DONE';
	data: Uint8Array;
	outputName: string;
}

interface ErrorResponse {
	type: 'ERROR';
	error: string;
}

interface ReadyResponse {
	type: 'READY';
}

interface LogResponse {
	type: 'LOG';
	message: string;
}

interface ProbeResultResponse {
	type: 'PROBE_RESULT';
	result: ProbeResultData;
}

interface SubtitlePreviewResultResponse {
	type: 'SUBTITLE_PREVIEW_RESULT';
	requestId: number;
	format: 'ass' | 'webvtt';
	content: string;
	fallbackWebVtt?: string;
}

type WorkerResponse =
	| ProgressResponse
	| DoneResponse
	| ErrorResponse
	| ReadyResponse
	| LogResponse
	| ProbeResultResponse
	| SubtitlePreviewResultResponse;

// ── Hook State ──

export interface ExportStats {
	fps: number;
	frame: number;
	speed: number;
	elapsedMs: number;
}

interface VideoProcessorState {
	ready: boolean;
	processing: boolean;
	progress: number;
	exportStats: ExportStats;
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

export interface SubtitlePreviewData {
	format: 'ass' | 'webvtt';
	content: string;
	fallbackWebVtt?: string;
}

const INITIAL_STATS: ExportStats = { fps: 0, frame: 0, speed: 0, elapsedMs: 0 };

function createWorker() {
	return new Worker(new URL('../workers/ffmpeg-worker.ts', import.meta.url), { type: 'module' });
}

export function useVideoProcessor() {
	const [state, setState] = useState<VideoProcessorState>({
		ready: false,
		processing: false,
		progress: 0,
		exportStats: INITIAL_STATS,
		error: null,
	});
	const workerRef = useRef<Worker | null>(null);
	const resolveRef = useRef<((data: Uint8Array) => void) | null>(null);
	const rejectRef = useRef<((err: Error) => void) | null>(null);
	const probeResolveRef = useRef<((data: ProbeResultData) => void) | null>(null);
	const probeRejectRef = useRef<((err: Error) => void) | null>(null);
	const subtitleRequestIdRef = useRef(0);
	const subtitlePendingRef = useRef<{
		requestId: number;
		resolve: (preview: SubtitlePreviewData) => void;
		reject: (err: Error) => void;
	} | null>(null);
	const exportStartRef = useRef<number>(0);

	const attachWorker = useCallback((worker: Worker) => {
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;

			switch (msg.type) {
				case 'READY':
					setState((s) => ({ ...s, ready: true }));
					break;

				case 'PROGRESS':
					setState((s) => ({
						...s,
						progress: msg.progress,
						exportStats: {
							fps: msg.fps,
							frame: msg.frame,
							speed: msg.speed,
							elapsedMs: Date.now() - exportStartRef.current,
						},
					}));
					break;

				case 'DONE':
					setState((s) => ({ ...s, processing: false, progress: 1 }));
					resolveRef.current?.(msg.data);
					resolveRef.current = null;
					rejectRef.current = null;
					break;

				case 'PROBE_RESULT':
					probeResolveRef.current?.(msg.result);
					probeResolveRef.current = null;
					probeRejectRef.current = null;
					break;

				case 'SUBTITLE_PREVIEW_RESULT':
					if (subtitlePendingRef.current?.requestId !== msg.requestId) break;
					subtitlePendingRef.current.resolve({
						format: msg.format,
						content: msg.content,
						fallbackWebVtt: msg.fallbackWebVtt,
					});
					subtitlePendingRef.current = null;
					break;

				case 'ERROR':
					console.error('[hook] worker ERROR:', msg.error);
					setState((s) => ({ ...s, processing: false, error: msg.error }));
					rejectRef.current?.(new Error(msg.error));
					resolveRef.current = null;
					rejectRef.current = null;
					probeRejectRef.current?.(new Error(msg.error));
					probeResolveRef.current = null;
					probeRejectRef.current = null;
					subtitlePendingRef.current?.reject(new Error(msg.error));
					subtitlePendingRef.current = null;
					break;

				case 'LOG':
					console.debug('[hook] worker LOG:', msg.message);
					break;
			}
		};

		worker.onerror = (e) => {
			console.error('[hook] worker onerror:', e.message, e);
			const err = new Error(e.message ?? 'Worker crashed');
			setState((s) => ({ ...s, processing: false, error: err.message }));
			resolveRef.current = null;
			rejectRef.current?.(err);
			rejectRef.current = null;
			probeResolveRef.current = null;
			probeRejectRef.current?.(err);
			probeRejectRef.current = null;
			subtitlePendingRef.current?.reject(err);
			subtitlePendingRef.current = null;
		};

		workerRef.current = worker;
	}, []);

	useEffect(() => {
		const worker = createWorker();
		attachWorker(worker);

		return () => {
			worker.terminate();
			workerRef.current = null;
		};
	}, [attachWorker]);

	const cancel = useCallback(() => {
		const old = workerRef.current;
		if (!old) return;

		// Reject pending promises
		const err = new Error('Cancelled');
		rejectRef.current?.(err);
		resolveRef.current = null;
		rejectRef.current = null;
		probeRejectRef.current?.(err);
		probeResolveRef.current = null;
		probeRejectRef.current = null;
		subtitlePendingRef.current?.reject(err);
		subtitlePendingRef.current = null;

		// Kill the stuck worker and spin up a fresh one
		old.terminate();
		setState((s) => ({
			...s,
			ready: false,
			processing: false,
			progress: 0,
			exportStats: INITIAL_STATS,
			error: null,
		}));

		const next = createWorker();
		attachWorker(next);
	}, [attachWorker]);

	const sendCommand = useCallback((message: WorkerRequest): Promise<Uint8Array> => {
		return new Promise<Uint8Array>((resolve, reject) => {
			if (!workerRef.current) {
				reject(new Error('Worker not initialized'));
				return;
			}

			exportStartRef.current = Date.now();
			setState((s) => ({ ...s, processing: true, progress: 0, exportStats: INITIAL_STATS, error: null }));
			resolveRef.current = resolve;
			rejectRef.current = reject;
			workerRef.current.postMessage(message);
		});
	}, []);

	const transcode = useCallback(
		(opts: TranscodeOptions): Promise<Uint8Array> => {
			return sendCommand({ type: 'TRANSCODE', file: opts.file, args: opts.args, outputName: opts.outputName });
		},
		[sendCommand],
	);

	const createGif = useCallback(
		(opts: GifOptions): Promise<Uint8Array> => {
			return sendCommand({
				type: 'GIF',
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
			return sendCommand({ type: 'SCREENSHOT', file: opts.file, timestamp: opts.timestamp });
		},
		[sendCommand],
	);

	const probe = useCallback((file: File): Promise<ProbeResultData> => {
		return new Promise<ProbeResultData>((resolve, reject) => {
			if (!workerRef.current) {
				reject(new Error('Worker not initialized'));
				return;
			}
			probeResolveRef.current = resolve;
			probeRejectRef.current = reject;
			workerRef.current.postMessage({ type: 'PROBE', file });
		});
	}, []);

	const extractSubtitlePreview = useCallback(
		(file: File, streamIndex: number, subtitleCodec?: string): Promise<SubtitlePreviewData> => {
			return new Promise<SubtitlePreviewData>((resolve, reject) => {
				if (!workerRef.current) {
					reject(new Error('Worker not initialized'));
					return;
				}
				const requestId = ++subtitleRequestIdRef.current;
				subtitlePendingRef.current?.reject(new Error('Superseded by newer subtitle preview request'));
				subtitlePendingRef.current = { requestId, resolve, reject };
				workerRef.current.postMessage({
					type: 'SUBTITLE_PREVIEW',
					requestId,
					file,
					streamIndex,
					subtitleCodec,
				});
			});
		},
		[],
	);

	return { ...state, transcode, createGif, captureFrame, probe, extractSubtitlePreview, cancel };
}
