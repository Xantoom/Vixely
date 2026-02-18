import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProbeResultData, FontAttachmentInfo, DetailedProbeResultData } from '@/workers/ffmpeg-worker.ts';
import { cacheKeyForFile, useVideoMetadataStore } from '@/stores/videoMetadata.ts';

// ── Worker Message Types ──

interface TranscodeRequest {
	type: 'TRANSCODE';
	file: File;
	args: string[];
	outputName: string;
	expectedDurationSec?: number;
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

interface ProbeDetailsRequest {
	type: 'PROBE_DETAILS';
	file: File;
}

interface SubtitlePreviewRequest {
	type: 'SUBTITLE_PREVIEW';
	requestId: number;
	file: File;
	streamIndex: number;
	subtitleCodec?: string;
}

interface ExtractFontsRequest {
	type: 'EXTRACT_FONTS';
	file: File;
	attachments: FontAttachmentInfo[];
}

type WorkerRequest =
	| TranscodeRequest
	| GifRequest
	| ScreenshotRequest
	| ProbeRequest
	| ProbeDetailsRequest
	| SubtitlePreviewRequest
	| ExtractFontsRequest;

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

interface StartedResponse {
	type: 'STARTED';
	job: 'transcode' | 'gif' | 'screenshot';
}

interface LogResponse {
	type: 'LOG';
	message: string;
}

interface ProbeResultResponse {
	type: 'PROBE_RESULT';
	result: ProbeResultData;
	fonts: Array<{ name: string; data: Uint8Array }>;
}

interface ProbeStatusResponse {
	type: 'PROBE_STATUS';
	status: string;
}

interface ProbeDetailsResultResponse {
	type: 'PROBE_DETAILS_RESULT';
	result: DetailedProbeResultData;
}

interface SubtitlePreviewResultResponse {
	type: 'SUBTITLE_PREVIEW_RESULT';
	requestId: number;
	format: 'ass' | 'webvtt';
	content: string;
}

interface FontsResultResponse {
	type: 'FONTS_RESULT';
	fonts: Array<{ name: string; data: Uint8Array }>;
}

type WorkerResponse =
	| ProgressResponse
	| DoneResponse
	| ErrorResponse
	| ReadyResponse
	| StartedResponse
	| LogResponse
	| ProbeStatusResponse
	| ProbeResultResponse
	| ProbeDetailsResultResponse
	| SubtitlePreviewResultResponse
	| FontsResultResponse;

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
	started: boolean;
	progress: number;
	exportStats: ExportStats;
	error: string | null;
}

interface TranscodeOptions {
	file: File;
	args: string[];
	outputName: string;
	expectedDurationSec?: number;
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
}

const INITIAL_STATS: ExportStats = { fps: 0, frame: 0, speed: 0, elapsedMs: 0 };
const DEBUG_WORKER_LOGS =
	typeof window !== 'undefined' && window.localStorage.getItem('vixely:debug-worker-logs') === '1';

function normalizeProgressFromTime(time: number, expectedDurationSec: number, progressHint?: number): number | null {
	if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(expectedDurationSec) || expectedDurationSec <= 0) {
		return null;
	}
	const ratios = [
		time / (expectedDurationSec * 1_000_000), // microseconds
		time / (expectedDurationSec * 1_000), // milliseconds
		time / expectedDurationSec, // seconds
	].filter((ratio) => Number.isFinite(ratio) && ratio >= 0);
	if (ratios.length === 0) return null;
	const inRange = ratios.filter((ratio) => ratio <= 1.2);
	if (inRange.length === 0) {
		const coarse = ratios.filter((ratio) => ratio <= 4);
		if (coarse.length === 0) return null;
		return Math.min(0.999, Math.max(0, Math.max(...coarse)));
	}

	if (typeof progressHint === 'number' && Number.isFinite(progressHint) && progressHint > 0) {
		const target = progressHint;
		const closest = inRange.reduce((best, current) =>
			Math.abs(current - target) < Math.abs(best - target) ? current : best,
		);
		return Math.min(0.999, Math.max(0, closest));
	}

	const best = Math.max(...inRange);
	return Math.min(0.999, Math.max(0, best));
}

function createWorker() {
	return new Worker(new URL('../workers/ffmpeg-worker.ts', import.meta.url), { type: 'module' });
}

