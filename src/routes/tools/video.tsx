import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
	Camera,
	Video,
	Settings,
	Info,
	Layers,
	Palette,
	Scissors,
	Download,
	Scaling,
	Volume2,
	Subtitles,
	AlertCircle,
	StepBack,
	StepForward,
	LoaderCircle,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo, useId } from 'react';
import { toast } from 'sonner';
import type { AdvancedVideoSettings } from '@/components/video/AdvancedSettings.tsx';
import type { SubtitlePreviewData } from '@/hooks/useVideoProcessor.ts';
import type { DetailedProbeResultData } from '@/workers/ffmpeg-worker.ts';
import { Seo } from '@/components/Seo.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Slider, Timeline, formatTimecode, formatCompactTime } from '@/components/ui/index.ts';
import {
	getPlatformIcon,
	getPlatformKey,
	getPlatformLabel,
	PlatformIconComponent,
} from '@/components/video/PlatformIcons.tsx';
import { ResizePanel } from '@/components/video/ResizePanel.tsx';
import { VideoInfoModal } from '@/components/video/VideoInfoModal.tsx';
import { VideoPlayer } from '@/components/video/VideoPlayer.tsx';
import {
	VIDEO_CODECS,
	CONTAINERS,
	AUDIO_CODECS,
	AUDIO_BITRATES,
	isValidCombo,
	isValidAudioCombo,
} from '@/config/codecs.ts';
import { videoPresetEntries, buildVideoArgs, VIDEO_ACCEPT } from '@/config/presets.ts';
import { useFrameStepController } from '@/hooks/useFrameStepController.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { usePreventUnload } from '@/hooks/usePreventUnload.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useTimelineScrubController } from '@/hooks/useTimelineScrubController.ts';
import { useVideoMetadataLoader, type MetadataLoadStage } from '@/hooks/useVideoMetadataLoader.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { buildFfmpegExportPlan } from '@/modules/video-editor/export/ffmpeg-export-plan.ts';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';
import { setPendingImageTransfer } from '@/utils/crossEditorTransfer.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';
import { formatChannels, getLanguageName } from '@/utils/languageUtils.ts';

export const Route = createFileRoute('/tools/video')({ component: VideoStudio });

const VIDEO_PRESETS = videoPresetEntries();

const VIDEO_FILENAME_RE = /\.(mp4|mkv|webm|mov|m4v|avi|mts|m2ts|ts)$/i;

async function convertPngToFormat(pngData: Uint8Array, format: 'jpeg' | 'webp'): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const sourceBlob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });
		const sourceUrl = URL.createObjectURL(sourceBlob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(sourceUrl);
				reject(new Error('Canvas context unavailable'));
				return;
			}
			ctx.drawImage(img, 0, 0);
			canvas.toBlob(
				(blob) => {
					URL.revokeObjectURL(sourceUrl);
					if (!blob) {
						reject(new Error('Failed to encode frame'));
						return;
					}
					resolve(blob);
				},
				format === 'jpeg' ? 'image/jpeg' : 'image/webp',
				0.92,
			);
		};
		img.onerror = () => {
			URL.revokeObjectURL(sourceUrl);
			reject(new Error('Failed to decode frame'));
		};
		img.src = sourceUrl;
	});
}

function pickEncodeThreads(): number {
	const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
	if (!Number.isFinite(hc) || hc <= 0) return 2;
	return Math.min(Math.floor(hc / 2), 8);
}

function isVideoFileLike(file: File): boolean {
	return file.type.startsWith('video/') || VIDEO_FILENAME_RE.test(file.name);
}

/* ── Mode Tab Config ── */

const VIDEO_MODE_TABS: { mode: VideoMode; label: string; icon: typeof Layers }[] = [
	{ mode: 'presets', label: 'Presets', icon: Layers },
	{ mode: 'trim', label: 'Trim', icon: Scissors },
	{ mode: 'resize', label: 'Resize', icon: Scaling },
	{ mode: 'adjust', label: 'Adjust', icon: Palette },
	{ mode: 'export', label: 'Export', icon: Download },
];

/* ── Group presets by platform ── */

