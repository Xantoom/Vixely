import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProbeResultData, FontAttachmentInfo, DetailedProbeResultData } from '@/workers/ffmpeg-worker.ts';
import { cacheKeyForFile, useVideoMetadataStore } from '@/stores/videoMetadata.ts';
import { emitTelemetry } from '@/utils/telemetry.ts';

// ── Worker Message Types ──

interface TranscodeRequest {
	type: 'TRANSCODE';
	jobId?: number;
	file: File;
	args: string[];
	outputName: string;
	expectedDurationSec?: number;
}

interface GifRequest {
	type: 'GIF';
	jobId?: number;
	file: File;
	fps: number;
	width: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	maxColors?: number;
	loopCount?: number;
	compressionSpeed?: number;
	frameDelaysCs?: number[];
	cropX?: number;
	cropY?: number;
	cropW?: number;
	cropH?: number;
	rotation?: 0 | 90 | 180 | 270;
	flipH?: boolean;
	flipV?: boolean;
	filterExposure?: number;
	filterBrightness?: number;
	filterContrast?: number;
	filterSaturation?: number;
	filterHue?: number;
	filterSepia?: number;
	filterBlur?: number;
	filterHighlights?: number;
	filterShadows?: number;
	filterTemperature?: number;
	filterTint?: number;
	filterVignette?: number;
	filterGrain?: number;
	textOverlays?: Array<{
		text: string;
		x: number;
		y: number;
		fontSize: number;
		fontFamily: string;
		color: string;
		outlineColor: string;
		outlineWidth: number;
		opacity: number;
	}>;
	imageOverlayBlob?: Blob;
	imageOverlayX?: number;
	imageOverlayY?: number;
	imageOverlayWidth?: number;
	imageOverlayHeight?: number;
	imageOverlayOpacity?: number;
	fadeInFrames?: number;
	fadeOutFrames?: number;
	fadeColor?: string;
	aspectRatio?: number;
	aspectPaddingColor?: string;
}

interface ExtractGifFramesRequest {
	type: 'EXTRACT_GIF_FRAMES';
	jobId?: number;
	file: File;
	fps: number;
	width: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	thumbWidth?: number;
}

interface ScreenshotRequest {
	type: 'SCREENSHOT';
	jobId?: number;
	file: File;
	timestamp: number;
}

interface ProbeRequest {
	type: 'PROBE';
	jobId?: number;
	file: File;
}

interface ProbeDetailsRequest {
	type: 'PROBE_DETAILS';
	jobId?: number;
	file: File;
}

interface SubtitlePreviewRequest {
	type: 'SUBTITLE_PREVIEW';
	jobId?: number;
	requestId: number;
	file: File;
	streamIndex: number;
	subtitleCodec?: string;
}

interface ExtractFontsRequest {
	type: 'EXTRACT_FONTS';
	jobId?: number;
	file: File;
	attachments: FontAttachmentInfo[];
}

interface AbortRequest {
	type: 'ABORT';
	jobId: number;
	reason?: string;
}

type WorkerRequest =
	| TranscodeRequest
	| GifRequest
	| ExtractGifFramesRequest
	| ScreenshotRequest
	| ProbeRequest
	| ProbeDetailsRequest
	| SubtitlePreviewRequest
	| ExtractFontsRequest;

interface ProgressResponse {
	type: 'PROGRESS';
	jobId?: number;
	progress: number;
	time: number;
	fps: number;
	frame: number;
	speed: number;
}

interface DoneResponse {
	type: 'DONE';
	jobId?: number;
	data: Uint8Array;
	outputName: string;
}

interface ErrorResponse {
	type: 'ERROR';
	jobId?: number;
	error: string;
}

interface ReadyResponse {
	type: 'READY';
	jobId?: number;
}

interface StartedResponse {
	type: 'STARTED';
	jobId?: number;
	job: 'transcode' | 'gif' | 'screenshot';
}

interface LogResponse {
	type: 'LOG';
	jobId?: number;
	message: string;
}