export function useVideoProcessor() {
	const [state, setState] = useState<VideoProcessorState>({
		ready: false,
		processing: false,
		started: false,
		progress: 0,
		exportStats: INITIAL_STATS,
		error: null,
	});
	const workerRef = useRef<Worker | null>(null);
	const resolveRef = useRef<((data: Uint8Array) => void) | null>(null);
	const rejectRef = useRef<((err: Error) => void) | null>(null);
	const probeResolveRef = useRef<((data: ProbeResultData) => void) | null>(null);
	const probeRejectRef = useRef<((err: Error) => void) | null>(null);
	const probeCacheKeyRef = useRef<string | null>(null);
	const probeFontsResolveRef = useRef<((fonts: Array<{ name: string; data: Uint8Array }>) => void) | null>(null);
	const probeDetailsResolveRef = useRef<((data: DetailedProbeResultData) => void) | null>(null);
	const probeDetailsRejectRef = useRef<((err: Error) => void) | null>(null);
	const probeDetailsCacheKeyRef = useRef<string | null>(null);
	const subtitleRequestIdRef = useRef(0);
	const subtitlePendingRef = useRef<{
		requestId: number;
		resolve: (preview: SubtitlePreviewData) => void;
		reject: (err: Error) => void;
	} | null>(null);
	const [probeStatus, setProbeStatus] = useState<string | null>(null);
	const fontsPendingRef = useRef<{
		resolve: (fonts: Array<{ name: string; data: Uint8Array }>) => void;
		reject: (err: Error) => void;
	} | null>(null);
	const exportExpectedDurationRef = useRef(0);
	const exportStartRef = useRef<number>(0);
	const lastProgressEmitRef = useRef(0);

	const attachWorker = useCallback((worker: Worker) => {
		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;

			switch (msg.type) {
				case 'READY':
					setState((s) => ({ ...s, ready: true }));
					break;
				case 'STARTED':
					setState((s) => ({ ...s, started: true }));
					break;

				case 'PROGRESS':
					// Keep UI smooth under heavy worker log/progress throughput.
					if (msg.progress < 1) {
						const now = performance.now();
						if (now - lastProgressEmitRef.current < 80) break;
						lastProgressEmitRef.current = now;
					}
					setState((s) => {
						const rawFfmpegProgress =
							Number.isFinite(msg.progress) && msg.progress > 0 ? Math.min(0.999, msg.progress) : null;
						const timeProgress = normalizeProgressFromTime(
							msg.time,
							exportExpectedDurationRef.current,
							rawFfmpegProgress ?? undefined,
						);
						const nextProgress =
							exportExpectedDurationRef.current > 0
								? (timeProgress ?? rawFfmpegProgress ?? s.progress)
								: (rawFfmpegProgress ?? timeProgress ?? s.progress);
						return {
							...s,
							progress: Math.max(s.progress, nextProgress),
							exportStats: {
								fps: msg.fps,
								frame: msg.frame,
								speed: msg.speed,
								elapsedMs: Date.now() - exportStartRef.current,
							},
						};
					});
					break;

				case 'DONE':
					setState((s) => ({ ...s, processing: false, started: false, progress: 1 }));
					exportExpectedDurationRef.current = 0;
					resolveRef.current?.(msg.data);
					resolveRef.current = null;
					rejectRef.current = null;
					break;

				case 'PROBE_RESULT':
					if (probeCacheKeyRef.current) {
						useVideoMetadataStore
							.getState()
							.upsertMetadata(probeCacheKeyRef.current, { probe: msg.result });
					}
					setProbeStatus(null);
					probeCacheKeyRef.current = null;
					if (msg.fonts && msg.fonts.length > 0) {
						probeFontsResolveRef.current?.(msg.fonts);
					}
					probeFontsResolveRef.current = null;
					probeResolveRef.current?.(msg.result);
					probeResolveRef.current = null;
					probeRejectRef.current = null;
					break;
				case 'PROBE_STATUS':
					setProbeStatus(msg.status);
					break;
				case 'PROBE_DETAILS_RESULT':
					if (probeDetailsCacheKeyRef.current) {
						useVideoMetadataStore
							.getState()
							.upsertMetadata(probeDetailsCacheKeyRef.current, { probeDetails: msg.result });
					}
					probeDetailsCacheKeyRef.current = null;
					probeDetailsResolveRef.current?.(msg.result);
					probeDetailsResolveRef.current = null;
					probeDetailsRejectRef.current = null;
					break;

				case 'SUBTITLE_PREVIEW_RESULT':
					if (subtitlePendingRef.current?.requestId !== msg.requestId) break;
					subtitlePendingRef.current.resolve({ format: msg.format, content: msg.content });
					subtitlePendingRef.current = null;
					break;
				case 'FONTS_RESULT':
					fontsPendingRef.current?.resolve(msg.fonts);
					fontsPendingRef.current = null;
					break;

				case 'ERROR':
					console.error('[hook] worker ERROR:', msg.error);
					setState((s) => ({ ...s, processing: false, started: false, error: msg.error }));
					exportExpectedDurationRef.current = 0;
					setProbeStatus(null);
					rejectRef.current?.(new Error(msg.error));
					resolveRef.current = null;
					rejectRef.current = null;
					probeRejectRef.current?.(new Error(msg.error));
					probeResolveRef.current = null;
					probeRejectRef.current = null;
					probeCacheKeyRef.current = null;
					probeFontsResolveRef.current = null;
					probeDetailsRejectRef.current?.(new Error(msg.error));
					probeDetailsResolveRef.current = null;
					probeDetailsRejectRef.current = null;
					probeDetailsCacheKeyRef.current = null;
					fontsPendingRef.current?.reject(new Error(msg.error));
					fontsPendingRef.current = null;
					subtitlePendingRef.current?.reject(new Error(msg.error));
					subtitlePendingRef.current = null;
					break;

				case 'LOG':
					if (DEBUG_WORKER_LOGS) console.debug('[hook] worker LOG:', msg.message);
					break;
			}
		};

		let crashHandled = false;
		worker.onerror = (e) => {
			if (crashHandled) return;
			crashHandled = true;
			console.error('[hook] worker onerror:', e.message, e);
			const err = new Error(e.message ?? 'Worker crashed');
			setState((s) => ({ ...s, ready: false, processing: false, started: false, error: err.message }));
			setProbeStatus(null);
			resolveRef.current = null;
			rejectRef.current?.(err);
			rejectRef.current = null;
			probeResolveRef.current = null;
			probeRejectRef.current?.(err);
			probeRejectRef.current = null;
			probeCacheKeyRef.current = null;
			probeFontsResolveRef.current = null;
			probeDetailsResolveRef.current = null;
			probeDetailsRejectRef.current?.(err);
			probeDetailsRejectRef.current = null;
			probeDetailsCacheKeyRef.current = null;
			fontsPendingRef.current?.reject(err);
			fontsPendingRef.current = null;
			subtitlePendingRef.current?.reject(err);
			subtitlePendingRef.current = null;

			worker.terminate();
			const next = createWorker();
			attachWorker(next);
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

	const rejectBackgroundRequests = useCallback((err: Error) => {
		setProbeStatus(null);
		probeRejectRef.current?.(err);
		probeResolveRef.current = null;
		probeRejectRef.current = null;
		probeCacheKeyRef.current = null;
		probeDetailsRejectRef.current?.(err);
		probeDetailsResolveRef.current = null;
		probeDetailsRejectRef.current = null;
		probeDetailsCacheKeyRef.current = null;
		subtitlePendingRef.current?.reject(err);
		subtitlePendingRef.current = null;
		fontsPendingRef.current?.reject(err);
		fontsPendingRef.current = null;
	}, []);

	const restartWorker = useCallback(
		(stateUpdater?: (s: VideoProcessorState) => VideoProcessorState) => {
			const old = workerRef.current;
			if (!old) return;
			old.terminate();
			if (stateUpdater) setState(stateUpdater);
			const next = createWorker();
			attachWorker(next);
		},
		[attachWorker],
	);

	const cancel = useCallback(() => {
		if (!workerRef.current) return;

		// Reject pending promises
		const err = new Error('Cancelled');
		rejectRef.current?.(err);
		resolveRef.current = null;
		rejectRef.current = null;
		rejectBackgroundRequests(err);

		// Kill the stuck worker and spin up a fresh one
		restartWorker((s) => ({
			...s,
			ready: false,
			processing: false,
			started: false,
			progress: 0,
			exportStats: INITIAL_STATS,
			error: null,
		}));
	}, [rejectBackgroundRequests, restartWorker]);

	const sendCommand = useCallback(
		async (message: WorkerRequest): Promise<Uint8Array> => {
			return new Promise<Uint8Array>((resolve, reject) => {
				if (!workerRef.current) {
					reject(new Error('Worker not initialized'));
					return;
				}

				const isPriorityCommand =
					message.type === 'TRANSCODE' || message.type === 'GIF' || message.type === 'SCREENSHOT';
				const hasBackgroundQueue =
					probeRejectRef.current !== null ||
					probeDetailsRejectRef.current !== null ||
					subtitlePendingRef.current !== null ||
					fontsPendingRef.current !== null;

				// Drop queued metadata/subtitle jobs before user-triggered processing.
				if (isPriorityCommand && hasBackgroundQueue) {
					rejectBackgroundRequests(new Error('Superseded by export operation'));
					restartWorker((s) => ({
						...s,
						ready: false,
						processing: false,
						started: false,
						progress: 0,
						exportStats: INITIAL_STATS,
						error: null,
					}));
				}

				exportStartRef.current = Date.now();
				lastProgressEmitRef.current = 0;
				exportExpectedDurationRef.current =
					message.type === 'TRANSCODE' && typeof message.expectedDurationSec === 'number'
						? Math.max(0, message.expectedDurationSec)
						: 0;
				setState((s) => ({
					...s,
					processing: true,
					started: false,
					progress: 0,
					exportStats: INITIAL_STATS,
					error: null,
				}));
				resolveRef.current = resolve;
				rejectRef.current = reject;
				workerRef.current.postMessage(message);
			});
		},
		[rejectBackgroundRequests, restartWorker],
	);

	const transcode = useCallback(
		async (opts: TranscodeOptions): Promise<Uint8Array> => {
			return sendCommand({
				type: 'TRANSCODE',
				file: opts.file,
				args: opts.args,
				outputName: opts.outputName,
				expectedDurationSec: opts.expectedDurationSec,
			});
		},
		[sendCommand],
	);

	const createGif = useCallback(
		async (opts: GifOptions): Promise<Uint8Array> => {
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
		async (opts: ScreenshotOptions): Promise<Uint8Array> => {
			return sendCommand({ type: 'SCREENSHOT', file: opts.file, timestamp: opts.timestamp });
		},
		[sendCommand],
	);

	const probe = useCallback(
		async (
			file: File,
			onFonts?: (fonts: Array<{ name: string; data: Uint8Array }>) => void,
		): Promise<ProbeResultData> => {
			return new Promise<ProbeResultData>((resolve, reject) => {
				if (!workerRef.current) {
					reject(new Error('Worker not initialized'));
					return;
				}
				const key = cacheKeyForFile(file);
				const cached = useVideoMetadataStore.getState().getMetadata(key);
				if (cached?.probe) {
					setProbeStatus(null);
					resolve(cached.probe);
					return;
				}
				setProbeStatus('Reading container header...');
				probeRejectRef.current?.(new Error('Superseded by newer probe request'));
				probeResolveRef.current = resolve;
				probeRejectRef.current = reject;
				probeCacheKeyRef.current = key;
				probeFontsResolveRef.current = onFonts ?? null;
				workerRef.current.postMessage({ type: 'PROBE', file });
			});
		},
		[],
	);

	const probeDetails = useCallback(async (file: File): Promise<DetailedProbeResultData> => {
		return new Promise<DetailedProbeResultData>((resolve, reject) => {
			if (!workerRef.current) {
				reject(new Error('Worker not initialized'));
				return;
			}
			const key = cacheKeyForFile(file);
			const cached = useVideoMetadataStore.getState().getMetadata(key);
			if (cached?.probeDetails) {
				resolve(cached.probeDetails);
				return;
			}
			probeDetailsRejectRef.current?.(new Error('Superseded by newer detailed probe request'));
			probeDetailsResolveRef.current = resolve;
			probeDetailsRejectRef.current = reject;
			probeDetailsCacheKeyRef.current = key;
			workerRef.current.postMessage({ type: 'PROBE_DETAILS', file });
		});
	}, []);

	const extractSubtitlePreview = useCallback(
		async (file: File, streamIndex: number, subtitleCodec?: string): Promise<SubtitlePreviewData> => {
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

	const extractFonts = useCallback(
		async (file: File, attachments: FontAttachmentInfo[]): Promise<Array<{ name: string; data: Uint8Array }>> => {
			return new Promise((resolve, reject) => {
				if (!workerRef.current) {
					reject(new Error('Worker not initialized'));
					return;
				}
				fontsPendingRef.current?.reject(new Error('Superseded by newer font extraction request'));
				fontsPendingRef.current = { resolve, reject };
				workerRef.current.postMessage({ type: 'EXTRACT_FONTS', file, attachments });
			});
		},
		[],
	);

	return {
		...state,
		transcode,
		createGif,
		captureFrame,
		probe,
		probeStatus,
		probeDetails,
		extractSubtitlePreview,
		extractFonts,
		cancel,
	};
}
