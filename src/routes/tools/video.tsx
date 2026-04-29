import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Camera, Download, Video, Layers, Palette, Scissors, Scaling, Volume2, Subtitles } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { EditorEmptyState } from '@/components/editor/EditorEmptyState.tsx';
import { EditorLanding } from '@/components/editor/EditorLanding.tsx';
import { EditorQuickActions } from '@/components/editor/EditorQuickActions.tsx';
import { EditorShell } from '@/components/editor/EditorShell.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';
import { CaptureMenu, type CaptureFormat } from '@/components/shared/CaptureMenu.tsx';
import { SharedPresetsPanel, type PresetEntry } from '@/components/shared/PresetsPanel.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Slider } from '@/components/ui/Slider.tsx';
import { Timeline, formatTimecode, formatCompactTime } from '@/components/ui/Timeline.tsx';
import { Toggle } from '@/components/ui/Toggle.tsx';
import { ToolRail, type ToolRailItem } from '@/components/ui/ToolRail.tsx';
import { AdjustPanel } from '@/components/video/AdjustPanel.tsx';
import { ExportResultCard } from '@/components/video/ExportResultCard.tsx';
import { ResizePanel } from '@/components/video/ResizePanel.tsx';
import { VideoPlayer } from '@/components/video/VideoPlayer.tsx';
import { VideoToolbar } from '@/components/video/VideoToolbar.tsx';
import {
	VIDEO_CROSS_LINKS,
	VIDEO_LANDING_FAQS,
	VIDEO_LANDING_FEATURES,
	VIDEO_LANDING_FORMATS,
} from './-video.landing.ts';

const VideoInfoModal = lazy(async () => {
	const m = await import('@/components/video/VideoInfoModal.tsx');
	return { default: m.VideoInfoModal };
});
import {
	VIDEO_CODECS,
	CONTAINERS,
	AUDIO_CODECS,
	AUDIO_BITRATES,
	isValidCombo,
	isValidAudioCombo,
} from '@/config/codecs.ts';
import { videoPresetEntries, VIDEO_ACCEPT } from '@/config/presets.ts';
import { useEditorKeyboardShortcuts } from '@/hooks/useEditorKeyboardShortcuts.ts';
import { useEditorLayoutPrefs } from '@/hooks/useEditorLayoutPrefs.ts';
import { useEditorUnsavedState } from '@/hooks/useEditorUnsavedState.ts';
import { useFrameStepController } from '@/hooks/useFrameStepController.ts';
import { useLongTaskObserver } from '@/hooks/useLongTaskObserver.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useTimelineScrubController } from '@/hooks/useTimelineScrubController.ts';
import { useVideoMetadataLoader, type MetadataLoadStage } from '@/hooks/useVideoMetadataLoader.ts';
import type { SubtitlePreviewData } from '@/hooks/useVideoProcessor.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { applyAdvancedUpdate, codecSupportsQp } from '@/modules/video-editor/advancedSettings.ts';
import { buildExportPlan } from '@/modules/video-editor/export/export-plan.ts';
import { sizeConstrainedExport } from '@/modules/video-editor/export/sizeConstrainedExport.ts';
import { convertPngToFormat, pickEncodeThreads } from '@/modules/video-editor/frameCapture.ts';
import type { AdvancedVideoSettings } from '@/stores/videoEditor.ts';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';
import type { StreamInfo } from '@/stores/videoEditor.ts';
import { setPendingGifTransfer, setPendingImageTransfer } from '@/utils/crossEditorTransfer.ts';
import { buildExportFilename } from '@/utils/exportFilename.ts';
import { formatFileSize, formatNumber, estimateVideoSize } from '@/utils/format.ts';
import { formatChannels, getLanguageName } from '@/utils/languageUtils.ts';
import type { DetailedProbeResultData } from '@/workers/media-worker.ts';

export const Route = createFileRoute('/tools/video')({ component: VideoStudio });

const VIDEO_PRESETS = videoPresetEntries();
const EMPTY_STREAMS: StreamInfo[] = [];

const VIDEO_FILENAME_RE = /\.(mp4|mkv|webm|mov|m4v|avi|mts|m2ts|ts)$/i;

function isVideoFileLike(file: File): boolean {
	return file.type.startsWith('video/') || VIDEO_FILENAME_RE.test(file.name);
}

const VIDEO_PRESET_ENTRIES: PresetEntry[] = VIDEO_PRESETS.map(([key, preset]) => ({
	key,
	name: preset.name,
	subtitle: preset.description,
}));

/** Flat tool list for the video editor ToolRail */
const VIDEO_TOOLS: ToolRailItem<VideoMode>[] = [
	{ id: 'presets', label: 'Presets', icon: Layers },
	{ id: 'trim', label: 'Trim', icon: Scissors },
	{ id: 'resize', label: 'Resize', icon: Scaling },
	{ id: 'adjust', label: 'Adjust', icon: Palette },
	{ id: 'export', label: 'Export', icon: Download },
];