interface ProbeResultResponse {
	type: 'PROBE_RESULT';
	jobId?: number;
	result: ProbeResultData;
	fonts: Array<{ name: string; data: Uint8Array }>;
}

interface ProbeStatusResponse {
	type: 'PROBE_STATUS';
	jobId?: number;
	status: string;
}

interface ProbeDetailsResultResponse {
	type: 'PROBE_DETAILS_RESULT';
	jobId?: number;
	result: DetailedProbeResultData;
}

interface SubtitlePreviewResultResponse {
	type: 'SUBTITLE_PREVIEW_RESULT';
	jobId?: number;
	requestId: number;
	format: 'ass' | 'webvtt';
	content: string;
}

interface FontsResultResponse {
	type: 'FONTS_RESULT';
	jobId?: number;
	fonts: Array<{ name: string; data: Uint8Array }>;
}

interface FramesExtractedResponse {
	type: 'FRAMES_EXTRACTED';
	jobId?: number;
	frames: Array<{ index: number; blob: Blob; width: number; height: number; timeMs: number }>;
	totalFrames: number;
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
	| FontsResultResponse
	| FramesExtractedResponse;

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
	loopCount?: number;
	compressionSpeed?: number;
	frameDelaysCs?: number[];
	cropX?: number;
	cropY?: number;
	cropW?: number;
	cropH?: number;
	rotation?: 0 | 90 | 180 | 270;
	flipH?: boolean;
	flipV?: boolean;
	filterExposure?: number;
	filterBrightness?: number;
	filterContrast?: number;
	filterSaturation?: number;
	filterHue?: number;
	filterSepia?: number;
	filterBlur?: number;
	filterHighlights?: number;
	filterShadows?: number;
	filterTemperature?: number;
	filterTint?: number;
	filterVignette?: number;
	filterGrain?: number;
	textOverlays?: Array<{
		text: string;
		x: number;
		y: number;
		fontSize: number;
		fontFamily: string;
		color: string;
		outlineColor: string;
		outlineWidth: number;
		opacity: number;
	}>;
	imageOverlayBlob?: Blob;
	imageOverlayX?: number;
	imageOverlayY?: number;
	imageOverlayWidth?: number;
	imageOverlayHeight?: number;
	imageOverlayOpacity?: number;
	fadeInFrames?: number;
	fadeOutFrames?: number;
	fadeColor?: string;
	aspectRatio?: number;
	aspectPaddingColor?: string;
}