function groupPresetsByPlatform(presets: [string, { name: string; description: string }][]) {
	const groups: Record<string, [string, { name: string; description: string }][]> = {};
	for (const entry of presets) {
		const platform = getPlatformKey(entry[0]);
		if (!groups[platform]) groups[platform] = [];
		groups[platform].push(entry);
	}
	const order = ['discord', 'twitch', 'youtube', 'twitter', 'tiktok', 'bluesky', 'general'];
	return order.filter((p) => groups[p]).map((p) => ({ platform: p, presets: groups[p]! }));
}

function ToggleSwitch({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
	return (
		<button
			onClick={onToggle}
			type="button"
			role="switch"
			aria-checked={enabled}
			aria-label={label}
			className={`ml-auto relative w-8 h-4.5 rounded-full transition-colors cursor-pointer shrink-0 ${
				enabled ? 'bg-accent' : 'bg-border'
			}`}
		>
			<div
				aria-hidden
				className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${
					enabled ? 'translate-x-3.5' : ''
				}`}
			/>
		</button>
	);
}

function codecSupportsQp(codec: string): boolean {
	return codec === 'libx264' || codec === 'libx265';
}

function applyAdvancedUpdate(
	settings: AdvancedVideoSettings,
	key: keyof AdvancedVideoSettings,
	value: AdvancedVideoSettings[keyof AdvancedVideoSettings],
): AdvancedVideoSettings {
	const next = { ...settings, [key]: value };
	if (key === 'codec' && typeof value === 'string' && !isValidCombo(value, next.container)) {
		const codec = VIDEO_CODECS.find((c) => c.ffmpegLib === value);
		if (codec) next.container = codec.containers[0]!;
	}
	if (key === 'container' && typeof value === 'string' && !isValidCombo(next.codec, value)) {
		const validCodec = VIDEO_CODECS.find((c) => c.containers.includes(value));
		if (validCodec) next.codec = validCodec.ffmpegLib;
	}
	if (key === 'container' && typeof value === 'string' && !isValidAudioCombo(next.audioCodec, value)) {
		const validAudio = AUDIO_CODECS.find((c) => c.ffmpegLib !== 'none' && c.containers.includes(value));
		if (validAudio) next.audioCodec = validAudio.ffmpegLib;
	}
	if (!codecSupportsQp(next.codec) && next.rateControl === 'qp') {
		next.rateControl = 'crf';
	}
	return next;
}

function VideoStudio() {
	const navigate = useNavigate();
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
	const videoMode = useVideoEditorStore((s) => s.mode);
	const setVideoMode = useVideoEditorStore((s) => s.setMode);
	const videoFilters = useVideoEditorStore((s) => s.filters);
	const setVideoFilter = useVideoEditorStore((s) => s.setFilter);
	const resetVideoFilters = useVideoEditorStore((s) => s.resetFilters);
	const probeResult = useVideoEditorStore((s) => s.probeResult);
	const setProbeResult = useVideoEditorStore((s) => s.setProbeResult);
	const tracks = useVideoEditorStore((s) => s.tracks);
	const setTracks = useVideoEditorStore((s) => s.setTracks);
	const resize = useVideoEditorStore((s) => s.resize);
	const setResize = useVideoEditorStore((s) => s.setResize);
	const trimInputMode = useVideoEditorStore((s) => s.trimInputMode);
	const setTrimInputMode = useVideoEditorStore((s) => s.setTrimInputMode);
	const advancedSettings = useVideoEditorStore((s) => s.advancedSettings);
	const setAdvancedSettings = useVideoEditorStore((s) => s.setAdvancedSettings);
	const ffmpegFilterArgs = useVideoEditorStore((s) => s.ffmpegFilterArgs);
	const resizeFilterArgs = useVideoEditorStore((s) => s.resizeFilterArgs);

	const updateAdvanced = useCallback(
		<K extends keyof AdvancedVideoSettings>(key: K, value: AdvancedVideoSettings[K]) => {
			setAdvancedSettings(applyAdvancedUpdate(advancedSettings, key, value));
		},
		[advancedSettings, setAdvancedSettings],
	);

	const [file, setFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useObjectUrlState();
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
	const [resultUrl, setResultUrl] = useObjectUrlState();
	const [resultExt, setResultExt] = useState<string | null>(null);
	const [audioExportMode, setAudioExportMode] = useState<'all' | 'single'>('all');
	const [subtitleExportMode, setSubtitleExportMode] = useState<'all' | 'single'>('all');
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
	const [captureFormat, setCaptureFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
	const [embeddedFonts, setEmbeddedFonts] = useState<Array<{ name: string; data: Uint8Array }>>([]);
	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const trimStartFrameInputId = useId();
	const trimEndFrameInputId = useId();

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const preBurnedAssInputRef = useRef<HTMLInputElement>(null);
	const progressRef = useRef(0);
	const startedRef = useRef(started);
	const exportStatsRef = useRef(exportStats);
	const subtitleCacheRef = useRef<Map<string, SubtitlePreviewData>>(new Map());

	const isDirty = file !== null;
	usePreventUnload(isDirty || processing);

	const videoStreamInfo = useMemo(() => probeResult?.streams.find((s) => s.type === 'video') ?? null, [probeResult]);
	const videoFps = videoStreamInfo?.fps ?? 30;
	const frameDuration = useMemo(() => 1 / Math.max(videoFps, 1), [videoFps]);

	const audioStreams = useMemo(() => probeResult?.streams.filter((s) => s.type === 'audio') ?? [], [probeResult]);
	const subtitleStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [],
		[probeResult],
	);

	const groupedPresets = useMemo(() => groupPresetsByPlatform(VIDEO_PRESETS), []);
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
		setFile,
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
		setVideoUrl,
		setEmbeddedFonts,
		setProbeResult,
		setTracks,
		setResize,
	});

	const handleFile = loadVideoMetadata;

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
		setDuration(dur);
		setTrimEnd(dur);
		setTrimStart(0);
		setCurrentTime(0);
	}, []);

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

	/* ── Keyboard shortcuts ── */
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable)
			) {
				return;
			}
			if (e.key === ' ') {
				e.preventDefault();
				togglePlaybackInTrim();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [togglePlaybackInTrim]);

	const handleExportFrameToImageEditor = useCallback(
		(frameFile: File) => {
			setPendingImageTransfer(frameFile);
			toast.success('Frame ready in Image editor');
			void navigate({ to: '/tools/image' });
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
				const pngData = await captureFrame({ file, timestamp: currentTime });
				let blob: Blob;
				if (format === 'png') {
					blob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });
				} else {
					blob = await convertPngToFormat(pngData, format);
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
		[file, currentTime, captureFrame, handleExportFrameToImageEditor, processing],
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
		} = buildFfmpegExportPlan({
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
			ffmpegFilterArgs: ffmpegFilterArgs(),
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
			const result = await transcode({ file: sourceFile, args, outputName, expectedDurationSec: clipDuration });
			clearTimeout(timeoutId);
			const blob = new Blob([new Uint8Array(result)], { type: `video/${ext}` });
			const url = URL.createObjectURL(blob);
			setResultUrl(url);
			setResultExt(ext);
			toast.success('Export complete', { description: `vixely-export.${ext}` });

			// Auto-download
			const a = document.createElement('a');
			a.href = url;
			a.download = `vixely-export.${ext}`;
			a.click();
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
		ffmpegFilterArgs,
		minTrimDuration,
		videoStreamInfo,
		videoFps,
	]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		if (resultExt) {
			const a = document.createElement('a');
			a.href = resultUrl;
			a.download = `vixely-export.${resultExt}`;
			a.click();
			return;
		}
		let ext = 'mp4';
		if (selectedPreset == null) {
			ext = advancedSettings.container;
		} else if (selectedPreset) {
			const { format } = buildVideoArgs(selectedPreset, 1);
			ext = format;
		}
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = `vixely-export.${ext}`;
		a.click();
	}, [resultUrl, resultExt, selectedPreset, advancedSettings]);

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
	const hasColorAdjustments =
		videoFilters.brightness !== 0 ||
		videoFilters.contrast !== 1 ||
		videoFilters.saturation !== 1 ||
		videoFilters.hue !== 0;
	const usingPreBurnedAssSource = usePreBurnedAssSource && preBurnedAssSourceFile != null;
	const sidebarContent = (
		<>
			{/* Mode Tabs */}
			<div className="flex border-b border-border bg-surface overflow-x-auto">
				{VIDEO_MODE_TABS.map((tab) => {
					const isActive = videoMode === tab.mode;
					return (
						<button
							key={tab.mode}
							onClick={() => {
								setVideoMode(tab.mode);
							}}
							className={`flex-1 flex flex-col items-center gap-1 py-3 text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
								isActive
									? 'text-accent border-b-2 border-accent'
									: 'text-text-tertiary hover:text-text-secondary'
							}`}
						>
							<tab.icon size={16} />
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Tab Content */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				{/* ── Presets Tab ── */}
				{videoMode === 'presets' && (
					<>
						<h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-1">
							One-Click Presets
						</h3>
						<div className="flex flex-col gap-4">
							{groupedPresets.map(({ platform, presets }) => (
								<div key={platform}>
									<div className="flex items-center gap-2 mb-2">
										<PlatformIconComponent platform={platform} size={14} />
										<span className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
											{getPlatformLabel(platform)}
										</span>
									</div>
									<div className="flex flex-col gap-1.5">
										{presets.map(([key, preset]) => {
											const iconData = getPlatformIcon(key);
											return (
												<button
													key={key}
													onClick={() => {
														const isSame = selectedPreset === key;
														if (isSame) {
															setSelectedPreset(null);
															return;
														}
														setSelectedPreset(key);
													}}
													className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer ${
														selectedPreset === key
															? 'bg-accent/10 border border-accent/30 text-text'
															: 'bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text'
													}`}
												>
													<div
														className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
															selectedPreset === key
																? 'bg-accent text-bg'
																: 'bg-surface-raised text-text-tertiary'
														}`}
													>
														{iconData ? (
															<iconData.Icon
																size={14}
																className={
																	selectedPreset === key
																		? 'text-bg'
																		: iconData.colorClass
																}
															/>
														) : (
															<span className="text-[13px] font-bold">V</span>
														)}
													</div>
													<div className="min-w-0">
														<p className="text-[13px] font-medium truncate">
															{preset.name}
														</p>
														<p className="text-[13px] text-text-tertiary truncate">
															{preset.description}
														</p>
													</div>
												</button>
											);
										})}
									</div>
								</div>
							))}
						</div>
					</>
				)}

				{/* ── Trim Tab ── */}
				{videoMode === 'trim' && (
					<>
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">
								Trim Range
							</h3>
							<div className="flex rounded-md border border-border overflow-hidden">
								<button
									onClick={() => {
										setTrimInputMode('time');
									}}
									className={`px-2 py-0.5 text-[13px] font-semibold uppercase cursor-pointer transition-colors ${
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
									className={`px-2 py-0.5 text-[13px] font-semibold uppercase cursor-pointer transition-colors ${
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

						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Clip duration</span>
								<span className="font-mono text-text-secondary">{formatCompactTime(clipDuration)}</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Total</span>
								<span className="font-mono text-text-secondary">{formatCompactTime(duration)}</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Current</span>
								<span className="font-mono text-text-secondary">{formatTimecode(currentTime)}</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Frame</span>
								<span className="font-mono text-text-secondary">
									{formatNumber(timeToFrames(currentTime))} / {formatNumber(timeToFrames(duration))}
								</span>
							</div>
						</div>
					</>
				)}

				{/* ── Resize Tab ── */}
				{videoMode === 'resize' && <ResizePanel />}

				{/* ── Adjust Tab ── */}
				{videoMode === 'adjust' && (
					<>
						<div className="flex items-center gap-2 rounded-lg bg-accent/5 border border-accent/20 px-3 py-2">
							<AlertCircle size={13} className="text-accent shrink-0" />
							<p className="text-[13px] text-text-secondary">
								Preview is approximate. Final export is processed with Mediabunny.
							</p>
						</div>
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">
								Color Correction
							</h3>
							<button
								onClick={resetVideoFilters}
								className="text-[13px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
							>
								Reset
							</button>
						</div>
						<div className="flex flex-col gap-3">
							<Slider
								label="Brightness"
								displayValue={`${videoFilters.brightness >= 0 ? '+' : ''}${(videoFilters.brightness * 100).toFixed(0)}`}
								min={-0.5}
								max={0.5}
								step={0.01}
								value={videoFilters.brightness}
								onChange={(e) => {
									setVideoFilter('brightness', Number(e.target.value));
								}}
							/>
							<Slider
								label="Contrast"
								displayValue={(videoFilters.contrast * 100).toFixed(0)}
								min={0.2}
								max={3}
								step={0.01}
								value={videoFilters.contrast}
								onChange={(e) => {
									setVideoFilter('contrast', Number(e.target.value));
								}}
							/>
							<Slider
								label="Saturation"
								displayValue={(videoFilters.saturation * 100).toFixed(0)}
								min={0}
								max={3}
								step={0.01}
								value={videoFilters.saturation}
								onChange={(e) => {
									setVideoFilter('saturation', Number(e.target.value));
								}}
							/>
							<Slider
								label="Hue"
								displayValue={`${videoFilters.hue >= 0 ? '+' : ''}${videoFilters.hue.toFixed(0)}\u00b0`}
								min={-180}
								max={180}
								step={1}
								value={videoFilters.hue}
								onChange={(e) => {
									setVideoFilter('hue', Number(e.target.value));
								}}
							/>
						</div>
					</>
				)}

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
															key={codec.ffmpegLib}
															onClick={() => {
																updateAdvanced('codec', codec.ffmpegLib);
															}}
															className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
																advancedSettings.codec === codec.ffmpegLib
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
										<ToggleSwitch
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
																		codec.ffmpegLib,
																		advancedSettings.container,
																	);
																	return (
																		<button
																			key={codec.ffmpegLib}
																			onClick={() => {
																				updateAdvanced(
																					'audioCodec',
																					codec.ffmpegLib,
																				);
																			}}
																			disabled={!valid}
																			className={`rounded-md py-2 text-sm font-medium transition-colors cursor-pointer ${
																				advancedSettings.audioCodec ===
																				codec.ffmpegLib
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
									<ToggleSwitch
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
										<ToggleSwitch
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
												{VIDEO_CODECS.find((c) => c.ffmpegLib === advancedSettings.codec)
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

							{resultUrl && (
								<div className="rounded-lg border border-success/25 bg-success/5 px-4 py-3">
									<p className="text-sm font-medium text-success">
										Export complete — ready to download
									</p>
								</div>
							)}
						</div>
					</>
				)}
			</div>

			{/* Actions */}
			<div className="p-4 border-t border-border flex flex-col gap-2">
				{processing && (
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
				)}

				{exportError && (
					<div className="animate-slide-up-fade rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
						{exportError}
					</div>
				)}

				<div className="flex gap-2">
					<Button
						className="flex-1"
						disabled={!file || !ready || processing || metadataExportLocked}
						onClick={() => {
							setExportError(null);
							void handleExport();
							setDrawerOpen(false);
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
				{resultUrl && (
					<Button
						variant="secondary"
						className="w-full"
						onClick={() => {
							handleDownload();
							setDrawerOpen(false);
						}}
					>
						Download
					</Button>
				)}
			</div>
		</>
	);

	return (
		<div data-editor="video" className="h-full flex flex-col">
			<Seo
				title="Video Editor — Vixely"
				description="Trim, crop, resize, adjust colors, and export videos locally in your browser."
				path="/tools/video"
			/>
			<h1 className="sr-only">Video Editor</h1>
			<input
				ref={fileInputRef}
				type="file"
				accept={VIDEO_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleFile(f);
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

			<div className="h-0.5 gradient-accent shrink-0" />
			<div className="flex flex-1 min-h-0 animate-fade-in">
				{/* ── Main Area ── */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Player */}
					<div
						className="flex-1 flex items-center justify-center workspace-bg p-3 sm:p-6 overflow-hidden relative"
						{...dropHandlers}
					>
						{videoUrl ? (
							<VideoPlayer
								src={videoUrl}
								previewFile={file}
								videoRef={videoRef}
								assSubtitleContent={assSubtitleContent}
								embeddedFonts={embeddedFonts}
								onLoadedMetadata={handleVideoLoaded}
								onTimeUpdate={handleTimeUpdate}
								onSeek={handleSeek}
								timelineScrubbing={timelineScrubbing}
								scrubPreviewTime={timelineScrubbing ? currentTime : null}
								metadataLoading={metadataVideoLoading}
								processing={processing}
								progress={progress}
							/>
						) : (
							<div className="flex flex-col items-center gap-6">
								<EmptyState
									isDragging={isDragging}
									onChooseFile={() => fileInputRef.current?.click()}
								/>
							</div>
						)}

						{isDragging && videoUrl && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
								<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
									Drop to replace video
								</div>
							</div>
						)}
					</div>

					{/* Timeline */}
					{duration > 0 && (
						<div className="border-t border-border bg-surface px-3 sm:px-6 py-3 sm:py-4">
							<Timeline
								duration={duration}
								trimStart={trimStart}
								trimEnd={trimEnd}
								currentTime={currentTime}
								minGap={minTrimDuration}
								onTrimStartChange={(v) => {
									setTrimStart(clampTrimStart(v));
								}}
								onTrimEndChange={(v) => {
									setTrimEnd(clampTrimEnd(v));
								}}
								onSeek={handleSeek}
								onScrubStart={handleTimelineScrubStart}
								onScrubEnd={handleTimelineScrubEnd}
								headerStart={
									<span className="hidden sm:inline-flex items-center text-[13px] font-mono text-text-tertiary tabular-nums">
										Frame {formatNumber(timeToFrames(currentTime))} / {formatNumber(totalFrames)}
									</span>
								}
								centerStart={
									<Button
										variant="ghost"
										size="icon"
										onPointerDown={(e) => {
											e.preventDefault();
											startFrameHold(-1);
										}}
										onPointerUp={stopFrameHold}
										onPointerLeave={stopFrameHold}
										onPointerCancel={stopFrameHold}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												stepCurrentFrame(-1);
											}
										}}
										disabled={!file || processing}
										title="Previous frame"
										aria-label="Previous frame"
									>
										<StepBack size={16} />
									</Button>
								}
								centerEnd={
									<Button
										variant="ghost"
										size="icon"
										onPointerDown={(e) => {
											e.preventDefault();
											startFrameHold(1);
										}}
										onPointerUp={stopFrameHold}
										onPointerLeave={stopFrameHold}
										onPointerCancel={stopFrameHold}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												stepCurrentFrame(1);
											}
										}}
										disabled={!file || processing}
										title="Next frame"
										aria-label="Next frame"
									>
										<StepForward size={16} />
									</Button>
								}
								headerEnd={
									<div className="relative">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => {
												setCaptureMenuOpen(!captureMenuOpen);
											}}
											disabled={!file || processing}
											title="Capture current frame"
											aria-label="Capture current frame"
											aria-haspopup="menu"
											aria-expanded={captureMenuOpen}
										>
											<Camera size={16} />
										</Button>
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
											/>
										)}
									</div>
								}
							/>
							{file && (
								<div className="mt-3 rounded-lg border border-border/70 bg-bg/40 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-tertiary">
									<span className="font-medium text-text-secondary truncate max-w-full">
										{file.name}
									</span>
									<span>{formatFileSize(file.size)}</span>
									{videoStreamInfo?.width && videoStreamInfo?.height && (
										<span>
											{videoStreamInfo.width}&times;{videoStreamInfo.height}
										</span>
									)}
									<span>{videoFps.toFixed(2)} fps</span>
									<span>{formatCompactTime(duration)}</span>
									<div className="flex-1" />
									{detailedProbePending ? (
										<span
											className="inline-flex items-center text-text-tertiary"
											title="Loading full metadata"
										>
											<LoaderCircle size={13} className="animate-spin" />
										</span>
									) : (
										<button
											onClick={() => {
												setShowInfo(true);
											}}
											type="button"
											aria-label="Open video file info"
											className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
											title="File info"
										>
											<Info size={13} />
										</button>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{file && (
					<>
						{/* ── Mobile Sidebar Toggle ── */}
						<button
							className="md:hidden fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full gradient-accent flex items-center justify-center shadow-lg cursor-pointer"
							onClick={() => {
								setDrawerOpen(true);
							}}
							type="button"
							aria-label="Open video settings"
							title="Open video settings"
						>
							<Settings size={20} className="text-white" />
						</button>

						{/* ── Right Sidebar (Desktop) ── */}
						<aside className="hidden md:flex w-80 xl:w-88 shrink-0 overflow-hidden border-l border-border bg-surface flex-col">
							{sidebarContent}
						</aside>

						{/* ── Mobile Sidebar Drawer ── */}
						<Drawer
							open={drawerOpen}
							onClose={() => {
								setDrawerOpen(false);
							}}
						>
							<div className="h-full flex flex-col bg-surface">{sidebarContent}</div>
						</Drawer>
					</>
				)}
			</div>

			{/* File info modal */}
			{showInfo && file && (
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
			)}
		</div>
	);
}

function EmptyState({ isDragging, onChooseFile }: { isDragging: boolean; onChooseFile: () => void }) {
	return (
		<div className="flex flex-col items-center text-center max-w-lg px-4">
			<div
				className={`rounded-3xl bg-surface border border-border px-14 py-12 mb-6 transition-all ${isDragging ? 'border-accent scale-105 shadow-[0_0_40px_var(--color-accent-glow)]' : ''}`}
			>
				<Video
					size={72}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? 'text-accent' : 'text-accent/25'}`}
				/>
			</div>
			<p className="text-lg font-semibold text-text-secondary">
				{isDragging ? 'Drop your video here' : 'No video loaded'}
			</p>
			<p className="mt-2 text-sm text-text-tertiary">
				{isDragging ? 'Release to load' : 'Drop a file or click to get started'}
			</p>
			{!isDragging && (
				<Button variant="secondary" className="mt-5 h-10 px-5 text-sm" onClick={onChooseFile}>
					Choose File
				</Button>
			)}
		</div>
	);
}

const CAPTURE_FORMATS = [
	{ value: 'png' as const, label: 'PNG', group: 'Lossless', description: 'Exact pixels, best for edits' },
	{ value: 'webp' as const, label: 'WebP', group: 'Lossy', description: 'Smaller size with strong visual quality' },
	{ value: 'jpeg' as const, label: 'JPEG', group: 'Lossy', description: 'Compatible almost everywhere' },
];

function CaptureMenu({
	format,
	onFormatChange,
	onAction,
	onClose,
}: {
	format: 'png' | 'jpeg' | 'webp';
	onFormatChange: (f: 'png' | 'jpeg' | 'webp') => void;
	onAction: (action: 'download' | 'image-editor') => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const handler = (e: PointerEvent) => {
			if (!(e.target instanceof Element)) return;
			if (!e.target.closest('[data-capture-menu]')) onClose();
		};
		document.addEventListener('pointerdown', handler);
		return () => {
			document.removeEventListener('pointerdown', handler);
		};
	}, [onClose]);

	const groupedFormats = [
		{ label: 'Lossless', items: CAPTURE_FORMATS.filter((item) => item.group === 'Lossless') },
		{ label: 'Lossy', items: CAPTURE_FORMATS.filter((item) => item.group === 'Lossy') },
	];

	return (
		<div
			data-capture-menu
			className="absolute bottom-full right-0 z-40 mb-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl animate-fade-in"
		>
			<div className="space-y-2 p-2">
				{groupedFormats.map((section) => (
					<div key={section.label} className="space-y-1">
						<p className="px-1 text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
							{section.label}
						</p>
						{section.items.map((option) => {
							const isSelected = option.value === format;
							return (
								<button
									key={option.value}
									onClick={() => {
										onFormatChange(option.value);
									}}
									className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
										isSelected
											? 'border-accent/35 bg-accent/10'
											: 'border-border/60 bg-surface-raised/35 hover:bg-surface-raised/60'
									}`}
								>
									<div className="flex items-center gap-2">
										<div
											className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center ${
												isSelected ? 'border-accent bg-accent' : 'border-border'
											}`}
										>
											{isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
										</div>
										<div className="min-w-0">
											<p
												className={`text-[13px] font-medium ${isSelected ? 'text-text' : 'text-text-secondary'}`}
											>
												{option.label}
											</p>
											<p className="text-[13px] text-text-tertiary">{option.description}</p>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				))}
			</div>

			<div className="border-t border-border p-1.5 flex gap-1.5">
				<button
					onClick={() => {
						onAction('download');
					}}
					className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium bg-surface-raised/50 text-text-secondary hover:bg-surface-raised hover:text-text transition-colors cursor-pointer whitespace-nowrap"
				>
					<Download size={14} />
					Download
				</button>
				<button
					onClick={() => {
						onAction('image-editor');
					}}
					className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium bg-accent/12 text-accent hover:bg-accent/20 transition-colors cursor-pointer whitespace-nowrap"
				>
					<Palette size={14} />
					Image Editor
				</button>
			</div>
		</div>
	);
}