function VideoStudio() {
	const navigate = useNavigate();
	useLongTaskObserver('video-route');
	const { tier, setSidebarOpen } = useEditorLayoutPrefs({ editor: 'video' });
	const {
		ready,
		processing,
		started,
		progress,
		exportStats,
		transcode,
		captureFrame,
		probe,
		probeDetails,
		extractSubtitlePreview,
		cancel,
	} = useVideoProcessor();
	const {
		videoMode,
		setVideoMode,
		hasVideoFilterChanges,
		probeResult,
		setProbeResult,
		tracks,
		setTracks,
		resize,
		setResize,
		trimInputMode,
		setTrimInputMode,
		advancedSettings,
		setAdvancedSettings,
		encoderFilterArgs,
		resizeFilterArgs,
		file,
		videoUrl,
		duration,
		currentTime,
		trimStart,
		trimEnd,
		selectedPreset,
		setSourceFile,
		setDuration,
		setCurrentTime,
		setTrimStart,
		setTrimEnd,
		setSelectedPreset,
	} = useVideoEditorStore(
		useShallow((s) => ({
			videoMode: s.mode,
			setVideoMode: s.setMode,
			hasVideoFilterChanges: s.hasFilterChanges,
			probeResult: s.probeResult,
			setProbeResult: s.setProbeResult,
			tracks: s.tracks,
			setTracks: s.setTracks,
			resize: s.resize,
			setResize: s.setResize,
			trimInputMode: s.trimInputMode,
			setTrimInputMode: s.setTrimInputMode,
			advancedSettings: s.advancedSettings,
			setAdvancedSettings: s.setAdvancedSettings,
			encoderFilterArgs: s.encoderFilterArgs,
			resizeFilterArgs: s.resizeFilterArgs,
			file: s.file,
			videoUrl: s.videoUrl,
			duration: s.duration,
			currentTime: s.currentTime,
			trimStart: s.trimStart,
			trimEnd: s.trimEnd,
			selectedPreset: s.selectedPreset,
			setSourceFile: s.setSourceFile,
			setDuration: s.setDuration,
			setCurrentTime: s.setCurrentTime,
			setTrimStart: s.setTrimStart,
			setTrimEnd: s.setTrimEnd,
			setSelectedPreset: s.setSelectedPreset,
		})),
	);

	const updateAdvanced = useCallback(
		<K extends keyof AdvancedVideoSettings>(key: K, value: AdvancedVideoSettings[K]) => {
			const current = useVideoEditorStore.getState().advancedSettings;
			setAdvancedSettings(applyAdvancedUpdate(current, key, value));
		},
		[setAdvancedSettings],
	);

	const [resultUrl, setResultUrl] = useObjectUrlState();
	const [resultExt, setResultExt] = useState<string | null>(null);
	const [resultBlob, setResultBlob] = useState<Blob | null>(null);
	const [autoDownload, setAutoDownloadState] = useState(() => {
		if (typeof window === 'undefined') return false;
		try {
			return window.localStorage.getItem('vixely.video.autoDownload') === '1';
		} catch {
			return false;
		}
	});
	const setAutoDownload = useCallback((next: boolean) => {
		setAutoDownloadState(next);
		try {
			window.localStorage.setItem('vixely.video.autoDownload', next ? '1' : '0');
		} catch {
			// ignore storage failures
		}
	}, []);
	useEffect(() => {
		if (!resultUrl) setResultBlob(null);
	}, [resultUrl]);
	const [audioExportMode, setAudioExportMode] = useState<'all' | 'single'>('all');
	const [subtitleExportMode, setSubtitleExportMode] = useState<'all' | 'single'>('all');
	const [burnSubtitles, setBurnSubtitles] = useState(false);
	const [usePreBurnedAssSource, setUsePreBurnedAssSource] = useState(false);
	const [preBurnedAssSourceFile, setPreBurnedAssSourceFile] = useState<File | null>(null);
	const [videoNoReencode, setVideoNoReencode] = useState(false);
	const [audioNoReencode, setAudioNoReencode] = useState(true);
	const [streamInfoPending, setStreamInfoPending] = useState(false);
	const [metadataLoadStage, setMetadataLoadStage] = useState<MetadataLoadStage>('idle');
	const [assSubtitleContent, setAssSubtitleContent] = useState<string | null>(null);
	const [detailedProbe, setDetailedProbe] = useState<DetailedProbeResultData | null>(null);
	const [detailedProbePending, setDetailedProbePending] = useState(false);
	const [detailedProbeError, setDetailedProbeError] = useState<string | null>(null);
	const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
	const [compareMode, setCompareMode] = useState(false);
	const [captureFormat, setCaptureFormat] = useState<CaptureFormat>('png');
	const [embeddedFonts, setEmbeddedFonts] = useState<Array<{ name: string; data: Uint8Array }>>([]);
	const [showInfo, setShowInfo] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const trimStartFrameInputId = useId();
	const trimEndFrameInputId = useId();

	const videoRef = useRef<HTMLVideoElement>(null);
	const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const captureButtonRef = useRef<HTMLButtonElement>(null);
	const preBurnedAssInputRef = useRef<HTMLInputElement>(null);
	const progressRef = useRef(0);
	const startedRef = useRef(started);
	const exportStatsRef = useRef(exportStats);
	const subtitleCacheRef = useRef<Map<string, SubtitlePreviewData>>(new Map());

	const isDirty = file !== null;
	useEditorUnsavedState('video', isDirty || processing);

	const videoStreamInfo = useMemo(() => probeResult?.streams.find((s) => s.type === 'video') ?? null, [probeResult]);
	const videoFps = videoStreamInfo?.fps ?? 30;
	const frameDuration = 1 / Math.max(videoFps, 1);

	const audioStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'audio') ?? EMPTY_STREAMS,
		[probeResult],
	);
	const subtitleStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'subtitle') ?? EMPTY_STREAMS,
		[probeResult],
	);

	const minTrimDuration = frameDuration;
	const metadataExportLocked = streamInfoPending;
	const metadataVideoLoading = streamInfoPending || detailedProbePending;

	useEffect(() => {
		progressRef.current = progress;
	}, [progress]);

	useEffect(() => {
		startedRef.current = started;
	}, [started]);

	useEffect(() => {
		exportStatsRef.current = exportStats;
	}, [exportStats]);

	useEffect(() => {
		if (!exportError) return;
		const timer = setTimeout(() => {
			setExportError(null);
		}, 5000);
		return () => {
			clearTimeout(timer);
		};
	}, [exportError]);

	const clampTrimStart = useCallback(
		(value: number) => {
			const safeValue = Number.isFinite(value) ? value : trimStart;
			return Math.max(0, Math.min(safeValue, Math.max(0, trimEnd - minTrimDuration)));
		},
		[minTrimDuration, trimEnd, trimStart],
	);

	const clampTrimEnd = useCallback(
		(value: number) => {
			const safeValue = Number.isFinite(value) ? value : trimEnd;
			return Math.min(duration, Math.max(safeValue, trimStart + minTrimDuration));
		},
		[duration, minTrimDuration, trimEnd, trimStart],
	);

	const handleTimelineTrimStartChange = useCallback(
		(v: number) => {
			setTrimStart(clampTrimStart(v));
		},
		[clampTrimStart],
	);

	const handleTimelineTrimEndChange = useCallback(
		(v: number) => {
			setTrimEnd(clampTrimEnd(v));
		},
		[clampTrimEnd],
	);

	useEffect(() => {
		if (processing || !file) {
			setAssSubtitleContent(null);
			return;
		}
		if (!tracks.subtitleEnabled) {
			setAssSubtitleContent(null);
			return;
		}
		if (metadataLoadStage !== 'ready' && metadataLoadStage !== 'error') return;

		const selectedSubtitleStream = subtitleStreams[tracks.subtitleTrackIndex];
		if (!selectedSubtitleStream) {
			setAssSubtitleContent(null);
			return;
		}

		const cacheKey = `${file.name}:${file.size}:${file.lastModified}:${selectedSubtitleStream.index}`;
		const cached = subtitleCacheRef.current.get(cacheKey);
		if (cached) {
			setAssSubtitleContent(cached.content);
			return;
		}

		let cancelled = false;
		extractSubtitlePreview(file, selectedSubtitleStream.index, selectedSubtitleStream.codec)
			.then((preview) => {
				if (cancelled) return;
				subtitleCacheRef.current.set(cacheKey, preview);
				setAssSubtitleContent(preview.content);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				if (err instanceof Error && err.message.includes('Superseded')) return;
				console.error('[video] Subtitle extraction failed', err);
				setAssSubtitleContent(null);
				toast.error('Subtitle extraction failed', {
					description: err instanceof Error ? err.message : 'Could not extract subtitle data.',
				});
			});

		return () => {
			cancelled = true;
		};
	}, [
		processing,
		file,
		tracks.subtitleEnabled,
		tracks.subtitleTrackIndex,
		subtitleStreams,
		extractSubtitlePreview,
		metadataLoadStage,
	]);

	const loadVideoMetadata = useVideoMetadataLoader({
		probe,
		probeDetails,
		preBurnedAssInputRef,
		subtitleCacheRef,
		setSourceFile,
		setResultUrl,
		setResultExt,
		setStreamInfoPending,
		setMetadataLoadStage,
		setDetailedProbe,
		setDetailedProbePending,
		setDetailedProbeError,
		setSelectedPreset,
		setCaptureMenuOpen,
		setTrimStart,
		setTrimEnd,
		setDuration,
		setCurrentTime,
		setAudioExportMode,
		setSubtitleExportMode,
		setUsePreBurnedAssSource,
		setPreBurnedAssSourceFile,
		setVideoNoReencode,
		setAudioNoReencode,
		setEmbeddedFonts,
		setProbeResult,
		setTracks,
		setResize,
	});

	const handleFile = useCallback(
		(f: File) => {
			if (!isVideoFileLike(f)) {
				toast.error('Invalid file type', { description: 'Choose a video file (MP4, WebM, MOV, etc.)' });
				return;
			}

			loadVideoMetadata(f);
		},
		[loadVideoMetadata],
	);

	const handlePreBurnedAssSourceFile = useCallback((f: File) => {
		if (!isVideoFileLike(f)) {
			toast.error('Invalid file type', {
				description: 'Choose a pre-rendered video file with ASS subtitles already burned in.',
			});
			return;
		}
		setPreBurnedAssSourceFile(f);
		setUsePreBurnedAssSource(true);
		toast.success('Burned subtitle source ready', { description: f.name });
	}, []);

	const handleVideoLoaded = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const dur = video.duration;
		const state = useVideoEditorStore.getState();
		// Fresh file load (loader resets duration to 0): initialize trim window.
		// Remount with persisted state (duration > 0): keep stored trim & restore playback position.
		if (state.duration === 0) {
			setDuration(dur);
			setTrimEnd(dur);
			setTrimStart(0);
			setCurrentTime(0);
			return;
		}
		if (state.duration !== dur) setDuration(dur);
		const target = state.currentTime;
		if (target > 0 && target <= dur && Math.abs(video.currentTime - target) > 0.05) {
			video.currentTime = target;
		}
	}, [setDuration, setTrimEnd, setTrimStart, setCurrentTime]);

	const {
		timelineScrubbing,
		clampToTrim,
		handleSeek,
		handleTimelineScrubStart,
		handleTimelineScrubEnd,
		handleTimeUpdate,
	} = useTimelineScrubController({ videoRef, trimStart, trimEnd, processing, setCurrentTime });

	const togglePlaybackInTrim = useCallback(() => {
		const video = videoRef.current;
		if (!video || processing) return;
		if (video.paused) {
			if (video.currentTime < trimStart || video.currentTime >= trimEnd - frameDuration / 2) {
				video.currentTime = trimStart;
				setCurrentTime(trimStart);
			}
			void video.play().catch(() => {});
		} else {
			video.pause();
		}
	}, [frameDuration, processing, trimStart, trimEnd]);

	const { stepCurrentFrame, startFrameHold, stopFrameHold } = useFrameStepController({
		videoRef,
		processing,
		frameDuration,
		videoFps,
		clampToTrim,
		handleSeek,
	});

	const { isDragging, dropHandlers } = useSingleFileDrop<HTMLDivElement>({
		onFile: handleFile,
		acceptFile: isVideoFileLike,
		onRejectedFile: () => {
			toast.error('Invalid file type', { description: 'Drop a video file (MP4, WebM, MOV, etc.)' });
		},
	});

	useEditorKeyboardShortcuts({ onTogglePlayback: togglePlaybackInTrim });

	const handleExportFrameToImageEditor = useCallback(
		(frameFile: File) => {
			setPendingImageTransfer(frameFile);
			toast.success('Frame ready in Image editor');
			void navigate({ to: '/tools/image' });
		},
		[navigate],
	);

	const handleEditAsGif = useCallback(
		(gifSourceFile: File) => {
			setPendingGifTransfer(gifSourceFile);
			toast.success('Opening in GIF editor…');
			void navigate({ to: '/tools/gif' });
		},
		[navigate],
	);

	const handleCaptureAction = useCallback(
		async (format: 'png' | 'jpeg' | 'webp', action: 'download' | 'image-editor') => {
			setCaptureMenuOpen(false);
			if (!file) return;
			if (processing) {
				console.error('[video] Cannot capture frame during export');
				return;
			}
			toast('Capturing frame...');
			try {
				let blob: Blob | null = null;

				// Prefer the WebGL preview canvas so filters/look are baked in.
				// Falls back to the worker's raw decode if the canvas isn't ready.
				const webglCanvas = captureCanvasRef.current;
				const video = videoRef.current;
				if (
					webglCanvas &&
					webglCanvas.width > 0 &&
					webglCanvas.height > 0 &&
					video &&
					video.readyState >= 2 &&
					!compareMode
				) {
					const out = document.createElement('canvas');
					out.width = webglCanvas.width;
					out.height = webglCanvas.height;
					const ctx = out.getContext('2d', { alpha: format === 'png' || format === 'webp' });
					if (ctx) {
						ctx.drawImage(webglCanvas, 0, 0);
						const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
						blob = await new Promise<Blob | null>((resolve) => {
							out.toBlob(
								(b) => {
									resolve(b);
								},
								mime,
								0.92,
							);
						});
					}
				}

				if (!blob) {
					const pngData = await captureFrame({ file, timestamp: currentTime });
					if (format === 'png') {
						blob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });
					} else {
						blob = await convertPngToFormat(pngData, format);
					}
				}

				const ext = format === 'jpeg' ? 'jpg' : format;
				const ts = formatTimecode(currentTime).replace(/:/g, '.');
				if (action === 'download') {
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `screenshot-${ts}.${ext}`;
					a.click();
					URL.revokeObjectURL(url);
				} else {
					const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
					const frameFile = new File([blob], `screenshot-${ts}.${ext}`, { type: mime });
					handleExportFrameToImageEditor(frameFile);
				}
			} catch {
				toast.error('Failed to capture frame');
			}
		},
		[file, currentTime, captureFrame, handleExportFrameToImageEditor, processing, compareMode],
	);

	const exportStartRef = useRef<number>(0);

	const handleExport = useCallback(async () => {
		if (!file) return;
		if (metadataExportLocked) {
			toast.message('Metadata still loading', {
				description: 'Wait for stream metadata to finish loading before exporting.',
			});
			return;
		}

		if (usePreBurnedAssSource && !preBurnedAssSourceFile) {
			toast.error('Missing burned subtitle source', {
				description: 'Select a pre-burned video file before exporting in ASS fidelity mode.',
			});
			return;
		}

		setResultUrl(null);
		setResultExt(null);
		setResultBlob(null);
		progressRef.current = 0;
		exportStartRef.current = Date.now();
		const {
			sourceFile,
			args,
			outputName,
			ext,
			clipDuration,
			usingPreBurnedSource,
			includeAudio,
			includeSubtitleTracks,
			isCustomExport,
			selectedAudioStream,
			selectedSubtitleStream,
			maxSizeBytes,
			targetVideoBitrateKbps,
			selectedWidth,
			selectedHeight,
			fallbackWidth,
			fallbackHeight,
		} = buildExportPlan({
			file,
			preBurnedAssSourceFile,
			usePreBurnedAssSource,
			selectedPreset,
			advancedSettings,
			videoNoReencode,
			audioNoReencode,
			audioExportMode,
			subtitleExportMode,
			tracks,
			audioStreams,
			subtitleStreams,
			resizeFilterArgs: resizeFilterArgs(),
			encoderFilterArgs: encoderFilterArgs(),
			trimStart,
			trimEnd,
			duration,
			minTrimDuration,
			videoFps,
			videoStreamInfo,
			encodeThreads: String(pickEncodeThreads()),
		});

		let timeoutError: Error | null = null;
		// Large media startup can take a while; avoid cancelling valid startup work too early.
		const timeoutId = setTimeout(() => {
			const noProgress = !Number.isFinite(progressRef.current) || progressRef.current <= 0.001;
			const noFrameActivity = !Number.isFinite(exportStatsRef.current.frame) || exportStatsRef.current.frame <= 0;
			const shouldTimeout = !startedRef.current && noProgress;
			if (shouldTimeout) {
				const elapsedMs = Date.now() - exportStartRef.current;
				const timeoutReason = 'Export did not start after 10 seconds';
				const diagnostics = {
					reason: timeoutReason,
					elapsedMs,
					started: startedRef.current,
					progress: progressRef.current,
					exportStats: exportStatsRef.current,
					file: { name: sourceFile.name, size: sourceFile.size, type: sourceFile.type },
					trim: { start: trimStart, end: trimEnd, clipDuration, duration },
					output: { name: outputName, ext },
					tracks: {
						audioMode: audioExportMode,
						subtitleMode: subtitleExportMode,
						includeAudio,
						includeSubtitleTracks,
						usingPreBurnedSource,
						selectedAudioStreamIndex: selectedAudioStream?.index ?? null,
						selectedSubtitleStreamIndex: selectedSubtitleStream?.index ?? null,
					},
					codecMode: { isCustomExportMode: isCustomExport, videoNoReencode, audioNoReencode, selectedPreset },
					command: { expectedDurationSec: clipDuration, args, outputName },
				};
				timeoutError = new Error(timeoutReason);
				console.error('[video] Export timeout diagnostics', diagnostics);
				console.error('[video] Export timeout diagnostics JSON', JSON.stringify(diagnostics, null, 2));
				console.error('[video] Export timeout error', timeoutError);
				cancel();
				setExportError('Export timed out. Please try again.');
				return;
			}

			if (startedRef.current && noProgress && noFrameActivity) {
				console.warn(
					'[video] Export started but first frame/progress is delayed (not auto-cancelled)',
					JSON.stringify(
						{
							elapsedMs: Date.now() - exportStartRef.current,
							progress: progressRef.current,
							exportStats: exportStatsRef.current,
						},
						null,
						2,
					),
				);
			}
		}, 10_000);

		try {
			let resultData: Uint8Array;
			const hasSizeConstraint = maxSizeBytes != null && targetVideoBitrateKbps != null && !videoNoReencode;

			if (hasSizeConstraint) {
				const exportResult = await sizeConstrainedExport({
					transcode: async (retryArgs) =>
						transcode({ file: sourceFile, args: retryArgs, outputName, expectedDurationSec: clipDuration }),
					baseArgs: args,
					maxSizeBytes,
					targetVideoBitrateKbps,
					currentResolution:
						selectedWidth && selectedHeight ? { width: selectedWidth, height: selectedHeight } : null,
					fallbackResolution:
						fallbackWidth && fallbackHeight ? { width: fallbackWidth, height: fallbackHeight } : null,
					onAttempt: (attempt, bitrateKbps, resolution) => {
						if (attempt > 1) {
							const desc = resolution
								? `Bitrate: ${bitrateKbps} kbps, resolution: ${resolution.width}×${resolution.height}`
								: `Bitrate: ${bitrateKbps} kbps`;
							toast.info(`Re-encoding (attempt ${attempt}/3)`, { description: desc });
						}
					},
				});
				resultData = exportResult.data;
				if (!exportResult.withinLimit) {
					const actualMB = (exportResult.finalSizeBytes / (1024 * 1024)).toFixed(1);
					const limitMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
					toast.warning('File slightly over size limit', {
						description: `${actualMB}MB vs ${limitMB}MB limit after ${exportResult.attempts} attempts`,
					});
				}
			} else {
				const subtitleBurnIn =
					burnSubtitles && assSubtitleContent && tracks.subtitleEnabled
						? { content: assSubtitleContent, trimOffsetSec: trimStart ?? 0 }
						: undefined;
				resultData = await transcode({
					file: sourceFile,
					args,
					outputName,
					expectedDurationSec: clipDuration,
					subtitleBurnIn,
				});
			}

			clearTimeout(timeoutId);
			const blob = new Blob([new Uint8Array(resultData)], { type: `video/${ext}` });
			const url = URL.createObjectURL(blob);
			const downloadName = buildExportFilename(sourceFile.name, ext);
			setResultUrl(url);
			setResultExt(ext);
			setResultBlob(blob);
			toast.success('Export complete', { description: downloadName });

			if (autoDownload) {
				const a = document.createElement('a');
				a.href = url;
				a.download = downloadName;
				a.click();
			}
		} catch (err) {
			clearTimeout(timeoutId);
			if (timeoutError) return;
			const error = err instanceof Error ? err : new Error(String(err));
			console.error('[video] Export failed', {
				message: error.message,
				trim: { start: trimStart, end: trimEnd, clipDuration, duration },
				progress: progressRef.current,
				exportStats: exportStatsRef.current,
				args,
				outputName,
			});
			if (error.message && error.message !== 'Cancelled') {
				setExportError('Export failed. Try different settings.');
			}
		}
	}, [
		file,
		metadataExportLocked,
		trimStart,
		trimEnd,
		duration,
		selectedPreset,
		advancedSettings,
		probeResult,
		tracks,
		audioStreams,
		subtitleStreams,
		audioExportMode,
		subtitleExportMode,
		usePreBurnedAssSource,
		preBurnedAssSourceFile,
		videoNoReencode,
		audioNoReencode,
		transcode,
		cancel,
		resizeFilterArgs,
		encoderFilterArgs,
		minTrimDuration,
		videoStreamInfo,
		videoFps,
		autoDownload,
	]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		if (resultExt) {
			const a = document.createElement('a');
			a.href = resultUrl;
			a.download = buildExportFilename(file?.name, resultExt);
			a.click();
			return;
		}
		let ext = 'mp4';
		if (selectedPreset == null) {
			ext = advancedSettings.container;
		} else if (selectedPreset) {
			const presetEntry = VIDEO_PRESETS.find(([key]) => key === selectedPreset);
			ext = presetEntry?.[1]?.format ?? 'mp4';
		}
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = buildExportFilename(file?.name, ext);
		a.click();
	}, [resultUrl, resultExt, file, selectedPreset, advancedSettings]);

	/* ── Frame helpers ── */
	const timeToFrames = useCallback((t: number) => Math.round(t * videoFps), [videoFps]);
	const framesToTime = useCallback((f: number) => f / videoFps, [videoFps]);
	const totalFrames = Math.max(1, timeToFrames(duration));
	const showMinuteFields = duration >= 60;
	const showHourFields = duration >= 3600;

	const getTimeParts = useCallback(
		(totalSeconds: number) => {
			const clamped = Math.max(0, Math.min(duration, totalSeconds));
			const hours = Math.floor(clamped / 3600);
			const minutes = Math.floor((clamped % 3600) / 60);
			const seconds = Number((clamped % 60).toFixed(2));
			return { hours, minutes, seconds };
		},
		[duration],
	);

	const setTrimBoundaryFromTimeParts = useCallback(
		(boundary: 'start' | 'end', part: 'hours' | 'minutes' | 'seconds', value: number) => {
			const source = boundary === 'start' ? trimStart : trimEnd;
			const base = getTimeParts(source);
			const safeValue = Number.isFinite(value) ? value : 0;
			const next = { ...base, [part]: Math.max(0, safeValue) };
			if (showHourFields || showMinuteFields) next.minutes = Math.min(59, Math.max(0, next.minutes));

			const total =
				next.seconds +
				(showHourFields || showMinuteFields ? next.minutes * 60 : 0) +
				(showHourFields ? next.hours * 3600 : 0);

			if (boundary === 'start') {
				setTrimStart(clampTrimStart(total));
				return;
			}
			setTrimEnd(clampTrimEnd(total));
		},
		[trimStart, trimEnd, showHourFields, showMinuteFields, getTimeParts, clampTrimStart, clampTrimEnd],
	);

	const setTrimBoundaryByFrame = useCallback(
		(boundary: 'start' | 'end', frame: number, preview = false) => {
			if (boundary === 'start') {
				const nextFrame = Math.max(0, Math.min(frame, timeToFrames(trimEnd) - 1));
				const nextTime = framesToTime(nextFrame);
				setTrimStart(nextTime);
				if (preview) handleSeek(nextTime);
				return;
			}
			const nextFrame = Math.min(totalFrames, Math.max(frame, timeToFrames(trimStart) + 1));
			const nextTime = framesToTime(nextFrame);
			setTrimEnd(nextTime);
			if (preview) handleSeek(nextTime);
		},
		[framesToTime, handleSeek, timeToFrames, totalFrames, trimEnd, trimStart],
	);

	const adjustTrimBoundaryFrames = useCallback(
		(boundary: 'start' | 'end', deltaFrames: number) => {
			const baseFrame = boundary === 'start' ? timeToFrames(trimStart) : timeToFrames(trimEnd);
			setTrimBoundaryByFrame(boundary, baseFrame + deltaFrames, true);
		},
		[setTrimBoundaryByFrame, timeToFrames, trimStart, trimEnd],
	);

	/* ── Sidebar content ── */
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const isCustomExportMode = selectedPreset == null;
	const presetLabel = selectedPreset
		? (VIDEO_PRESETS.find(([key]) => key === selectedPreset)?.[1]?.name ?? null)
		: null;
	const hasTrimAdjustments = trimStart > 0 || trimEnd < duration;
	const hasResizeAdjustments = resize.width !== resize.originalWidth || resize.height !== resize.originalHeight;
	const hasColorAdjustments = hasVideoFilterChanges();
	const usingPreBurnedAssSource = usePreBurnedAssSource && preBurnedAssSourceFile != null;
	const isMobile = tier === 'mobile';
	const isTablet = tier === 'tablet';

	const videoToolItems: ToolRailItem<VideoMode>[] = useMemo(
		() =>
			VIDEO_TOOLS.map((tool) => ({
				...tool,
				hasActivity:
					(tool.id === 'presets' && selectedPreset != null) ||
					(tool.id === 'trim' && hasTrimAdjustments) ||
					(tool.id === 'resize' && hasResizeAdjustments) ||
					(tool.id === 'adjust' && hasColorAdjustments),
			})),
		[selectedPreset, hasTrimAdjustments, hasResizeAdjustments, hasColorAdjustments],
	);

	const handleToolChange = useCallback(
		(toolId: VideoMode) => {
			setVideoMode(toolId);
			if (isMobile) setSidebarOpen(true);
		},
		[setVideoMode, isMobile, setSidebarOpen],
	);

	const handleToolToggle = useCallback(
		(toolId: VideoMode) => {
			if (videoMode === toolId) {
				if (isMobile) setSidebarOpen(false);
			} else {
				setVideoMode(toolId);
				if (isMobile) setSidebarOpen(true);
			}
		},
		[videoMode, setVideoMode, isMobile, setSidebarOpen],
	);

	const videoToolRail = (
		<ToolRail
			items={videoToolItems}
			activeId={videoMode}
			onChange={isTablet || isMobile ? handleToolToggle : handleToolChange}
			direction={isTablet ? 'vertical' : 'horizontal'}
			ariaLabel="Video editor tools"
		/>
	);

	const sidebarContent = (
		<>
			{/* Panel Content */}
			<div
				className="p-3 flex flex-col gap-4 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden animate-panel-crossfade"
				key={videoMode}
			>
				{/* ── Presets Tab ── */}
				{videoMode === 'presets' && (
					<SharedPresetsPanel
						presets={VIDEO_PRESET_ENTRIES}
						selectedPreset={selectedPreset}
						onSelectPreset={setSelectedPreset}
						emptyLabel="Pick a preset optimized for your target platform, then export."
						fallbackIconLetter="V"
					/>
				)}

				{/* ── Trim Tab ── */}
				{videoMode === 'trim' && (
					<>
						<div className="flex items-center justify-between">
							<h3 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
								Trim Range
							</h3>
							<div className="flex gap-0.5 rounded-md border border-border/60 bg-bg/40 p-0.5">
								<button
									onClick={() => {
										setTrimInputMode('time');
									}}
									className={`cursor-pointer rounded px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
										trimInputMode === 'time'
											? 'bg-accent/15 text-accent'
											: 'text-text-tertiary hover:text-text-secondary'
									}`}
								>
									Time
								</button>
								<button
									onClick={() => {
										setTrimInputMode('frames');
									}}
									className={`cursor-pointer rounded px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
										trimInputMode === 'frames'
											? 'bg-accent/15 text-accent'
											: 'text-text-tertiary hover:text-text-secondary'
									}`}
								>
									Frames
								</button>
							</div>
						</div>

						{trimInputMode === 'time' ? (
							<div className="flex flex-col gap-2">
								<div>
									<label className="text-[13px] text-text-tertiary mb-1 block">Start</label>
									<div className="flex gap-1.5">
										{showHourFields && (
											<input
												type="number"
												min={0}
												step={1}
												title="Hours"
												aria-label="Start hours"
												value={getTimeParts(trimStart).hours}
												onChange={(e) => {
													setTrimBoundaryFromTimeParts(
														'start',
														'hours',
														Number(e.target.value),
													);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										)}
										{showMinuteFields && (
											<input
												type="number"
												min={0}
												max={59}
												step={1}
												title="Minutes"
												aria-label="Start minutes"
												value={getTimeParts(trimStart).minutes}
												onChange={(e) => {
													setTrimBoundaryFromTimeParts(
														'start',
														'minutes',
														Number(e.target.value),
													);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										)}
										<input
											type="number"
											min={0}
											max={59.99}
											step={0.01}
											title="Seconds"
											aria-label="Start seconds"
											value={getTimeParts(trimStart).seconds}
											onChange={(e) => {
												setTrimBoundaryFromTimeParts(
													'start',
													'seconds',
													Number(e.target.value),
												);
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
								</div>
								<div>
									<label className="text-[13px] text-text-tertiary mb-1 block">End</label>
									<div className="flex gap-1.5">
										{showHourFields && (
											<input
												type="number"
												min={0}
												step={1}
												title="Hours"
												aria-label="End hours"
												value={getTimeParts(trimEnd).hours}
												onChange={(e) => {
													setTrimBoundaryFromTimeParts(
														'end',
														'hours',
														Number(e.target.value),
													);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										)}
										{showMinuteFields && (
											<input
												type="number"
												min={0}
												max={59}
												step={1}
												title="Minutes"
												aria-label="End minutes"
												value={getTimeParts(trimEnd).minutes}
												onChange={(e) => {
													setTrimBoundaryFromTimeParts(
														'end',
														'minutes',
														Number(e.target.value),
													);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										)}
										<input
											type="number"
											min={0}
											max={59.99}
											step={0.01}
											title="Seconds"
											aria-label="End seconds"
											value={getTimeParts(trimEnd).seconds}
											onChange={(e) => {
												setTrimBoundaryFromTimeParts('end', 'seconds', Number(e.target.value));
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
								</div>
							</div>
						) : (
							<>
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<div className="flex-1">
											<label
												htmlFor={trimStartFrameInputId}
												className="text-[13px] text-text-tertiary mb-1 block"
											>
												Start (frame)
											</label>
											<input
												id={trimStartFrameInputId}
												type="number"
												min={0}
												max={totalFrames}
												step={1}
												value={timeToFrames(trimStart)}
												onChange={(e) => {
													setTrimBoundaryByFrame('start', Number(e.target.value), false);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										</div>
										<div className="flex gap-1 mt-6">
											<Button
												variant="secondary"
												size="sm"
												className="h-8 px-2 text-[13px]"
												onClick={() => {
													adjustTrimBoundaryFrames('start', -1);
												}}
											>
												-1
											</Button>
											<Button
												variant="secondary"
												size="sm"
												className="h-8 px-2 text-[13px]"
												onClick={() => {
													adjustTrimBoundaryFrames('start', 1);
												}}
											>
												+1
											</Button>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<div className="flex-1">
											<label
												htmlFor={trimEndFrameInputId}
												className="text-[13px] text-text-tertiary mb-1 block"
											>
												End (frame)
											</label>
											<input
												id={trimEndFrameInputId}
												type="number"
												min={0}
												max={totalFrames}
												step={1}
												value={timeToFrames(trimEnd)}
												onChange={(e) => {
													setTrimBoundaryByFrame('end', Number(e.target.value), false);
												}}
												className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
											/>
										</div>
										<div className="flex gap-1 mt-6">
											<Button
												variant="secondary"
												size="sm"
												className="h-8 px-2 text-[13px]"
												onClick={() => {
													adjustTrimBoundaryFrames('end', -1);
												}}
											>
												-1
											</Button>
											<Button
												variant="secondary"
												size="sm"
												className="h-8 px-2 text-[13px]"
												onClick={() => {
													adjustTrimBoundaryFrames('end', 1);
												}}
											>
												+1
											</Button>
										</div>
									</div>
								</div>
							</>
						)}

						<div className="rounded-lg border border-border/60 bg-bg/40">
							<div className="flex items-center justify-between px-3.5 py-2.5">
								<span className="text-[12px] text-text-tertiary">Clip duration</span>
								<span className="font-mono text-[13px] font-semibold text-accent">
									{formatCompactTime(clipDuration)}
								</span>
							</div>
							<div className="h-px bg-border/40" />
							<div className="flex items-center justify-between px-3.5 py-2.5">
								<span className="text-[12px] text-text-tertiary">Total</span>
								<span className="font-mono text-[13px] text-text-secondary">
									{formatCompactTime(duration)}
								</span>
							</div>
							<div className="h-px bg-border/40" />
							<div className="flex items-center justify-between px-3.5 py-2.5">
								<span className="text-[12px] text-text-tertiary">Current</span>
								<span className="font-mono text-[13px] text-text-secondary">
									{formatTimecode(currentTime)}
								</span>
							</div>
							<div className="h-px bg-border/40" />
							<div className="flex items-center justify-between px-3.5 py-2.5">
								<span className="text-[12px] text-text-tertiary">Frame</span>
								<span className="font-mono text-[13px] text-text-secondary">
									{formatNumber(timeToFrames(currentTime))} / {formatNumber(timeToFrames(duration))}
								</span>
							</div>
						</div>
					</>
				)}

				{/* ── Resize Tab ── */}
				{videoMode === 'resize' && <ResizePanel />}

				{/* ── Adjust Tab ── */}
				{videoMode === 'adjust' && <AdjustPanel />}

				{/* ── Export Tab ── */}
				{videoMode === 'export' && (
					<>
						<div>
							<div className="grid grid-cols-2 rounded-lg border border-border/60 bg-bg/40 p-0.5">
								<button
									onClick={() => {
										setVideoMode('presets');
									}}
									disabled={!selectedPreset}
									className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
										!isCustomExportMode
											? 'bg-accent/15 text-accent'
											: 'text-text-tertiary hover:text-text-secondary disabled:opacity-40'
									}`}
								>
									Preset
								</button>
								<button
									onClick={() => {
										setSelectedPreset(null);
									}}
									className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
										isCustomExportMode
											? 'bg-accent/15 text-accent'
											: 'text-text-tertiary hover:text-text-secondary'
									}`}
									title="Switch to custom export controls"
								>
									Custom
								</button>
							</div>
						</div>

						<div className="flex flex-col gap-2.5">
							{/* Video */}
							<div className="rounded-xl border border-border/60 overflow-hidden">
								<div className="flex items-center justify-between px-4 py-3 bg-surface-raised/10 border-b border-border/40">
									<div className="flex items-center gap-2">
										<Video size={14} className="text-text-tertiary" />
										<span className="text-sm font-semibold text-text-secondary">Video</span>
									</div>
									<span
										className={`text-xs font-medium px-2 py-0.5 rounded-md ${
											isCustomExportMode
												? 'text-accent bg-accent/10'
												: 'text-text-tertiary bg-surface-raised/50'
										}`}
									>
										{isCustomExportMode ? 'Custom' : 'Preset'}
									</span>
								</div>
								<div className="p-4 flex flex-col gap-3.5">
									<div>
										<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
											Processing
										</p>
										<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
											<button
												onClick={() => {
													setVideoNoReencode(false);
												}}
												className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
													!videoNoReencode
														? 'bg-accent/15 text-accent'
														: 'text-text-tertiary hover:text-text-secondary'
												}`}
											>
												Re-encode
											</button>
											<button
												onClick={() => {
													setVideoNoReencode(true);
												}}
												className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
													videoNoReencode
														? 'bg-accent/15 text-accent'
														: 'text-text-tertiary hover:text-text-secondary'
												}`}
											>
												Stream copy
											</button>
										</div>
									</div>

									{videoNoReencode ? (
										<div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-bg/30 px-3.5 py-2.5">
											<div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-success shrink-0" />
											<div>
												<p className="text-sm font-medium text-text">
													Original stream preserved
												</p>
												<p className="mt-0.5 text-xs text-text-tertiary">
													No re-encoding unless active filters require it
												</p>
											</div>
										</div>
									) : !isCustomExportMode ? (
										<div className="rounded-lg border border-border/50 bg-bg/30 px-3.5 py-2.5">
											<p className="text-sm font-medium text-text">
												{presetLabel ?? 'Select a preset from the Presets tab'}
											</p>
											<p className="mt-0.5 text-xs text-text-tertiary">
												Video settings managed by the active preset
											</p>
										</div>
									) : (
										<div className="flex flex-col gap-3">
											<div>
												<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
													Codec
												</p>
												<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
													{VIDEO_CODECS.map((codec) => (
														<button
															key={codec.encoderId}
															onClick={() => {
																updateAdvanced('codec', codec.encoderId);
															}}
															className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
																advancedSettings.codec === codec.encoderId
																	? 'bg-accent/15 text-accent'
																	: 'text-text-tertiary hover:text-text-secondary'
															}`}
														>
															{codec.name}
														</button>
													))}
												</div>
											</div>

											<div>
												<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
													Container
												</p>
												<div className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
													{CONTAINERS.map((container) => {
														const valid = isValidCombo(
															advancedSettings.codec,
															container.ext,
														);
														return (
															<button
																key={container.ext}
																onClick={() => {
																	updateAdvanced('container', container.ext);
																}}
																disabled={!valid}
																className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
																	advancedSettings.container === container.ext
																		? 'bg-accent/15 text-accent'
																		: valid
																			? 'text-text-tertiary hover:text-text-secondary'
																			: 'text-text-tertiary/30 cursor-not-allowed'
																}`}
															>
																{container.name}
															</button>
														);
													})}
												</div>
											</div>

											<div>
												<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
													Quality
												</p>
												<div className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5 mb-3">
													<button
														onClick={() => {
															updateAdvanced('rateControl', 'crf');
														}}
														className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
															advancedSettings.rateControl === 'crf'
																? 'bg-accent/15 text-accent'
																: 'text-text-tertiary hover:text-text-secondary'
														}`}
													>
														CRF
													</button>
													<button
														onClick={() => {
															updateAdvanced('rateControl', 'bitrate');
														}}
														className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
															advancedSettings.rateControl === 'bitrate'
																? 'bg-accent/15 text-accent'
																: 'text-text-tertiary hover:text-text-secondary'
														}`}
													>
														Bitrate
													</button>
													<button
														onClick={() => {
															updateAdvanced('rateControl', 'qp');
														}}
														disabled={!codecSupportsQp(advancedSettings.codec)}
														className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
															advancedSettings.rateControl === 'qp'
																? 'bg-accent/15 text-accent'
																: codecSupportsQp(advancedSettings.codec)
																	? 'text-text-tertiary hover:text-text-secondary'
																	: 'text-text-tertiary/30 cursor-not-allowed'
														}`}
													>
														QP
													</button>
												</div>
												{advancedSettings.rateControl === 'crf' && (
													<>
														<Slider
															label="Quality (CRF)"
															displayValue={`${advancedSettings.crf}`}
															min={10}
															max={45}
															step={1}
															value={advancedSettings.crf}
															onChange={(e) => {
																updateAdvanced(
																	'crf',
																	Number((e.target as HTMLInputElement).value),
																);
															}}
														/>
														<div className="mt-1 flex items-center justify-between text-xs text-text-tertiary">
															<span>Higher quality</span>
															<span>Smaller file</span>
														</div>
													</>
												)}
												{advancedSettings.rateControl === 'bitrate' && (
													<>
														<Slider
															label="Target Bitrate"
															displayValue={`${formatNumber(advancedSettings.targetBitrateKbps, 0)} kb/s`}
															min={150}
															max={20000}
															step={50}
															value={advancedSettings.targetBitrateKbps}
															onChange={(e) => {
																updateAdvanced(
																	'targetBitrateKbps',
																	Number((e.target as HTMLInputElement).value),
																);
															}}
														/>
														<div className="mt-1 flex items-center justify-between text-xs text-text-tertiary">
															<span>Smaller file</span>
															<span>Higher quality</span>
														</div>
													</>
												)}
												{advancedSettings.rateControl === 'qp' && (
													<>
														<Slider
															label="Constant QP"
															displayValue={`${advancedSettings.qp}`}
															min={0}
															max={51}
															step={1}
															value={advancedSettings.qp}
															onChange={(e) => {
																updateAdvanced(
																	'qp',
																	Number((e.target as HTMLInputElement).value),
																);
															}}
														/>
														<div className="mt-1 flex items-center justify-between text-xs text-text-tertiary">
															<span>Higher quality</span>
															<span>Smaller file</span>
														</div>
													</>
												)}
											</div>

											{(advancedSettings.codec === 'libx264' ||
												advancedSettings.codec === 'libx265') && (
												<div>
													<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
														Encoding Speed
													</p>
													<div className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
														{(
															[
																'ultrafast',
																'veryfast',
																'fast',
																'medium',
																'slow',
																'veryslow',
															] as const
														).map((preset) => (
															<button
																key={preset}
																onClick={() => {
																	updateAdvanced('preset', preset);
																}}
																className={`rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
																	advancedSettings.preset === preset
																		? 'bg-accent/15 text-accent'
																		: 'text-text-tertiary hover:text-text-secondary'
																}`}
															>
																{preset}
															</button>
														))}
													</div>
													<div className="mt-1.5 flex items-center justify-between text-xs text-text-tertiary">
														<span>Faster encode</span>
														<span>Better compression</span>
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							</div>

							{/* Audio */}
							{audioStreams.length > 0 && (
								<div className="rounded-xl border border-border/60 overflow-hidden">
									<div className="flex items-center justify-between px-4 py-3 bg-surface-raised/10 border-b border-border/40">
										<div className="flex items-center gap-2">
											<Volume2 size={14} className="text-text-tertiary" />
											<span className="text-sm font-semibold text-text-secondary">Audio</span>
										</div>
										<Toggle
											enabled={tracks.audioEnabled}
											onToggle={() => {
												setTracks({ audioEnabled: !tracks.audioEnabled });
											}}
											label={tracks.audioEnabled ? 'Disable audio tracks' : 'Enable audio tracks'}
										/>
									</div>
									{tracks.audioEnabled ? (
										<div className="p-4 flex flex-col gap-3">
											<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
												<button
													onClick={() => {
														setAudioExportMode('all');
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														audioExportMode === 'all'
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													All tracks
												</button>
												<button
													onClick={() => {
														setAudioExportMode('single');
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														audioExportMode === 'single'
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Select track
												</button>
											</div>

											{audioExportMode === 'all' ? (
												<div className="rounded-lg border border-border/50 bg-bg/30 px-3.5 py-2.5 text-sm text-text-tertiary">
													All {audioStreams.length} audio track
													{audioStreams.length === 1 ? '' : 's'} will be included.
												</div>
											) : (
												<div className="flex flex-col gap-1.5">
													{audioStreams.map((stream, index) => {
														const isSelected = tracks.audioTrackIndex === index;
														const lang = getLanguageName(stream.language);
														const title = stream.title?.trim();
														const label = title || lang || `Track ${index + 1}`;
														const details = [
															title && lang ? lang : null,
															stream.codec?.toUpperCase(),
															formatChannels(stream.channels),
														]
															.filter(Boolean)
															.join(' · ');
														return (
															<button
																key={stream.index}
																onClick={() => {
																	setTracks({ audioTrackIndex: index });
																}}
																className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
																	isSelected
																		? 'border-accent/30 bg-accent/8'
																		: 'border-border/50 bg-bg/30 hover:bg-surface-raised/30'
																}`}
															>
																<div className="flex items-center gap-2.5">
																	<div
																		className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
																			isSelected
																				? 'border-accent bg-accent'
																				: 'border-border/70'
																		}`}
																	>
																		{isSelected && (
																			<div className="h-1.5 w-1.5 rounded-full bg-white" />
																		)}
																	</div>
																	<div className="min-w-0 flex-1">
																		<div className="flex items-center gap-1.5">
																			<span className="truncate text-sm font-medium text-text">
																				{label}
																			</span>
																			{stream.isDefault && (
																				<span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent/70">
																					Default
																				</span>
																			)}
																			{stream.isForced && (
																				<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-500/70">
																					Forced
																				</span>
																			)}
																		</div>
																		{details && (
																			<p className="mt-0.5 truncate text-xs text-text-tertiary">
																				{details}
																			</p>
																		)}
																	</div>
																</div>
															</button>
														);
													})}
												</div>
											)}

											<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
												<button
													onClick={() => {
														setAudioNoReencode(false);
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														!audioNoReencode
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Re-encode
												</button>
												<button
													onClick={() => {
														setAudioNoReencode(true);
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														audioNoReencode
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Stream copy
												</button>
											</div>

											{isCustomExportMode && !audioNoReencode && (
												<>
													<div className="h-px bg-border/40" />
													<div className="flex flex-col gap-3">
														<div>
															<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
																Audio Codec
															</p>
															<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
																{AUDIO_CODECS.map((codec) => {
																	const valid = isValidAudioCombo(
																		codec.encoderId,
																		advancedSettings.container,
																	);
																	return (
																		<button
																			key={codec.encoderId}
																			onClick={() => {
																				updateAdvanced(
																					'audioCodec',
																					codec.encoderId,
																				);
																			}}
																			disabled={!valid}
																			className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
																				advancedSettings.audioCodec ===
																				codec.encoderId
																					? 'bg-accent/15 text-accent'
																					: valid
																						? 'text-text-tertiary hover:text-text-secondary'
																						: 'text-text-tertiary/30 cursor-not-allowed'
																			}`}
																		>
																			{codec.name}
																		</button>
																	);
																})}
															</div>
														</div>
														{advancedSettings.audioCodec !== 'none' && (
															<div>
																<p className="text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wide">
																	Audio Bitrate
																</p>
																<div className="grid grid-cols-3 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
																	{AUDIO_BITRATES.map((bitrate) => (
																		<button
																			key={bitrate.value}
																			onClick={() => {
																				updateAdvanced(
																					'audioBitrate',
																					bitrate.value,
																				);
																			}}
																			className={`rounded-md py-1.5 text-sm font-medium transition-colors cursor-pointer ${
																				advancedSettings.audioBitrate ===
																				bitrate.value
																					? 'bg-accent/15 text-accent'
																					: 'text-text-tertiary hover:text-text-secondary'
																			}`}
																		>
																			{bitrate.label}
																		</button>
																	))}
																</div>
															</div>
														)}
													</div>
												</>
											)}
										</div>
									) : (
										<div className="px-4 py-3 text-sm italic text-text-tertiary">
											Audio excluded from export.
										</div>
									)}
								</div>
							)}

							{/* ASS Fidelity */}
							<div className="rounded-xl border border-border/60 overflow-hidden">
								<div className="flex items-center justify-between px-4 py-3 bg-surface-raised/10 border-b border-border/40">
									<div>
										<span className="text-sm font-semibold text-text-secondary block">
											ASS Fidelity
										</span>
										<span className="text-xs text-text-tertiary">
											Pre-burned source for full styling
										</span>
									</div>
									<Toggle
										enabled={usePreBurnedAssSource}
										onToggle={() => {
											setUsePreBurnedAssSource((prev) => !prev);
										}}
										label={
											usePreBurnedAssSource
												? 'Disable ASS fidelity mode'
												: 'Enable ASS fidelity mode'
										}
									/>
								</div>
								{usePreBurnedAssSource ? (
									<div className="p-4 flex flex-col gap-2.5">
										<div className="rounded-lg border border-border/50 bg-bg/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm">
											{preBurnedAssSourceFile ? (
												<>
													<span className="truncate text-text">
														{preBurnedAssSourceFile.name}
													</span>
													<span className="shrink-0 text-xs font-mono text-text-tertiary">
														{formatFileSize(preBurnedAssSourceFile.size)}
													</span>
												</>
											) : (
												<span className="text-text-tertiary">No source file selected</span>
											)}
										</div>
										<div className="grid grid-cols-2 gap-1.5">
											<button
												onClick={() => {
													preBurnedAssInputRef.current?.click();
												}}
												className="rounded-lg border border-border/60 bg-surface-raised/30 px-3 py-2 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
											>
												Choose file
											</button>
											<button
												onClick={() => {
													setPreBurnedAssSourceFile(null);
													setUsePreBurnedAssSource(false);
													if (preBurnedAssInputRef.current)
														preBurnedAssInputRef.current.value = '';
												}}
												disabled={!preBurnedAssSourceFile}
												className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
													preBurnedAssSourceFile
														? 'border-border/60 bg-surface-raised/30 text-text-tertiary hover:text-text-secondary cursor-pointer'
														: 'border-border/40 bg-surface-raised/20 text-text-tertiary/40 cursor-not-allowed'
												}`}
											>
												Clear
											</button>
										</div>
									</div>
								) : (
									<div className="px-4 py-3 text-sm italic text-text-tertiary">
										Normal subtitle track export from source.
									</div>
								)}
							</div>

							{/* Subtitles */}
							{subtitleStreams.length > 0 && (
								<div className="rounded-xl border border-border/60 overflow-hidden">
									<div className="flex items-center justify-between px-4 py-3 bg-surface-raised/10 border-b border-border/40">
										<div className="flex items-center gap-2">
											<Subtitles size={14} className="text-text-tertiary" />
											<span className="text-sm font-semibold text-text-secondary">Subtitles</span>
										</div>
										<Toggle
											enabled={tracks.subtitleEnabled}
											onToggle={() => {
												setTracks({ subtitleEnabled: !tracks.subtitleEnabled });
											}}
											label={
												tracks.subtitleEnabled
													? 'Disable subtitle tracks'
													: 'Enable subtitle tracks'
											}
										/>
									</div>
									{tracks.subtitleEnabled ? (
										<div className="p-4 flex flex-col gap-3">
											{usingPreBurnedAssSource && (
												<div className="rounded-lg border border-accent/20 bg-accent/5 px-3.5 py-2.5 text-sm text-text-tertiary">
													Pre-burned source active — track settings ignored.
												</div>
											)}
											<label
												className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
													burnSubtitles
														? 'border-accent/30 bg-accent/8'
														: 'border-border/50 bg-bg/30'
												}`}
											>
												<div>
													<div className="text-sm font-medium text-text">
														Burn subtitles into video
													</div>
													<div className="text-xs text-text-tertiary">
														Renders the selected track onto every exported frame (SRT /
														WebVTT / ASS).
													</div>
												</div>
												<input
													type="checkbox"
													className="h-4 w-4 accent-accent cursor-pointer"
													checked={burnSubtitles}
													onChange={(e) => {
														setBurnSubtitles(e.target.checked);
													}}
													disabled={!assSubtitleContent}
												/>
											</label>
											<div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/50 bg-bg/40 p-0.5">
												<button
													onClick={() => {
														setSubtitleExportMode('all');
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														subtitleExportMode === 'all'
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													All tracks
												</button>
												<button
													onClick={() => {
														setSubtitleExportMode('single');
													}}
													className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
														subtitleExportMode === 'single'
															? 'bg-accent/15 text-accent'
															: 'text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Select track
												</button>
											</div>

											{subtitleExportMode === 'all' ? (
												<div className="rounded-lg border border-border/50 bg-bg/30 px-3.5 py-2.5 text-sm text-text-tertiary">
													All {subtitleStreams.length} subtitle track
													{subtitleStreams.length === 1 ? '' : 's'} will be included.
												</div>
											) : (
												<div className="flex flex-col gap-1.5">
													{subtitleStreams.map((stream, index) => {
														const isSelected = tracks.subtitleTrackIndex === index;
														const lang = getLanguageName(stream.language);
														const title = stream.title?.trim();
														const label = title || lang || `Track ${index + 1}`;
														const details = [
															title && lang ? lang : null,
															stream.codec?.toUpperCase(),
														]
															.filter(Boolean)
															.join(' · ');
														return (
															<button
																key={stream.index}
																onClick={() => {
																	setTracks({ subtitleTrackIndex: index });
																}}
																className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
																	isSelected
																		? 'border-accent/30 bg-accent/8'
																		: 'border-border/50 bg-bg/30 hover:bg-surface-raised/30'
																}`}
															>
																<div className="flex items-center gap-2.5">
																	<div
																		className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
																			isSelected
																				? 'border-accent bg-accent'
																				: 'border-border/70'
																		}`}
																	>
																		{isSelected && (
																			<div className="h-1.5 w-1.5 rounded-full bg-white" />
																		)}
																	</div>
																	<div className="min-w-0 flex-1">
																		<div className="flex items-center gap-1.5">
																			<span className="truncate text-sm font-medium text-text">
																				{label}
																			</span>
																			{stream.isDefault && (
																				<span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent/70">
																					Default
																				</span>
																			)}
																			{stream.isForced && (
																				<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-500/70">
																					Forced
																				</span>
																			)}
																		</div>
																		{details && (
																			<p className="mt-0.5 truncate text-xs text-text-tertiary">
																				{details}
																			</p>
																		)}
																	</div>
																</div>
															</button>
														);
													})}
												</div>
											)}
										</div>
									) : (
										<div className="px-4 py-3 text-sm italic text-text-tertiary">
											Subtitles excluded from export.
										</div>
									)}
								</div>
							)}

							{/* Summary */}
							<div className="rounded-xl border border-border/60 overflow-hidden">
								<div className="px-4 py-3 bg-surface-raised/10 border-b border-border/40">
									<span className="text-sm font-semibold text-text-secondary">Summary</span>
								</div>
								<div className="px-4">
									<div className="flex items-center justify-between py-2.5 border-b border-border/30">
										<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
											Format
										</span>
										<span className="text-sm font-medium text-text font-mono">
											{isCustomExportMode
												? advancedSettings.container.toUpperCase()
												: selectedPreset
													? (presetLabel ?? selectedPreset)
													: '—'}
										</span>
									</div>
									{isCustomExportMode && !videoNoReencode && (
										<div className="flex items-center justify-between py-2.5 border-b border-border/30">
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Codec
											</span>
											<span className="text-sm font-medium text-text font-mono">
												{VIDEO_CODECS.find((c) => c.encoderId === advancedSettings.codec)
													?.name ?? advancedSettings.codec}
											</span>
										</div>
									)}
									{videoNoReencode && (
										<div className="flex items-center justify-between py-2.5 border-b border-border/30">
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Video
											</span>
											<span className="text-sm font-medium text-success font-mono">
												Stream copy
											</span>
										</div>
									)}
									{videoStreamInfo?.width && videoStreamInfo?.height && (
										<div className="flex items-center justify-between py-2.5 border-b border-border/30">
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Resolution
											</span>
											<span className="text-sm font-medium text-text font-mono">
												{hasResizeAdjustments
													? `${resize.width}×${resize.height}`
													: `${videoStreamInfo.width}×${videoStreamInfo.height}`}
											</span>
										</div>
									)}
									{duration > 0 && (
										<div
											className={`flex items-center justify-between py-2.5 ${audioStreams.length > 0 || subtitleStreams.length > 0 || usePreBurnedAssSource ? 'border-b border-border/30' : ''}`}
										>
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Duration
											</span>
											<span className="text-sm font-medium text-text font-mono tabular-nums">
												{formatCompactTime(
													hasTrimAdjustments ? Math.max(trimEnd - trimStart, 0) : duration,
												)}
											</span>
										</div>
									)}
									{/* Estimated size */}
									{isCustomExportMode &&
										duration > 0 &&
										videoStreamInfo?.width &&
										videoStreamInfo?.height && (
											<div className="flex items-center justify-between py-2.5 border-b border-border/30">
												<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
													Est. Size
												</span>
												<span className="text-[13px] font-medium text-text-secondary font-mono tabular-nums">
													~
													{formatFileSize(
														estimateVideoSize({
															durationSec: hasTrimAdjustments
																? Math.max(trimEnd - trimStart, 0)
																: duration,
															width: hasResizeAdjustments
																? resize.width
																: videoStreamInfo.width,
															height: hasResizeAdjustments
																? resize.height
																: videoStreamInfo.height,
															fps: videoStreamInfo.fps ?? 30,
															codec: advancedSettings.codec,
															rateControl: advancedSettings.rateControl,
															crf: advancedSettings.crf,
															targetBitrateKbps: advancedSettings.targetBitrateKbps,
															audioBitrateKbps:
																parseInt(advancedSettings.audioBitrate) || 128,
															includeAudio: tracks.audioEnabled,
														}),
													)}
												</span>
											</div>
										)}
									{audioStreams.length > 0 && (
										<div
											className={`flex items-center justify-between py-2.5 ${subtitleStreams.length > 0 || usePreBurnedAssSource ? 'border-b border-border/30' : ''}`}
										>
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Audio
											</span>
											<span className="text-sm font-medium text-text font-mono">
												{tracks.audioEnabled
													? audioExportMode === 'all'
														? `${audioStreams.length} track${audioStreams.length === 1 ? '' : 's'}`
														: '1 track'
													: 'None'}
											</span>
										</div>
									)}
									{(subtitleStreams.length > 0 || usePreBurnedAssSource) && (
										<div className="flex items-center justify-between py-2.5">
											<span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
												Subtitles
											</span>
											<span className="text-sm font-medium text-text font-mono">
												{usingPreBurnedAssSource
													? 'Burned in'
													: tracks.subtitleEnabled
														? subtitleExportMode === 'all'
															? `${subtitleStreams.length} track${subtitleStreams.length === 1 ? '' : 's'}`
															: '1 track'
														: 'None'}
											</span>
										</div>
									)}
								</div>
								{(hasTrimAdjustments || hasResizeAdjustments || hasColorAdjustments) && (
									<div className="border-t border-border/30 px-4 py-3 flex flex-wrap gap-1.5">
										{hasTrimAdjustments && (
											<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
												<Scissors size={10} /> Trimmed
											</span>
										)}
										{hasResizeAdjustments && (
											<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
												<Scaling size={10} /> Resized
											</span>
										)}
										{hasColorAdjustments && (
											<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
												<Palette size={10} /> Color adjusted
											</span>
										)}
									</div>
								)}
							</div>

							{resultUrl && resultBlob && (
								<ExportResultCard
									resultUrl={resultUrl}
									resultBlob={resultBlob}
									resultFileName={buildExportFilename(file?.name, resultExt ?? 'mp4')}
									sourceFps={videoFps}
									onDownloadVideo={handleDownload}
									onEditAsGif={handleEditAsGif}
									autoDownload={autoDownload}
									onAutoDownloadChange={setAutoDownload}
								/>
							)}
						</div>
					</>
				)}
			</div>

			{/* Actions */}
			<EditorQuickActions
				status={
					processing ? (
						<div className="rounded-xl border border-border/60 bg-bg/40 p-3 flex flex-col gap-2">
							<div className="flex items-center justify-between text-sm">
								<span className="text-text-secondary font-medium">Exporting...</span>
								<span className="font-mono font-semibold tabular-nums text-accent">
									{(Math.max(0, progress) * 100).toFixed(1)}%
								</span>
							</div>
							<div className="h-1 rounded-full bg-border/60 overflow-hidden">
								<div
									className="h-full rounded-full bg-accent transition-[width] duration-300"
									style={{ width: `${Math.max(0, progress) * 100}%` }}
								/>
							</div>
							{exportStats.fps > 0 && (
								<div className="flex gap-3 text-xs text-text-tertiary font-mono tabular-nums">
									<span>{exportStats.fps.toFixed(1)} fps</span>
									<span>{exportStats.speed.toFixed(1)}×</span>
									<span>frame {exportStats.frame}</span>
								</div>
							)}
						</div>
					) : undefined
				}
				error={exportError}
				primaryAction={
					<div className="flex gap-2">
						<Button
							className="flex-1"
							disabled={!file || !ready || processing || metadataExportLocked}
							onClick={() => {
								setExportError(null);
								void handleExport();
							}}
						>
							Export
						</Button>
						{processing && (
							<Button
								variant="danger"
								onClick={() => {
									cancel();
									toast('Export cancelled');
								}}
							>
								Cancel
							</Button>
						)}
					</div>
				}
			/>
		</>
	);

	return (
		<>
			<Seo
				title="Free Online Video Editor — Trim, Crop & Export"
				description="Free online video editor — trim, cut, resize, crop, color-correct and export MP4, WebM, MKV and more, directly in your browser. No upload, 100% private."
				path="/tools/video"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Video Editor',
						'Trim, cut, resize, crop, color-correct and export videos locally in your browser. No upload, 100% private, powered by native WebCodecs, WebGL2 and the Mediabunny library.',
						'https://vixely.app/tools/video',
					),
					buildFAQSchema(VIDEO_LANDING_FAQS.map((f) => ({ question: f.question, answer: f.answer }))),
				]}
			/>
			{file && <h1 className="sr-only">Video Editor</h1>}
			<input
				ref={fileInputRef}
				type="file"
				accept={VIDEO_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleFile(f);
					e.currentTarget.value = '';
				}}
			/>
			<input
				ref={preBurnedAssInputRef}
				type="file"
				accept={VIDEO_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handlePreBurnedAssSourceFile(f);
					e.currentTarget.value = '';
				}}
			/>

			<EditorShell
				editor="video"
				hasFile={file !== null}
				sidebarLabel="video inspector"
				toolRail={file ? videoToolRail : undefined}
				toolPanelOpen={isTablet && file !== null}
				main={
					<>
						{file && (
							<VideoToolbar
								file={file}
								processing={processing}
								videoWidth={videoStreamInfo?.width}
								videoHeight={videoStreamInfo?.height}
								videoFps={videoFps}
								duration={duration}
								currentTime={currentTime}
								currentFrame={timeToFrames(currentTime)}
								totalFrames={totalFrames}
								detailedProbePending={detailedProbePending}
								compareMode={compareMode}
								hasChanges={
									hasColorAdjustments ||
									(resize.originalWidth > 0 &&
										(resize.width !== resize.originalWidth ||
											resize.height !== resize.originalHeight))
								}
								onOpenFile={() => {
									fileInputRef.current?.click();
								}}
								onStepFrame={stepCurrentFrame}
								onStartFrameHold={startFrameHold}
								onStopFrameHold={stopFrameHold}
								onShowInfo={() => {
									setShowInfo(true);
								}}
								onToggleCompare={() => {
									setCompareMode((prev) => !prev);
								}}
								captureMenu={
									<>
										<button
											ref={captureButtonRef}
											onClick={() => {
												setCaptureMenuOpen((prev) => !prev);
											}}
											disabled={!file || processing}
											title="Capture current frame"
											type="button"
											aria-label="Capture current frame"
											className={`h-8 w-8 flex items-center justify-center rounded-md transition-all cursor-pointer
												${captureMenuOpen ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text hover:bg-surface-raised/60'}
												${!file || processing ? 'opacity-30 pointer-events-none' : ''}`}
										>
											<Camera size={16} />
										</button>
										{captureMenuOpen && (
											<CaptureMenu
												format={captureFormat}
												onFormatChange={setCaptureFormat}
												onAction={(action) => {
													void handleCaptureAction(captureFormat, action);
												}}
												onClose={() => {
													setCaptureMenuOpen(false);
												}}
												anchorRef={captureButtonRef}
											/>
										)}
									</>
								}
							/>
						)}
						{videoUrl ? (
							<div
								className="flex-1 flex items-center justify-center workspace-bg p-2 sm:p-3 overflow-hidden relative"
								{...dropHandlers}
							>
								<VideoPlayer
									src={videoUrl}
									previewFile={file}
									videoRef={videoRef}
									captureCanvasRef={captureCanvasRef}
									assSubtitleContent={assSubtitleContent}
									embeddedFonts={embeddedFonts}
									compareMode={compareMode}
									onLoadedMetadata={handleVideoLoaded}
									onTimeUpdate={handleTimeUpdate}
									onSeek={handleSeek}
									onTogglePlay={togglePlaybackInTrim}
									timelineScrubbing={timelineScrubbing}
									scrubPreviewTime={timelineScrubbing ? currentTime : null}
									metadataLoading={metadataVideoLoading}
									processing={processing}
									progress={progress}
								/>

								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
										<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
											Drop to replace video
										</div>
									</div>
								)}
							</div>
						) : (
							<EditorLanding
								emptyState={
									<EditorEmptyState
										icon={Video}
										variant="hero"
										isDragging={isDragging}
										title="No video loaded"
										description="Drop a video or click to get started"
										dragTitle="Drop your video here"
										dragDescription="Release to load"
										onChooseFile={() => fileInputRef.current?.click()}
										formatHints={['MP4', 'WebM', 'MKV', 'AVI', 'MOV']}
									/>
								}
								dropHandlers={dropHandlers}
								isDragging={isDragging}
								hasFile={false}
								replaceLabel="Drop your video here"
								heading="Free Online Video Editor — Trim, Crop & Export in Browser"
								tagline="Trim, cut, resize, color-correct and export MP4, WebM, MKV and more — directly in your browser. No upload, 100% private, powered by native WebCodecs, WebGL2 and the Mediabunny library."
								features={[...VIDEO_LANDING_FEATURES]}
								formats={VIDEO_LANDING_FORMATS}
								formatColor="bg-blue-400"
								faqs={[...VIDEO_LANDING_FAQS]}
								crossLinks={[...VIDEO_CROSS_LINKS]}
							/>
						)}
					</>
				}
				timeline={
					duration > 0 ? (
						<div className="border-t border-border bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(9,9,11,0.98)_100%)] px-3 py-2 sm:px-4 sm:py-2.5">
							<Timeline
								duration={duration}
								trimStart={trimStart}
								trimEnd={trimEnd}
								currentTime={currentTime}
								density="compact"
								minGap={minTrimDuration}
								onTrimStartChange={handleTimelineTrimStartChange}
								onTrimEndChange={handleTimelineTrimEndChange}
								onSeek={handleSeek}
								onScrubStart={handleTimelineScrubStart}
								onScrubEnd={handleTimelineScrubEnd}
							/>
						</div>
					) : undefined
				}
				sidebar={file ? sidebarContent : undefined}
				overlays={
					showInfo && file ? (
						<Suspense fallback={null}>
							<VideoInfoModal
								file={file}
								probeResult={probeResult}
								duration={duration}
								streamInfoPending={streamInfoPending}
								metadataLoadStage={metadataLoadStage}
								detailedProbe={detailedProbe}
								detailedProbePending={detailedProbePending}
								detailedProbeError={detailedProbeError}
								onClose={() => {
									setShowInfo(false);
								}}
							/>
						</Suspense>
					) : undefined
				}
			/>
		</>
	);
}