interface ExtractFramesOptions {
	file: File;
	fps?: number;
	width?: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	thumbWidth?: number;
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

interface ActiveForegroundJobTelemetry {
	id: number;
	requestType: WorkerRequest['type'];
	queuedAtMs: number;
	startedAtMs: number | null;
	firstProgressAtMs: number | null;
	fileName: string;
	fileSizeBytes: number;
	outputName: string | null;
	expectedDurationSec: number;
}

function toExpectedDurationSec(message: WorkerRequest): number {
	switch (message.type) {
		case 'TRANSCODE':
			return Math.max(0, message.expectedDurationSec ?? 0);
		case 'GIF':
		case 'EXTRACT_GIF_FRAMES':
			return Math.max(0, message.duration ?? 0);
		case 'SCREENSHOT':
		case 'PROBE':
		case 'PROBE_DETAILS':
		case 'SUBTITLE_PREVIEW':
		case 'EXTRACT_FONTS':
			return 0;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkerPerfLog(message: string): Record<string, unknown> | null {
	const prefix = '[perf] ';
	if (!message.startsWith(prefix)) return null;
	try {
		const parsed: unknown = JSON.parse(message.slice(prefix.length));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

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

interface CancellationToken {
	cancelled: boolean;
	reason: string | null;
}

interface ScheduledCommand {
	jobId: number;
	sequence: number;
	message: WorkerRequest;
	priority: number;
	kind: 'foreground' | 'background';
	token: CancellationToken;
	dispatch: (worker: Worker, jobId: number) => void;
	reject: (err: Error) => void;
}

function isForegroundRequest(message: WorkerRequest): boolean {
	return (
		message.type === 'TRANSCODE' ||
		message.type === 'GIF' ||
		message.type === 'SCREENSHOT' ||
		message.type === 'EXTRACT_GIF_FRAMES'
	);
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
	const framesResolveRef = useRef<
		((frames: Array<{ index: number; blob: Blob; width: number; height: number; timeMs: number }>) => void) | null
	>(null);
	const framesRejectRef = useRef<((err: Error) => void) | null>(null);
	const exportExpectedDurationRef = useRef(0);
	const exportStartRef = useRef<number>(0);
	const lastProgressEmitRef = useRef(0);
	const activeForegroundJobRef = useRef<ActiveForegroundJobTelemetry | null>(null);
	const nextForegroundJobIdRef = useRef(1);
	const queueRef = useRef<ScheduledCommand[]>([]);
	const activeCommandRef = useRef<ScheduledCommand | null>(null);
	const nextQueueSequenceRef = useRef(1);
	const nextWorkerJobIdRef = useRef(1);

	const beginForegroundJobTelemetry = useCallback((message: WorkerRequest) => {
		if (
			message.type !== 'TRANSCODE' &&
			message.type !== 'GIF' &&
			message.type !== 'SCREENSHOT' &&
			message.type !== 'EXTRACT_GIF_FRAMES'
		) {
			return;
		}
		const outputName = 'outputName' in message ? message.outputName : null;
		const entry: ActiveForegroundJobTelemetry = {
			id: nextForegroundJobIdRef.current++,
			requestType: message.type,
			queuedAtMs: Date.now(),
			startedAtMs: null,
			firstProgressAtMs: null,
			fileName: message.file.name,
			fileSizeBytes: message.file.size,
			outputName,
			expectedDurationSec: toExpectedDurationSec(message),
		};
		activeForegroundJobRef.current = entry;
		emitTelemetry('worker_job_queued', {
			jobId: entry.id,
			requestType: entry.requestType,
			fileName: entry.fileName,
			fileSizeBytes: entry.fileSizeBytes,
			outputName: entry.outputName,
			expectedDurationSec: entry.expectedDurationSec,
		});
	}, []);

	const markForegroundJobStarted = useCallback((workerJob: StartedResponse['job']) => {
		const job = activeForegroundJobRef.current;
		if (!job || job.startedAtMs !== null) return;
		job.startedAtMs = Date.now();
		emitTelemetry('worker_job_started', {
			jobId: job.id,
			requestType: job.requestType,
			workerJob,
			queueDelayMs: job.startedAtMs - job.queuedAtMs,
		});
	}, []);

	const markForegroundJobFirstProgress = useCallback((progress: number) => {
		const job = activeForegroundJobRef.current;
		if (!job || job.firstProgressAtMs !== null) return;
		job.firstProgressAtMs = Date.now();
		emitTelemetry('worker_job_first_progress', {
			jobId: job.id,
			requestType: job.requestType,
			progress,
			startToFirstProgressMs: job.startedAtMs ? job.firstProgressAtMs - job.startedAtMs : null,
			queueToFirstProgressMs: job.firstProgressAtMs - job.queuedAtMs,
		});
	}, []);

	const finishForegroundJobTelemetry = useCallback(
		(
			status: 'success' | 'error' | 'cancelled',
			extra: { outputBytes?: number; frameCount?: number; error?: string } = {},
		) => {
			const job = activeForegroundJobRef.current;
			if (!job) return;
			const finishedAtMs = Date.now();
			emitTelemetry(`worker_job_${status}`, {
				jobId: job.id,
				requestType: job.requestType,
				status,
				fileName: job.fileName,
				fileSizeBytes: job.fileSizeBytes,
				outputName: job.outputName,
				expectedDurationSec: job.expectedDurationSec,
				queueDelayMs: job.startedAtMs ? job.startedAtMs - job.queuedAtMs : null,
				runDurationMs: job.startedAtMs ? finishedAtMs - job.startedAtMs : null,
				totalDurationMs: finishedAtMs - job.queuedAtMs,
				firstProgressDelayMs: job.firstProgressAtMs ? job.firstProgressAtMs - job.queuedAtMs : null,
				outputBytes: extra.outputBytes ?? null,
				frameCount: extra.frameCount ?? null,
				error: extra.error ?? null,
			});
			activeForegroundJobRef.current = null;
		},
		[],
	);

	const clearForegroundRequest = useCallback(() => {
		resolveRef.current = null;
		rejectRef.current = null;
		exportExpectedDurationRef.current = 0;
		activeForegroundJobRef.current = null;
	}, []);

	const rejectForegroundRequest = useCallback(
		(err: Error) => {
			rejectRef.current?.(err);
			clearForegroundRequest();
		},
		[clearForegroundRequest],
	);

	const clearBackgroundRequests = useCallback(() => {
		setProbeStatus(null);
		probeResolveRef.current = null;
		probeRejectRef.current = null;
		probeCacheKeyRef.current = null;
		probeFontsResolveRef.current = null;
		probeDetailsResolveRef.current = null;
		probeDetailsRejectRef.current = null;
		probeDetailsCacheKeyRef.current = null;
		subtitlePendingRef.current = null;
		fontsPendingRef.current = null;
	}, []);

	const rejectBackgroundRequests = useCallback((err: Error) => {
		setProbeStatus(null);
		probeRejectRef.current?.(err);
		probeResolveRef.current = null;
		probeRejectRef.current = null;
		probeCacheKeyRef.current = null;
		probeFontsResolveRef.current = null;
		probeDetailsRejectRef.current?.(err);
		probeDetailsResolveRef.current = null;
		probeDetailsRejectRef.current = null;
		probeDetailsCacheKeyRef.current = null;
		subtitlePendingRef.current?.reject(err);
		subtitlePendingRef.current = null;
		fontsPendingRef.current?.reject(err);
		fontsPendingRef.current = null;
	}, []);

	const finalizeActiveCommand = useCallback(() => {
		activeCommandRef.current = null;
	}, []);

	const dispatchNextQueuedCommand = useCallback(() => {
		const worker = workerRef.current;
		if (!worker || activeCommandRef.current) return;

		queueRef.current.sort((a, b) => {
			if (a.priority !== b.priority) return b.priority - a.priority;
			return a.sequence - b.sequence;
		});

		while (queueRef.current.length > 0) {
			const next = queueRef.current.shift();
			if (!next) return;
			if (next.token.cancelled) {
				next.reject(new Error(next.token.reason ?? 'Cancelled'));
				continue;
			}
			activeCommandRef.current = next;
			next.dispatch(worker, next.jobId);
			return;
		}
	}, []);

	const cancelQueuedCommands = useCallback((predicate: (cmd: ScheduledCommand) => boolean, reason: string) => {
		const kept: ScheduledCommand[] = [];
		for (const command of queueRef.current) {
			if (!predicate(command)) {
				kept.push(command);
				continue;
			}
			command.token.cancelled = true;
			command.token.reason = reason;
			command.reject(new Error(reason));
		}
		queueRef.current = kept;
	}, []);

	const abortActiveCommandIf = useCallback((predicate: (cmd: ScheduledCommand) => boolean, reason: string) => {
		const active = activeCommandRef.current;
		if (!active || !predicate(active) || active.token.cancelled) return;
		active.token.cancelled = true;
		active.token.reason = reason;
		workerRef.current?.postMessage({ type: 'ABORT', jobId: active.jobId, reason } satisfies AbortRequest);
	}, []);

	const enqueueCommand = useCallback(
		(
			message: WorkerRequest,
			options: {
				priority: number;
				kind: 'foreground' | 'background';
				dispatch: (worker: Worker, jobId: number) => void;
				reject: (err: Error) => void;
			},
		): { jobId: number; token: CancellationToken } => {
			const token: CancellationToken = { cancelled: false, reason: null };
			const command: ScheduledCommand = {
				jobId: nextWorkerJobIdRef.current++,
				sequence: nextQueueSequenceRef.current++,
				message,
				priority: options.priority,
				kind: options.kind,
				token,
				dispatch: options.dispatch,
				reject: options.reject,
			};
			queueRef.current.push(command);

			const active = activeCommandRef.current;
			if (active && command.priority > active.priority && active.kind === 'background') {
				abortActiveCommandIf((candidate) => candidate.jobId === active.jobId, 'Superseded by export operation');
			}

			dispatchNextQueuedCommand();
			return { jobId: command.jobId, token };
		},
		[abortActiveCommandIf, dispatchNextQueuedCommand],
	);

	const attachWorker = useCallback(
		(worker: Worker) => {
			workerRef.current = worker;
			worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
				const msg = e.data;
				const active = activeCommandRef.current;
				const isActiveMessage = Boolean(active && (msg.jobId == null || msg.jobId === active.jobId));

				switch (msg.type) {
					case 'READY':
						setState((s) => ({ ...s, ready: true }));
						dispatchNextQueuedCommand();
						break;
					case 'STARTED':
						if (!isActiveMessage) break;
						setState((s) => ({ ...s, started: true }));
						markForegroundJobStarted(msg.job);
						break;

					case 'PROGRESS':
						if (!isActiveMessage) break;
						if (msg.progress > 0) {
							markForegroundJobFirstProgress(msg.progress);
						}
						// Keep UI smooth under heavy worker log/progress throughput.
						if (msg.progress < 1) {
							const now = performance.now();
							if (now - lastProgressEmitRef.current < 80) break;
							lastProgressEmitRef.current = now;
						}
						setState((s) => {
							const rawFfmpegProgress =
								Number.isFinite(msg.progress) && msg.progress > 0
									? Math.min(0.999, msg.progress)
									: null;
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
						if (!isActiveMessage) break;
						setState((s) => ({ ...s, processing: false, started: false, progress: 1 }));
						finishForegroundJobTelemetry('success', { outputBytes: msg.data.byteLength });
						resolveRef.current?.(msg.data);
						clearForegroundRequest();
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;

					case 'PROBE_RESULT':
						if (!isActiveMessage) break;
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
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;
					case 'PROBE_STATUS':
						if (!isActiveMessage) break;
						setProbeStatus(msg.status);
						break;
					case 'PROBE_DETAILS_RESULT':
						if (!isActiveMessage) break;
						if (probeDetailsCacheKeyRef.current) {
							useVideoMetadataStore
								.getState()
								.upsertMetadata(probeDetailsCacheKeyRef.current, { probeDetails: msg.result });
						}
						probeDetailsCacheKeyRef.current = null;
						probeDetailsResolveRef.current?.(msg.result);
						probeDetailsResolveRef.current = null;
						probeDetailsRejectRef.current = null;
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;

					case 'SUBTITLE_PREVIEW_RESULT':
						if (!isActiveMessage) break;
						if (subtitlePendingRef.current?.requestId !== msg.requestId) break;
						subtitlePendingRef.current.resolve({ format: msg.format, content: msg.content });
						subtitlePendingRef.current = null;
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;
					case 'FONTS_RESULT':
						if (!isActiveMessage) break;
						fontsPendingRef.current?.resolve(msg.fonts);
						fontsPendingRef.current = null;
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;

					case 'FRAMES_EXTRACTED':
						if (!isActiveMessage) break;
						setState((s) => ({ ...s, processing: false, progress: 1 }));
						finishForegroundJobTelemetry('success', { frameCount: msg.totalFrames });
						framesResolveRef.current?.(msg.frames);
						framesResolveRef.current = null;
						framesRejectRef.current = null;
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;

					case 'ERROR':
						if (!isActiveMessage) break;
						console.error('[hook] worker ERROR:', msg.error);
						const wasCancelled = active?.token.cancelled ?? false;
						setState((s) => ({
							...s,
							processing: false,
							started: false,
							error: wasCancelled ? null : msg.error,
						}));
						finishForegroundJobTelemetry(wasCancelled ? 'cancelled' : 'error', {
							error: wasCancelled ? undefined : msg.error,
						});
						const err = new Error(msg.error);
						rejectForegroundRequest(err);
						rejectBackgroundRequests(err);
						framesRejectRef.current?.(err);
						framesRejectRef.current = null;
						framesResolveRef.current = null;
						finalizeActiveCommand();
						dispatchNextQueuedCommand();
						break;

					case 'LOG':
						{
							const perfPayload = parseWorkerPerfLog(msg.message);
							if (perfPayload) {
								emitTelemetry('worker_perf', perfPayload);
							}
						}
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
				if (activeCommandRef.current?.kind === 'foreground') {
					finishForegroundJobTelemetry('error', { error: err.message });
				}
				setState((s) => ({ ...s, ready: false, processing: false, started: false, error: err.message }));
				rejectForegroundRequest(err);
				rejectBackgroundRequests(err);
				framesRejectRef.current?.(err);
				framesRejectRef.current = null;
				framesResolveRef.current = null;

				const active = activeCommandRef.current;
				if (active) {
					active.reject(err);
					activeCommandRef.current = null;
				}
				for (const queued of queueRef.current) {
					queued.reject(err);
				}
				queueRef.current = [];

				worker.terminate();
				const next = createWorker();
				attachWorker(next);
			};
		},
		[
			clearForegroundRequest,
			dispatchNextQueuedCommand,
			finalizeActiveCommand,
			finishForegroundJobTelemetry,
			markForegroundJobFirstProgress,
			markForegroundJobStarted,
			rejectBackgroundRequests,
			rejectForegroundRequest,
		],
	);

	useEffect(() => {
		const worker = createWorker();
		attachWorker(worker);

		return () => {
			const disposeErr = new Error('Video processor disposed');
			const active = activeCommandRef.current;
			if (active) {
				active.reject(disposeErr);
				activeCommandRef.current = null;
			}
			for (const queued of queueRef.current) {
				queued.reject(disposeErr);
			}
			queueRef.current = [];
			clearForegroundRequest();
			clearBackgroundRequests();
			worker.terminate();
			workerRef.current = null;
		};
	}, [attachWorker, clearBackgroundRequests, clearForegroundRequest]);

	const cancel = useCallback(() => {
		const err = new Error('Cancelled');
		cancelQueuedCommands((command) => isForegroundRequest(command.message), err.message);
		abortActiveCommandIf((command) => isForegroundRequest(command.message), err.message);
		rejectForegroundRequest(err);
		framesRejectRef.current?.(err);
		framesRejectRef.current = null;
		framesResolveRef.current = null;
		setState((s) => ({
			...s,
			processing: false,
			started: false,
			progress: 0,
			exportStats: INITIAL_STATS,
			error: null,
		}));
	}, [abortActiveCommandIf, cancelQueuedCommands, rejectForegroundRequest]);

	const sendCommand = useCallback(
		async (message: WorkerRequest): Promise<Uint8Array> => {
			return new Promise<Uint8Array>((resolve, reject) => {
				const supersedeReason = 'Superseded by export operation';
				cancelQueuedCommands((command) => command.kind === 'background', supersedeReason);
				abortActiveCommandIf((command) => command.kind === 'background', supersedeReason);
				rejectBackgroundRequests(new Error(supersedeReason));

				enqueueCommand(message, {
					priority: 100,
					kind: 'foreground',
					reject,
					dispatch: (worker, jobId) => {
						const request = { ...message, jobId };
						exportStartRef.current = Date.now();
						lastProgressEmitRef.current = 0;
						exportExpectedDurationRef.current =
							request.type === 'TRANSCODE' && typeof request.expectedDurationSec === 'number'
								? Math.max(0, request.expectedDurationSec)
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
						beginForegroundJobTelemetry(request);
						worker.postMessage(request);
					},
				});
			});
		},
		[
			abortActiveCommandIf,
			beginForegroundJobTelemetry,
			cancelQueuedCommands,
			enqueueCommand,
			rejectBackgroundRequests,
		],
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
				loopCount: opts.loopCount,
				compressionSpeed: opts.compressionSpeed,
				frameDelaysCs: opts.frameDelaysCs,
				cropX: opts.cropX,
				cropY: opts.cropY,
				cropW: opts.cropW,
				cropH: opts.cropH,
				rotation: opts.rotation,
				flipH: opts.flipH,
				flipV: opts.flipV,
				filterExposure: opts.filterExposure,
				filterBrightness: opts.filterBrightness,
				filterContrast: opts.filterContrast,
				filterSaturation: opts.filterSaturation,
				filterHue: opts.filterHue,
				filterSepia: opts.filterSepia,
				filterBlur: opts.filterBlur,
				filterHighlights: opts.filterHighlights,
				filterShadows: opts.filterShadows,
				filterTemperature: opts.filterTemperature,
				filterTint: opts.filterTint,
				filterVignette: opts.filterVignette,
				filterGrain: opts.filterGrain,
				textOverlays: opts.textOverlays,
				imageOverlayBlob: opts.imageOverlayBlob,
				imageOverlayX: opts.imageOverlayX,
				imageOverlayY: opts.imageOverlayY,
				imageOverlayWidth: opts.imageOverlayWidth,
				imageOverlayHeight: opts.imageOverlayHeight,
				imageOverlayOpacity: opts.imageOverlayOpacity,
				fadeInFrames: opts.fadeInFrames,
				fadeOutFrames: opts.fadeOutFrames,
				fadeColor: opts.fadeColor,
				aspectRatio: opts.aspectRatio,
				aspectPaddingColor: opts.aspectPaddingColor,
			});
		},
		[sendCommand],
	);

	const extractGifFrames = useCallback(
		async (
			opts: ExtractFramesOptions,
		): Promise<Array<{ index: number; blob: Blob; width: number; height: number; timeMs: number }>> => {
			return new Promise((resolve, reject) => {
				const request: ExtractGifFramesRequest = {
					type: 'EXTRACT_GIF_FRAMES',
					file: opts.file,
					fps: opts.fps ?? 15,
					width: opts.width ?? 480,
					height: opts.height,
					startTime: opts.startTime,
					duration: opts.duration,
					speed: opts.speed,
					reverse: opts.reverse,
					thumbWidth: opts.thumbWidth,
				};
				const supersedeReason = 'Superseded by export operation';
				cancelQueuedCommands((command) => command.kind === 'background', supersedeReason);
				abortActiveCommandIf((command) => command.kind === 'background', supersedeReason);
				rejectBackgroundRequests(new Error(supersedeReason));
				enqueueCommand(request, {
					priority: 95,
					kind: 'foreground',
					reject,
					dispatch: (worker, jobId) => {
						const withJobId: ExtractGifFramesRequest = { ...request, jobId };
						framesResolveRef.current = resolve;
						framesRejectRef.current = reject;
						setState((s) => ({ ...s, processing: true, progress: 0, error: null }));
						beginForegroundJobTelemetry(withJobId);
						worker.postMessage(withJobId);
					},
				});
			});
		},
		[
			abortActiveCommandIf,
			beginForegroundJobTelemetry,
			cancelQueuedCommands,
			enqueueCommand,
			rejectBackgroundRequests,
		],
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
				const key = cacheKeyForFile(file);
				const cached = useVideoMetadataStore.getState().getMetadata(key);
				if (cached?.probe) {
					setProbeStatus(null);
					resolve(cached.probe);
					return;
				}
				setProbeStatus('Reading container header...');
				const supersedeReason = 'Superseded by newer probe request';
				probeRejectRef.current?.(new Error(supersedeReason));
				cancelQueuedCommands((command) => command.message.type === 'PROBE', supersedeReason);
				abortActiveCommandIf((command) => command.message.type === 'PROBE', supersedeReason);
				enqueueCommand(
					{ type: 'PROBE', file },
					{
						priority: 20,
						kind: 'background',
						reject,
						dispatch: (worker, jobId) => {
							probeResolveRef.current = resolve;
							probeRejectRef.current = reject;
							probeCacheKeyRef.current = key;
							probeFontsResolveRef.current = onFonts ?? null;
							worker.postMessage({ type: 'PROBE', file, jobId } satisfies ProbeRequest);
						},
					},
				);
			});
		},
		[abortActiveCommandIf, cancelQueuedCommands, enqueueCommand],
	);

	const probeDetails = useCallback(
		async (file: File): Promise<DetailedProbeResultData> => {
			return new Promise<DetailedProbeResultData>((resolve, reject) => {
				const key = cacheKeyForFile(file);
				const cached = useVideoMetadataStore.getState().getMetadata(key);
				if (cached?.probeDetails) {
					resolve(cached.probeDetails);
					return;
				}
				const supersedeReason = 'Superseded by newer detailed probe request';
				probeDetailsRejectRef.current?.(new Error(supersedeReason));
				cancelQueuedCommands((command) => command.message.type === 'PROBE_DETAILS', supersedeReason);
				abortActiveCommandIf((command) => command.message.type === 'PROBE_DETAILS', supersedeReason);
				enqueueCommand(
					{ type: 'PROBE_DETAILS', file },
					{
						priority: 18,
						kind: 'background',
						reject,
						dispatch: (worker, jobId) => {
							probeDetailsResolveRef.current = resolve;
							probeDetailsRejectRef.current = reject;
							probeDetailsCacheKeyRef.current = key;
							worker.postMessage({ type: 'PROBE_DETAILS', file, jobId } satisfies ProbeDetailsRequest);
						},
					},
				);
			});
		},
		[abortActiveCommandIf, cancelQueuedCommands, enqueueCommand],
	);

	const extractSubtitlePreview = useCallback(
		async (file: File, streamIndex: number, subtitleCodec?: string): Promise<SubtitlePreviewData> => {
			return new Promise<SubtitlePreviewData>((resolve, reject) => {
				const requestId = ++subtitleRequestIdRef.current;
				const supersedeReason = 'Superseded by newer subtitle preview request';
				subtitlePendingRef.current?.reject(new Error(supersedeReason));
				cancelQueuedCommands((command) => command.message.type === 'SUBTITLE_PREVIEW', supersedeReason);
				abortActiveCommandIf((command) => command.message.type === 'SUBTITLE_PREVIEW', supersedeReason);
				enqueueCommand(
					{ type: 'SUBTITLE_PREVIEW', requestId, file, streamIndex, subtitleCodec },
					{
						priority: 16,
						kind: 'background',
						reject,
						dispatch: (worker, jobId) => {
							subtitlePendingRef.current = { requestId, resolve, reject };
							worker.postMessage({
								type: 'SUBTITLE_PREVIEW',
								requestId,
								file,
								streamIndex,
								subtitleCodec,
								jobId,
							} satisfies SubtitlePreviewRequest);
						},
					},
				);
			});
		},
		[abortActiveCommandIf, cancelQueuedCommands, enqueueCommand],
	);

	const extractFonts = useCallback(
		async (file: File, attachments: FontAttachmentInfo[]): Promise<Array<{ name: string; data: Uint8Array }>> => {
			return new Promise((resolve, reject) => {
				const supersedeReason = 'Superseded by newer font extraction request';
				fontsPendingRef.current?.reject(new Error(supersedeReason));
				cancelQueuedCommands((command) => command.message.type === 'EXTRACT_FONTS', supersedeReason);
				abortActiveCommandIf((command) => command.message.type === 'EXTRACT_FONTS', supersedeReason);
				enqueueCommand(
					{ type: 'EXTRACT_FONTS', file, attachments },
					{
						priority: 14,
						kind: 'background',
						reject,
						dispatch: (worker, jobId) => {
							fontsPendingRef.current = { resolve, reject };
							worker.postMessage({
								type: 'EXTRACT_FONTS',
								file,
								attachments,
								jobId,
							} satisfies ExtractFontsRequest);
						},
					},
				);
			});
		},
		[abortActiveCommandIf, cancelQueuedCommands, enqueueCommand],
	);

	return {
		...state,
		transcode,
		createGif,
		extractGifFrames,
		captureFrame,
		probe,
		probeStatus,
		probeDetails,
		extractSubtitlePreview,
		extractFonts,
		cancel,
	};
}
