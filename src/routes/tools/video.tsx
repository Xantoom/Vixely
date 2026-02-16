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
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import type { AdvancedVideoSettings } from '@/components/video/AdvancedSettings.tsx';
import type { SubtitlePreviewData } from '@/hooks/useVideoProcessor.ts';
import type { DetailedProbeResultData } from '@/workers/ffmpeg-worker.ts';
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
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';
import { cacheKeyForFile, useVideoMetadataStore } from '@/stores/videoMetadata.ts';
import { setPendingImageTransfer } from '@/utils/crossEditorTransfer.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';
import { probeMediaHeaderWithRust } from '@/utils/rustMediaProbe.ts';

export const Route = createFileRoute('/tools/video')({ component: VideoStudio });

const VIDEO_PRESETS = videoPresetEntries();

const BROWSER_UNSUPPORTED_AUDIO_CODECS = new Set(['eac3', 'ac3', 'dts', 'truehd', 'mlp', 'dts-hd', 'dtshd']);

const CONTAINER_AUDIO_CODECS: Record<string, Set<string>> = {
	webm: new Set(['libopus', 'opus', 'libvorbis', 'vorbis']),
	mp4: new Set(['aac', 'mp3', 'libmp3lame', 'libopus', 'opus', 'flac', 'ac3', 'eac3']),
	mkv: new Set([
		'aac',
		'mp3',
		'libmp3lame',
		'libopus',
		'opus',
		'flac',
		'ac3',
		'eac3',
		'dts',
		'truehd',
		'pcm_s16le',
		'pcm_s24le',
	]),
};
type MetadataLoadStage = 'idle' | 'fast-probe' | 'fonts' | 'ready' | 'error';

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

const LANG_MAP: Record<string, string> = {
	eng: 'English',
	fre: 'French',
	fra: 'French',
	deu: 'German',
	ger: 'German',
	spa: 'Spanish',
	ita: 'Italian',
	jpn: 'Japanese',
	zho: 'Chinese',
	chi: 'Chinese',
	kor: 'Korean',
	por: 'Portuguese',
	rus: 'Russian',
	ara: 'Arabic',
	hin: 'Hindi',
	pol: 'Polish',
	tur: 'Turkish',
	nld: 'Dutch',
	dut: 'Dutch',
	swe: 'Swedish',
	nor: 'Norwegian',
	dan: 'Danish',
	fin: 'Finnish',
	ces: 'Czech',
	cze: 'Czech',
	hun: 'Hungarian',
	ron: 'Romanian',
	rum: 'Romanian',
	tha: 'Thai',
	vie: 'Vietnamese',
};

function getStreamLanguage(code?: string): string | null {
	if (!code?.trim()) return null;
	const lower = code.trim().toLowerCase();
	if (lower === 'und' || lower === 'unk') return null;
	return LANG_MAP[lower] ?? code.toUpperCase();
}

function formatStreamChannels(channels?: number): string | null {
	if (channels == null) return null;
	if (channels === 1) return 'Mono';
	if (channels === 2) return 'Stereo';
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return `${channels}ch`;
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
	return (
		<button
			onClick={onToggle}
			className={`ml-auto relative w-8 h-[18px] rounded-full transition-colors cursor-pointer shrink-0 ${
				enabled ? 'bg-accent' : 'bg-border'
			}`}
		>
			<div
				className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform ${
					enabled ? 'translate-x-[14px]' : ''
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
		error: _workerError,
		transcode,
		captureFrame,
		probe,
		probeStatus,
		probeDetails,
		extractSubtitlePreview,
		extractFonts,
		remuxAudio,
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
	const useCustomExport = useVideoEditorStore((s) => s.useCustomExport);
	const setUseCustomExport = useVideoEditorStore((s) => s.setUseCustomExport);
	const ffmpegFilterArgs = useVideoEditorStore((s) => s.ffmpegFilterArgs);
	const resizeFilterArgs = useVideoEditorStore((s) => s.resizeFilterArgs);

	const updateAdvanced = useCallback(
		<K extends keyof AdvancedVideoSettings>(key: K, value: AdvancedVideoSettings[K]) => {
			setAdvancedSettings(applyAdvancedUpdate(advancedSettings, key, value));
		},
		[advancedSettings, setAdvancedSettings],
	);

	const [file, setFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultExt, setResultExt] = useState<string | null>(null);
	const [audioExportMode, setAudioExportMode] = useState<'all' | 'single'>('all');
	const [subtitleExportMode, setSubtitleExportMode] = useState<'all' | 'single'>('all');
	const [videoNoReencode, setVideoNoReencode] = useState(false);
	const [audioNoReencode, setAudioNoReencode] = useState(true);
	const [streamInfoPending, setStreamInfoPending] = useState(false);
	const [metadataLoadStage, setMetadataLoadStage] = useState<MetadataLoadStage>('idle');
	const [subtitlePreviewVtt, setSubtitlePreviewVtt] = useState<string | null>(null);
	const [assSubtitleContent, setAssSubtitleContent] = useState<string | null>(null);
	const [detailedProbe, setDetailedProbe] = useState<DetailedProbeResultData | null>(null);
	const [detailedProbePending, setDetailedProbePending] = useState(false);
	const [detailedProbeError, setDetailedProbeError] = useState<string | null>(null);
	const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
	const [captureFormat, setCaptureFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
	const [embeddedFonts, setEmbeddedFonts] = useState<Array<{ name: string; data: Uint8Array }>>([]);
	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [audioRemuxState, setAudioRemuxState] = useState<'idle' | 'remuxing' | 'done' | 'error'>('idle');

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragCounter = useRef(0);
	const progressRef = useRef(0);
	const startedRef = useRef(started);
	const exportStatsRef = useRef(exportStats);
	const frameHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const probeRequestIdRef = useRef(0);
	const detailedProbeRequestIdRef = useRef(0);
	const subtitleCacheRef = useRef<Map<string, SubtitlePreviewData>>(new Map());
	const remuxRequestIdRef = useRef(0);

	const isDirty = file !== null;

	const videoStreamInfo = useMemo(() => probeResult?.streams.find((s) => s.type === 'video') ?? null, [probeResult]);
	const videoFps = videoStreamInfo?.fps ?? 30;
	const frameDuration = useMemo(() => 1 / Math.max(videoFps, 1), [videoFps]);

	const audioStreams = useMemo(() => probeResult?.streams.filter((s) => s.type === 'audio') ?? [], [probeResult]);
	const subtitleStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [],
		[probeResult],
	);

	const unsupportedAudioCodec = useMemo(() => {
		if (!tracks.audioEnabled || audioStreams.length === 0) return null;
		const stream = audioStreams[tracks.audioTrackIndex];
		if (!stream?.codec) return null;
		const codec = stream.codec.toLowerCase().trim();
		return BROWSER_UNSUPPORTED_AUDIO_CODECS.has(codec) ? codec : null;
	}, [tracks.audioEnabled, tracks.audioTrackIndex, audioStreams]);

	const groupedPresets = useMemo(() => groupPresetsByPlatform(VIDEO_PRESETS), []);
	const minTrimDuration = frameDuration;
	const metadataExportLocked = streamInfoPending || detailedProbePending || metadataLoadStage === 'fonts';
	const metadataVideoLoading = metadataExportLocked;
	const metadataStatusLabel = useMemo(() => {
		if (streamInfoPending) return probeStatus ?? 'Reading stream map...';
		if (detailedProbePending) return 'Loading full metadata...';
		switch (metadataLoadStage) {
			case 'idle':
			case 'fast-probe':
			case 'ready':
				return null;
			case 'fonts':
				return 'Extracting subtitle fonts...';
			case 'error':
				return 'Limited metadata (probe failed)';
		}
	}, [detailedProbePending, streamInfoPending, probeStatus, metadataLoadStage]);

	useEffect(() => {
		if (!selectedPreset && !useCustomExport) setUseCustomExport(true);
	}, [selectedPreset, useCustomExport, setUseCustomExport]);

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
		const timer = setTimeout(() => setExportError(null), 5000);
		return () => clearTimeout(timer);
	}, [exportError]);

	useEffect(() => {
		if (!file || !videoUrl || !unsupportedAudioCodec) {
			setAudioRemuxState('idle');
			return;
		}
		const requestId = ++remuxRequestIdRef.current;
		setAudioRemuxState('remuxing');
		const savedTime = videoRef.current?.currentTime ?? 0;
		remuxAudio(file)
			.then((data) => {
				if (requestId !== remuxRequestIdRef.current) return;
				const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
				const newUrl = URL.createObjectURL(blob);
				setVideoUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return newUrl;
				});
				setAudioRemuxState('done');
				requestAnimationFrame(() => {
					const video = videoRef.current;
					if (video) video.currentTime = savedTime;
				});
			})
			.catch((err) => {
				if (requestId !== remuxRequestIdRef.current) return;
				console.error('[video] Audio remux failed', err);
				setAudioRemuxState('error');
			});
		return () => {
			remuxRequestIdRef.current++;
		};
	}, [file, videoUrl, unsupportedAudioCodec, remuxAudio]);

	const clampToTrim = useCallback(
		(time: number) => Math.min(trimEnd, Math.max(trimStart, time)),
		[trimStart, trimEnd],
	);

	const clampTrimStart = useCallback(
		(value: number) => Math.max(0, Math.min(value, Math.max(0, trimEnd - minTrimDuration))),
		[trimEnd, minTrimDuration],
	);

	const clampTrimEnd = useCallback(
		(value: number) => Math.min(duration, Math.max(value, trimStart + minTrimDuration)),
		[duration, trimStart, minTrimDuration],
	);

	useEffect(() => {
		if (processing || !file) {
			setSubtitlePreviewVtt(null);
			setAssSubtitleContent(null);
			return;
		}
		if (!tracks.subtitleEnabled) {
			setSubtitlePreviewVtt(null);
			setAssSubtitleContent(null);
			return;
		}
		if (metadataLoadStage !== 'ready' && metadataLoadStage !== 'error') return;

		const selectedSubtitleStream = subtitleStreams[tracks.subtitleTrackIndex];
		if (!selectedSubtitleStream) {
			setSubtitlePreviewVtt(null);
			setAssSubtitleContent(null);
			return;
		}

		const cacheKey = `${file.name}:${file.size}:${file.lastModified}:${selectedSubtitleStream.index}`;
		const cached = subtitleCacheRef.current.get(cacheKey);
		if (cached) {
			if (cached.format === 'ass') {
				setSubtitlePreviewVtt(cached.fallbackWebVtt ?? null);
				setAssSubtitleContent(cached.content);
			} else {
				setAssSubtitleContent(null);
				setSubtitlePreviewVtt(cached.content);
			}
			return;
		}

		let cancelled = false;
		extractSubtitlePreview(file, selectedSubtitleStream.index, selectedSubtitleStream.codec)
			.then((preview) => {
				if (cancelled) return;
				subtitleCacheRef.current.set(cacheKey, preview);
				if (preview.format === 'ass') {
					setSubtitlePreviewVtt(preview.fallbackWebVtt ?? null);
					setAssSubtitleContent(preview.content);
					return;
				}

				setAssSubtitleContent(null);
				setSubtitlePreviewVtt(preview.content);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				if (err instanceof Error && err.message.includes('Superseded')) return;
				if (err instanceof Error && err.message.includes('File is too large for memory fallback')) {
					setSubtitlePreviewVtt(null);
					setAssSubtitleContent(null);
					return;
				}
				console.error('[video] Subtitle preview extraction failed', err);
				setSubtitlePreviewVtt(null);
				setAssSubtitleContent(null);
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

	useEffect(() => {
		if (!isDirty && !processing) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => {
			window.removeEventListener('beforeunload', handler);
		};
	}, [isDirty, processing]);

	const handleFile = useCallback(
		(f: File) => {
			const probeRequestId = ++probeRequestIdRef.current;
			const detailedProbeRequestId = ++detailedProbeRequestIdRef.current;
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			setFile(f);
			setResultUrl(null);
			setResultExt(null);
			setStreamInfoPending(true);
			setMetadataLoadStage('fast-probe');
			setDetailedProbe(null);
			setDetailedProbePending(true);
			setDetailedProbeError(null);
			setSelectedPreset(null);
			setCaptureMenuOpen(false);
			setTrimStart(0);
			setTrimEnd(0);
			setDuration(0);
			setCurrentTime(0);
			setAudioExportMode('all');
			setSubtitleExportMode('all');
			setVideoNoReencode(false);
			setAudioNoReencode(true);
			setVideoUrl(URL.createObjectURL(f));
			toast.success('Video loaded', { description: f.name });

			setEmbeddedFonts([]);
			subtitleCacheRef.current.clear();
			const metadataKey = cacheKeyForFile(f);
			useVideoMetadataStore.getState().clearMetadata(metadataKey);
			probeDetails(f)
				.then((result) => {
					if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
					setDetailedProbe(result);
				})
				.catch((err: unknown) => {
					if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
					if (err instanceof Error && err.message.includes('Superseded')) return;
					setDetailedProbeError(err instanceof Error ? err.message : String(err));
				})
				.finally(() => {
					if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
					setDetailedProbePending(false);
				});

			const probePromise = probeMediaHeaderWithRust(f)
				.then((rustProbe) => {
					if (probeRequestId !== probeRequestIdRef.current) return;
					if (!rustProbe) return;
					if (!rustProbe.streams.some((stream) => stream.type === 'video')) return;
					useVideoMetadataStore.getState().setRustMetadata(metadataKey, rustProbe);
				})
				.catch(() => null)
				.then(async () => probe(f));

			probePromise
				.then((result) => {
					if (probeRequestId !== probeRequestIdRef.current) return;
					setStreamInfoPending(false);
					if (result.fontAttachments.length > 0) {
						setMetadataLoadStage('fonts');
						extractFonts(f, result.fontAttachments)
							.then((fonts) => {
								if (probeRequestId !== probeRequestIdRef.current) return;
								setEmbeddedFonts(fonts);
								setMetadataLoadStage('ready');
							})
							.catch((err: unknown) => {
								if (probeRequestId !== probeRequestIdRef.current) return;
								console.error('[video] Font extraction failed', err);
								setMetadataLoadStage('error');
							});
					} else {
						setMetadataLoadStage('ready');
					}
					const videoStream = result.streams.find((s) => s.type === 'video');
					const probedAudioStreams = result.streams.filter((s) => s.type === 'audio');
					const probedSubtitleStreams = result.streams.filter((s) => s.type === 'subtitle');

					const defaultAudioTrackIndex = (() => {
						const i = probedAudioStreams.findIndex((s) => s.isDefault);
						return i >= 0 ? i : 0;
					})();

					const defaultSubtitleTrackIndex = (() => {
						const iDefault = probedSubtitleStreams.findIndex((s) => s.isDefault);
						if (iDefault >= 0) return iDefault;
						const iForced = probedSubtitleStreams.findIndex((s) => s.isForced);
						if (iForced >= 0) return iForced;
						return 0;
					})();

					setProbeResult({
						duration: result.duration,
						bitrate: result.bitrate,
						format: result.format,
						streams: result.streams.map((s) => ({
							index: s.index,
							type: s.type,
							codec: s.codec,
							width: s.width,
							height: s.height,
							fps: s.fps,
							sampleRate: s.sampleRate,
							channels: s.channels,
							language: s.language,
							title: s.title,
							bitrate: s.bitrate,
							isDefault: s.isDefault,
							isForced: s.isForced,
							tags: s.tags,
							disposition: s.disposition,
						})),
					});
					setTracks({
						audioEnabled: probedAudioStreams.length > 0,
						audioTrackIndex: defaultAudioTrackIndex,
						subtitleEnabled: probedSubtitleStreams.some((s) => s.isDefault || s.isForced),
						subtitleTrackIndex: defaultSubtitleTrackIndex,
					});

					const vs = videoStream;
					if (vs?.width && vs.height) {
						setResize({
							width: vs.width,
							height: vs.height,
							originalWidth: vs.width,
							originalHeight: vs.height,
							scalePercent: 100,
						});
					}
				})
				.catch((err: unknown) => {
					if (probeRequestId !== probeRequestIdRef.current) return;
					setStreamInfoPending(false);
					setMetadataLoadStage('error');
					setProbeResult(null);
					setTracks({
						audioEnabled: false,
						audioTrackIndex: 0,
						subtitleEnabled: false,
						subtitleTrackIndex: 0,
					});
					setEmbeddedFonts([]);
					toast.warning('Advanced stream metadata unavailable', {
						description:
							err instanceof Error
								? err.message
								: 'Video playback is available, but audio/subtitle stream details could not be read.',
					});
				});
		},
		[probe, probeDetails, extractFonts, setProbeResult, setTracks, setResize, videoUrl],
	);

	const handleVideoLoaded = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const dur = video.duration;
		setDuration(dur);
		setTrimEnd(dur);
		setTrimStart(0);
		setCurrentTime(0);
	}, []);

	const handleSeek = useCallback(
		(time: number) => {
			const video = videoRef.current;
			const clamped = clampToTrim(time);
			if (video) {
				video.currentTime = clamped;
			}
			setCurrentTime(clamped);
		},
		[clampToTrim],
	);

	const handleTimeUpdate = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;

		if (video.currentTime < trimStart) {
			video.currentTime = trimStart;
			setCurrentTime(trimStart);
			return;
		}

		if (video.currentTime >= trimEnd) {
			video.currentTime = trimEnd;
			setCurrentTime(trimEnd);
			if (!video.paused) video.pause();
			return;
		}

		setCurrentTime(video.currentTime);
	}, [trimStart, trimEnd]);

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

	const stopFrameHold = useCallback(() => {
		if (!frameHoldTimerRef.current) return;
		clearTimeout(frameHoldTimerRef.current);
		frameHoldTimerRef.current = null;
	}, []);

	useEffect(() => {
		return () => {
			stopFrameHold();
		};
	}, [stopFrameHold]);

	useEffect(() => {
		const video = videoRef.current;
		if (video && !processing) {
			const clamped = clampToTrim(video.currentTime);
			if (Math.abs(clamped - video.currentTime) > 0.0001) {
				video.currentTime = clamped;
				setCurrentTime(clamped);
			}
			if (clamped >= trimEnd && !video.paused) {
				video.pause();
			}
		}
	}, [trimStart, trimEnd, processing, clampToTrim]);

	/* ── Drag-and-drop handlers ── */
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current++;
		if (dragCounter.current === 1) setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current--;
		if (dragCounter.current === 0) setIsDragging(false);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current = 0;
			setIsDragging(false);

			const f = e.dataTransfer.files[0];
			if (!f) return;

			if (!f.type.startsWith('video/')) {
				toast.error('Invalid file type', { description: 'Drop a video file (MP4, WebM, MOV, etc.)' });
				return;
			}

			handleFile(f);
		},
		[handleFile],
	);

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

		const isCustom = useCustomExport || !selectedPreset;
		const encodeThreads = String(pickEncodeThreads());

		setResultUrl(null);
		setResultExt(null);
		progressRef.current = 0;
		exportStartRef.current = Date.now();
		const clipDuration = Math.max(trimEnd - trimStart, minTrimDuration);
		const trimEpsilon = Math.max(minTrimDuration * 0.5, 0.01);
		const hasTrimStart = trimStart > trimEpsilon;
		const hasTrimRange = duration > 0 && clipDuration < Math.max(duration - trimEpsilon, 0);

		const args: string[] = [];

		// Trim args
		if (hasTrimStart) args.push('-ss', trimStart.toFixed(3));
		if (hasTrimRange) args.push('-t', clipDuration.toFixed(3));

		const selectedAudioStream =
			tracks.audioEnabled && audioExportMode === 'single' ? audioStreams[tracks.audioTrackIndex] : undefined;
		const selectedSubtitleStream =
			tracks.subtitleEnabled && subtitleExportMode === 'single'
				? subtitleStreams[tracks.subtitleTrackIndex]
				: undefined;
		const includeAudioTracks = tracks.audioEnabled && audioStreams.length > 0;
		const includeSubtitleTracks = tracks.subtitleEnabled && subtitleStreams.length > 0;
		const selectedAudioStreamsForExport = includeAudioTracks
			? audioExportMode === 'all'
				? audioStreams
				: selectedAudioStream
					? [selectedAudioStream]
					: []
			: [];
		const selectedAudioStreamCount = selectedAudioStreamsForExport.length;
		const audioCodecToLib: Record<string, string> = { aac: 'aac', opus: 'libopus', libopus: 'libopus' };
		const selectedSourceAudioCodecs = selectedAudioStreamsForExport
			.map((stream) => {
				const source = stream.codec?.toLowerCase().trim() ?? '';
				return audioCodecToLib[source] ?? source;
			})
			.filter(Boolean);
		const selectedSourceAudioMaxBitrateKbps = selectedAudioStreamsForExport.reduce((max, stream) => {
			const bitrate = stream.bitrate != null && Number.isFinite(stream.bitrate) ? Math.round(stream.bitrate) : 0;
			return Math.max(max, Math.max(0, bitrate));
		}, 0);
		const selectedSourceAudioTotalBitrateKbps = selectedAudioStreamsForExport.reduce((sum, stream) => {
			const bitrate = stream.bitrate != null && Number.isFinite(stream.bitrate) ? Math.round(stream.bitrate) : 0;
			return sum + Math.max(0, bitrate);
		}, 0);
		const sourceClipBytesEstimate =
			duration > 0 ? Math.round((file.size * Math.max(clipDuration, minTrimDuration)) / duration) : file.size;

		// Build -vf filter chain (resize + color correction)
		const vfParts = [...resizeFilterArgs(), ...ffmpegFilterArgs()];
		const noVideoFilters = vfParts.length === 0;

		let outputName: string;
		let ext: string;
		let includeAudio = includeAudioTracks;

		if (isCustom) {
			const s = advancedSettings;
			includeAudio = includeAudio && (audioNoReencode || s.audioCodec !== 'none');
			const canCopyVideo = videoNoReencode && noVideoFilters;
			if (videoNoReencode && !noVideoFilters) {
				console.warn('[video] No-reencode override: active filters require re-encoding video');
			}
			const canCopyAudio =
				includeAudio &&
				selectedSourceAudioCodecs.length > 0 &&
				selectedSourceAudioCodecs.every((codec) => codec === s.audioCodec);

			if (canCopyVideo) {
				args.push('-c:v', 'copy');
			} else {
				const videoThreads = encodeThreads;
				if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
				args.push('-threads', videoThreads);
				args.push('-c:v', s.codec);
				if (s.codec === 'libx264' || s.codec === 'libx265') {
					args.push('-preset', s.preset);
				}

				const rateControl = s.rateControl === 'qp' && !codecSupportsQp(s.codec) ? 'crf' : s.rateControl;
				if (rateControl === 'bitrate') {
					const targetKbps = Math.max(150, Math.round(s.targetBitrateKbps));
					const maxRateKbps = Math.max(targetKbps, Math.round(targetKbps * 1.25));
					const bufSizeKbps = Math.max(targetKbps * 2, 300);
					args.push('-b:v', `${targetKbps}k`, '-maxrate', `${maxRateKbps}k`, '-bufsize', `${bufSizeKbps}k`);
				} else if (rateControl === 'qp') {
					args.push('-qp', String(s.qp));
				} else {
					args.push('-crf', String(s.crf));
					if (s.codec === 'libvpx-vp9' || s.codec === 'libaom-av1') {
						args.push('-b:v', '0');
					}
				}

				if (s.codec === 'libx265') {
					args.push('-pix_fmt', 'yuv420p');
					args.push('-tag:v', 'hvc1');
				}
			}

			if (includeAudio) {
				const audioContainerOk = (() => {
					const supported = CONTAINER_AUDIO_CODECS[s.container];
					if (!supported) return true;
					return selectedSourceAudioCodecs.every((c) => supported.has(c));
				})();

				if ((audioNoReencode || canCopyAudio) && audioContainerOk) {
					args.push('-c:a', 'copy');
				} else {
					if (audioNoReencode && !audioContainerOk) {
						console.warn(`[video] Audio re-encode: source incompatible with ${s.container}, converting to ${s.audioCodec}`);
					}
					args.push('-c:a', s.audioCodec, '-b:a', s.audioBitrate);
				}
			}

			ext = s.container;
			outputName = `output.${ext}`;
		} else {
			const {
				args: presetArgs,
				format,
				selectedAudioCodec: presetAudioCodec,
				recommendedAudioBitrateKbps: presetAudioBitrateKbps,
				shouldReencodeAudio: forcePresetAudioReencode,
			} = buildVideoArgs(selectedPreset, clipDuration, {
				sourceSizeBytes: sourceClipBytesEstimate,
				inputWidth: videoStreamInfo?.width,
				inputHeight: videoStreamInfo?.height,
				inputFps: videoFps,
				includeAudio: includeAudioTracks,
				sourceAudioCodecs: selectedSourceAudioCodecs,
				sourceAudioMaxBitrateKbps: selectedSourceAudioMaxBitrateKbps,
				sourceAudioTotalBitrateKbps: selectedSourceAudioTotalBitrateKbps,
				sourceAudioTrackCount: selectedAudioStreamCount,
			});

			const canCopyVideo = videoNoReencode && noVideoFilters;
			if (videoNoReencode && !noVideoFilters) {
				console.warn('[video] No-reencode override: active filters require re-encoding video');
			}

			if (canCopyVideo) {
				args.push('-c:v', 'copy');
			} else {
				const presetVfIdx = presetArgs.indexOf('-vf');
				if (presetVfIdx !== -1 && vfParts.length > 0) {
					const presetVf = presetArgs[presetVfIdx + 1]!;
					const combined = [presetVf, ...vfParts].join(',');
					args.push('-vf', combined);
					for (let i = 0; i < presetArgs.length; i++) {
						if (i !== presetVfIdx && i !== presetVfIdx + 1) args.push(presetArgs[i]!);
					}
				} else {
					if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
					args.push(...presetArgs);
				}
				args.push('-threads', encodeThreads);
			}

			if (includeAudioTracks) {
				const presetAudioContainerOk = (() => {
					const supported = CONTAINER_AUDIO_CODECS[format];
					if (!supported) return true;
					return selectedSourceAudioCodecs.every((c) => supported.has(c));
				})();

				if (audioNoReencode && !forcePresetAudioReencode && presetAudioContainerOk) {
					args.push('-c:a', 'copy');
				} else {
					if (audioNoReencode && (!presetAudioContainerOk || forcePresetAudioReencode)) {
						console.warn(`[video] Audio re-encode: source audio incompatible with ${format}, converting to ${presetAudioCodec}`);
					}
					args.push('-c:a', presetAudioCodec, '-b:a', `${presetAudioBitrateKbps}k`);
				}
			}

			ext = format;
			outputName = `output.${ext}`;
		}

		// Explicit stream mapping keeps selected tracks deterministic.
		args.push('-map', '0:v:0');
		if (includeAudio) {
			if (audioExportMode === 'all') {
				args.push('-map', '0:a?');
			} else if (selectedAudioStream) {
				args.push('-map', `0:${selectedAudioStream.index}`);
			}
		}
		if (includeSubtitleTracks) {
			const BITMAP_SUB_CODECS = new Set(['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub']);
			const hasBitmapSubs = subtitleStreams.some((s) => BITMAP_SUB_CODECS.has(s.codec?.toLowerCase() ?? ''));

			if (ext === 'webm' && hasBitmapSubs) {
				console.error('[video] Bitmap subtitles not supported in WebM, skipping');
			} else {
				if (subtitleExportMode === 'all') {
					args.push('-map', '0:s?');
				} else if (selectedSubtitleStream) {
					args.push('-map', `0:${selectedSubtitleStream.index}`);
				}
				if (ext === 'mp4') {
					args.push('-c:s', 'mov_text');
				} else if (ext === 'webm') {
					args.push('-c:s', 'webvtt');
				} else {
					args.push('-c:s', 'copy');
				}
			}
		}

		let timeoutError: Error | null = null;
		// WorkerFS mount + ffmpeg startup can take a while on large files; avoid cancelling valid startup work too early.
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
					file: { name: file.name, size: file.size, type: file.type },
					trim: { start: trimStart, end: trimEnd, clipDuration, duration },
					output: { name: outputName, ext },
					tracks: {
						audioMode: audioExportMode,
						subtitleMode: subtitleExportMode,
						includeAudio,
						includeSubtitleTracks,
						selectedAudioStreamIndex: selectedAudioStream?.index ?? null,
						selectedSubtitleStreamIndex: selectedSubtitleStream?.index ?? null,
					},
					codecMode: { useCustomExport: isCustom, videoNoReencode, audioNoReencode, selectedPreset },
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
			const result = await transcode({ file, args, outputName, expectedDurationSec: clipDuration });
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
		useCustomExport,
		advancedSettings,
		probeResult,
		tracks,
		audioStreams,
		subtitleStreams,
		audioExportMode,
		subtitleExportMode,
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
		if (useCustomExport) {
			ext = advancedSettings.container;
		} else if (selectedPreset) {
			const { format } = buildVideoArgs(selectedPreset, 1);
			ext = format;
		}
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = `vixely-export.${ext}`;
		a.click();
	}, [resultUrl, resultExt, selectedPreset, useCustomExport, advancedSettings]);

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

	const stepCurrentFrame = useCallback(
		(direction: -1 | 1) => {
			const video = videoRef.current;
			if (!video) return;
			if (!video.paused) video.pause();
			const target = clampToTrim(video.currentTime + direction * frameDuration);
			handleSeek(target);
		},
		[clampToTrim, frameDuration, handleSeek],
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

	/* ── Sidebar content ── */
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const lastPresetSelection = selectedPreset;
	const presetForExport = lastPresetSelection;
	const presetLabel = presetForExport
		? (VIDEO_PRESETS.find(([key]) => key === presetForExport)?.[1]?.name ?? null)
		: null;
	const hasTrimAdjustments = trimStart > 0 || trimEnd < duration;
	const hasResizeAdjustments = resize.width !== resize.originalWidth || resize.height !== resize.originalHeight;
	const hasColorAdjustments =
		videoFilters.brightness !== 0 ||
		videoFilters.contrast !== 1 ||
		videoFilters.saturation !== 1 ||
		videoFilters.hue !== 0;
	const showPresetToggle = true;
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
															setUseCustomExport(true);
															return;
														}
														setSelectedPreset(key);
														setUseCustomExport(false);
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
											<label className="text-[13px] text-text-tertiary mb-1 block">
												Start (frame)
											</label>
											<input
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
											<label className="text-[13px] text-text-tertiary mb-1 block">
												End (frame)
											</label>
											<input
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
								Preview is approximate. Final export uses FFmpeg for precision.
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
						{showPresetToggle && (
							<div className="sticky top-0 z-10 -mx-4 -mt-4 bg-surface px-4 pb-1 pt-4">
								<div className="grid grid-cols-2 rounded-xl border border-border/80 bg-bg/40 p-1">
									<button
										onClick={() => {
											setUseCustomExport(false);
										}}
										disabled={!presetForExport}
										className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
											!useCustomExport
												? 'bg-accent/15 text-accent'
												: 'text-text-tertiary hover:text-text-secondary'
										}`}
									>
										Preset Export
									</button>
									<button
										onClick={() => {
											setUseCustomExport(true);
										}}
										className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
											useCustomExport
												? 'bg-accent/15 text-accent'
												: 'text-text-tertiary hover:text-text-secondary'
										}`}
									>
										Custom Export
									</button>
								</div>
							</div>
						)}

						<div className="flex flex-col gap-3">
							<div className="rounded-xl border border-border/70 bg-surface-raised/25 p-3">
								<div className="mb-3 flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
											Video
										</h3>
										<p className="text-[13px] text-text-tertiary">
											Codec, container, and quality for the exported clip.
										</p>
									</div>
									<span
										className={`shrink-0 rounded-md px-2 py-1 text-[13px] font-medium ${
											useCustomExport
												? 'border border-accent/30 bg-accent/10 text-accent'
												: 'border border-border/70 bg-surface-raised/40 text-text-secondary'
										}`}
									>
										{useCustomExport ? 'Custom' : 'Preset'}
									</span>
								</div>

								<div className="mb-3">
									<label className="mb-1.5 block text-[13px] text-text-tertiary">
										Video Processing
									</label>
									<div className="grid grid-cols-2 gap-1.5">
										<button
											onClick={() => {
												setVideoNoReencode(false);
											}}
											className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
												!videoNoReencode
													? 'border-accent/40 bg-accent/12 text-accent'
													: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
											}`}
										>
											Re-encode
										</button>
										<button
											onClick={() => {
												setVideoNoReencode(true);
											}}
											className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
												videoNoReencode
													? 'border-accent/40 bg-accent/12 text-accent'
													: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
											}`}
										>
											No re-encode
										</button>
									</div>
								</div>

								{videoNoReencode ? (
									<div className="rounded-lg border border-accent/25 bg-accent/6 px-3 py-2">
										<p className="text-[13px] font-medium text-text">Video stream copy enabled</p>
										<p className="mt-0.5 text-[13px] text-text-tertiary">
											Vixely will keep the original video bitstream when no active filters require
											re-encoding.
										</p>
									</div>
								) : !useCustomExport ? (
									<div className="rounded-lg border border-accent/25 bg-accent/6 px-3 py-2">
										<p className="text-[13px] font-medium text-text">
											{presetLabel ?? 'Select a preset from the Presets tab'}
										</p>
										<p className="mt-0.5 text-[13px] text-text-tertiary">
											Video settings are managed automatically for this export profile.
										</p>
									</div>
								) : (
									<div className="flex flex-col gap-3">
										<div>
											<label className="mb-1.5 block text-[13px] text-text-tertiary">
												Video Codec
											</label>
											<div className="grid grid-cols-2 gap-1.5">
												{VIDEO_CODECS.map((codec) => (
													<button
														key={codec.ffmpegLib}
														onClick={() => {
															updateAdvanced('codec', codec.ffmpegLib);
														}}
														className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
															advancedSettings.codec === codec.ffmpegLib
																? 'border-accent/40 bg-accent/12 text-accent'
																: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
														}`}
													>
														{codec.name}
													</button>
												))}
											</div>
										</div>

										<div>
											<label className="mb-1.5 block text-[13px] text-text-tertiary">
												Container
											</label>
											<div className="grid grid-cols-3 gap-1.5">
												{CONTAINERS.map((container) => {
													const valid = isValidCombo(advancedSettings.codec, container.ext);
													return (
														<button
															key={container.ext}
															onClick={() => {
																updateAdvanced('container', container.ext);
															}}
															disabled={!valid}
															className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
																advancedSettings.container === container.ext
																	? 'border-accent/40 bg-accent/12 text-accent'
																	: valid
																		? 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
																		: 'border-border/40 bg-surface-raised/20 text-text-tertiary/40 cursor-not-allowed'
															}`}
														>
															{container.name}
														</button>
													);
												})}
											</div>
										</div>

										<div>
											<label className="mb-1.5 block text-[13px] text-text-tertiary">
												Rate Control
											</label>
											<div className="grid grid-cols-3 gap-1.5">
												<button
													onClick={() => {
														updateAdvanced('rateControl', 'crf');
													}}
													className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														advancedSettings.rateControl === 'crf'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													CRF
												</button>
												<button
													onClick={() => {
														updateAdvanced('rateControl', 'bitrate');
													}}
													className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														advancedSettings.rateControl === 'bitrate'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Bitrate
												</button>
												<button
													onClick={() => {
														updateAdvanced('rateControl', 'qp');
													}}
													disabled={!codecSupportsQp(advancedSettings.codec)}
													className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														advancedSettings.rateControl === 'qp'
															? 'border-accent/40 bg-accent/12 text-accent'
															: codecSupportsQp(advancedSettings.codec)
																? 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
																: 'border-border/40 bg-surface-raised/20 text-text-tertiary/40 cursor-not-allowed'
													}`}
												>
													QP
												</button>
											</div>
										</div>

										<div className="rounded-lg border border-border/70 bg-bg/35 px-3 py-2">
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
													<div className="mt-1 flex items-center justify-between text-[13px] text-text-tertiary">
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
													<div className="mt-1 flex items-center justify-between text-[13px] text-text-tertiary">
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
													<div className="mt-1 flex items-center justify-between text-[13px] text-text-tertiary">
														<span>Higher quality</span>
														<span>Smaller file</span>
													</div>
												</>
											)}
										</div>

										{(advancedSettings.codec === 'libx264' || advancedSettings.codec === 'libx265') && (
											<div>
												<label className="mb-1.5 block text-[13px] text-text-tertiary">
													Encoding Speed
												</label>
												<div className="grid grid-cols-3 gap-1.5">
													{(['ultrafast', 'veryfast', 'fast', 'medium', 'slow', 'veryslow'] as const).map((preset) => (
														<button
															key={preset}
															onClick={() => {
																updateAdvanced('preset', preset);
															}}
															className={`rounded-lg border px-2 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
																advancedSettings.preset === preset
																	? 'border-accent/40 bg-accent/12 text-accent'
																	: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
															}`}
														>
															{preset}
														</button>
													))}
												</div>
												<div className="mt-1 flex items-center justify-between text-[13px] text-text-tertiary">
													<span>Faster encode</span>
													<span>Better compression</span>
												</div>
											</div>
										)}
									</div>
								)}
							</div>

							{audioStreams.length > 0 && (
								<div className="rounded-xl border border-border/70 bg-surface-raised/25 p-3">
									<div className="mb-3 flex items-center gap-2">
										<Volume2 size={14} className="text-text-tertiary" />
										<div className="min-w-0">
											<h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
												Audio
											</h3>
											<p className="text-[13px] text-text-tertiary">
												Choose whether audio is exported and which stream to include.
											</p>
										</div>
										<ToggleSwitch
											enabled={tracks.audioEnabled}
											onToggle={() => {
												setTracks({ audioEnabled: !tracks.audioEnabled });
											}}
										/>
									</div>

									{tracks.audioEnabled ? (
										<div className="flex flex-col gap-2">
											<div className="grid grid-cols-2 gap-1.5">
												<button
													onClick={() => {
														setAudioExportMode('all');
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														audioExportMode === 'all'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													All tracks
												</button>
												<button
													onClick={() => {
														setAudioExportMode('single');
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														audioExportMode === 'single'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Select track
												</button>
											</div>
											<div className="grid grid-cols-2 gap-1.5">
												<button
													onClick={() => {
														setAudioNoReencode(false);
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														!audioNoReencode
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Re-encode
												</button>
												<button
													onClick={() => {
														setAudioNoReencode(true);
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														audioNoReencode
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													No re-encode
												</button>
											</div>

											{audioExportMode === 'all' ? (
												<div className="rounded-lg border border-border/60 bg-bg/35 px-3 py-2 text-[13px] text-text-tertiary">
													All {audioStreams.length} audio track
													{audioStreams.length === 1 ? '' : 's'} will be exported.
												</div>
											) : (
												audioStreams.map((stream, index) => {
													const isSelected = tracks.audioTrackIndex === index;
													const lang = getStreamLanguage(stream.language);
													const title = stream.title?.trim();
													const label = title || lang || `Track ${index + 1}`;
													const details = [
														title && lang ? lang : null,
														stream.codec?.toUpperCase(),
														formatStreamChannels(stream.channels),
													]
														.filter(Boolean)
														.join(' · ');
													return (
														<button
															key={stream.index}
															onClick={() => {
																setTracks({ audioTrackIndex: index });
															}}
															className={`w-full rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
																isSelected
																	? 'border-accent/35 bg-accent/10'
																	: 'border-border/60 bg-bg/35 hover:bg-surface-raised/40'
															}`}
														>
															<div className="flex items-center gap-2">
																<div
																	className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center ${
																		isSelected
																			? 'border-accent bg-accent'
																			: 'border-border'
																	}`}
																>
																	{isSelected && (
																		<div className="h-1.5 w-1.5 rounded-full bg-white" />
																	)}
																</div>
																<div className="min-w-0 flex-1">
																	<div className="flex items-center gap-1.5">
																		<span className="truncate text-[13px] font-medium text-text">
																			{label}
																		</span>
																		{stream.isDefault && (
																			<span className="rounded bg-accent/10 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wider text-accent/70">
																				Default
																			</span>
																		)}
																		{stream.isForced && (
																			<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wider text-amber-500/70">
																				Forced
																			</span>
																		)}
																	</div>
																	{details && (
																		<p className="mt-0.5 truncate text-[13px] text-text-tertiary">
																			{details}
																		</p>
																	)}
																</div>
															</div>
														</button>
													);
												})
											)}

											{useCustomExport && !audioNoReencode && (
												<>
													<div className="h-px bg-border/60" />
													<div className="flex flex-col gap-2">
														<div>
															<label className="mb-1.5 block text-[13px] text-text-tertiary">
																Audio Codec
															</label>
															<div className="grid grid-cols-2 gap-1.5">
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
																			className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
																				advancedSettings.audioCodec ===
																				codec.ffmpegLib
																					? 'border-accent/40 bg-accent/12 text-accent'
																					: valid
																						? 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
																						: 'border-border/40 bg-surface-raised/20 text-text-tertiary/40 cursor-not-allowed'
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
																<label className="mb-1.5 block text-[13px] text-text-tertiary">
																	Audio Bitrate
																</label>
																<div className="grid grid-cols-3 gap-1.5">
																	{AUDIO_BITRATES.map((bitrate) => (
																		<button
																			key={bitrate.value}
																			onClick={() => {
																				updateAdvanced(
																					'audioBitrate',
																					bitrate.value,
																				);
																			}}
																			className={`rounded-lg border px-2 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
																				advancedSettings.audioBitrate ===
																				bitrate.value
																					? 'border-accent/40 bg-accent/12 text-accent'
																					: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
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
										<p className="text-[13px] italic text-text-tertiary">
											Audio track will not be exported.
										</p>
									)}
								</div>
							)}

							{subtitleStreams.length > 0 && (
								<div className="rounded-xl border border-border/70 bg-surface-raised/25 p-3">
									<div className="mb-3 flex items-center gap-2">
										<Subtitles size={14} className="text-text-tertiary" />
										<div className="min-w-0">
											<h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
												Subtitles
											</h3>
											<p className="text-[13px] text-text-tertiary">
												Include subtitle tracks in the rendered output.
											</p>
										</div>
										<ToggleSwitch
											enabled={tracks.subtitleEnabled}
											onToggle={() => {
												setTracks({ subtitleEnabled: !tracks.subtitleEnabled });
											}}
										/>
									</div>

									{tracks.subtitleEnabled ? (
										<div className="flex flex-col gap-2">
											<div className="grid grid-cols-2 gap-1.5">
												<button
													onClick={() => {
														setSubtitleExportMode('all');
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														subtitleExportMode === 'all'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													All tracks
												</button>
												<button
													onClick={() => {
														setSubtitleExportMode('single');
													}}
													className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
														subtitleExportMode === 'single'
															? 'border-accent/40 bg-accent/12 text-accent'
															: 'border-border/70 bg-surface-raised/40 text-text-tertiary hover:text-text-secondary'
													}`}
												>
													Select track
												</button>
											</div>

											{subtitleExportMode === 'all' ? (
												<div className="rounded-lg border border-border/60 bg-bg/35 px-3 py-2 text-[13px] text-text-tertiary">
													All {subtitleStreams.length} subtitle track
													{subtitleStreams.length === 1 ? '' : 's'} will be exported.
												</div>
											) : (
												subtitleStreams.map((stream, index) => {
													const isSelected = tracks.subtitleTrackIndex === index;
													const lang = getStreamLanguage(stream.language);
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
															className={`w-full rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
																isSelected
																	? 'border-accent/35 bg-accent/10'
																	: 'border-border/60 bg-bg/35 hover:bg-surface-raised/40'
															}`}
														>
															<div className="flex items-center gap-2">
																<div
																	className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center ${
																		isSelected
																			? 'border-accent bg-accent'
																			: 'border-border'
																	}`}
																>
																	{isSelected && (
																		<div className="h-1.5 w-1.5 rounded-full bg-white" />
																	)}
																</div>
																<div className="min-w-0 flex-1">
																	<div className="flex items-center gap-1.5">
																		<span className="truncate text-[13px] font-medium text-text">
																			{label}
																		</span>
																		{stream.isDefault && (
																			<span className="rounded bg-accent/10 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wider text-accent/70">
																				Default
																			</span>
																		)}
																		{stream.isForced && (
																			<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wider text-amber-500/70">
																				Forced
																			</span>
																		)}
																	</div>
																	{details && (
																		<p className="mt-0.5 truncate text-[13px] text-text-tertiary">
																			{details}
																		</p>
																	)}
																</div>
															</div>
														</button>
													);
												})
											)}
										</div>
									) : (
										<p className="text-[13px] italic text-text-tertiary">
											Subtitles are excluded from export.
										</p>
									)}
								</div>
							)}
						</div>

						<div className="rounded-xl border border-border/70 bg-surface-raised/25 p-3">
							<h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
								Summary
							</h3>
							<div className="flex flex-col gap-1.5 text-[13px]">
								<div className="flex items-center justify-between">
									<span className="text-text-tertiary">Format</span>
									<span className="font-medium text-text">
										{useCustomExport
											? `${advancedSettings.container.toUpperCase()}`
											: selectedPreset
												? `${presetLabel ?? selectedPreset}`
												: 'Not selected'}
									</span>
								</div>
								{useCustomExport && !videoNoReencode && (
									<div className="flex items-center justify-between">
										<span className="text-text-tertiary">Codec</span>
										<span className="font-medium text-text">
											{VIDEO_CODECS.find((c) => c.ffmpegLib === advancedSettings.codec)?.name ?? advancedSettings.codec}
										</span>
									</div>
								)}
								{videoNoReencode && (
									<div className="flex items-center justify-between">
										<span className="text-text-tertiary">Video</span>
										<span className="font-medium text-text">Stream copy</span>
									</div>
								)}
								{videoStreamInfo?.width && videoStreamInfo?.height && (
									<div className="flex items-center justify-between">
										<span className="text-text-tertiary">Resolution</span>
										<span className="font-medium text-text">
											{hasResizeAdjustments
												? `${resize.width}\u00d7${resize.height}`
												: `${videoStreamInfo.width}\u00d7${videoStreamInfo.height}`}
										</span>
									</div>
								)}
								{duration > 0 && (
									<div className="flex items-center justify-between">
										<span className="text-text-tertiary">Duration</span>
										<span className="font-mono font-medium text-text tabular-nums">
											{formatCompactTime(hasTrimAdjustments ? Math.max(trimEnd - trimStart, 0) : duration)}
										</span>
									</div>
								)}
								{audioStreams.length > 0 && (
									<div className="flex items-center justify-between">
										<span className="text-text-tertiary">Audio</span>
										<span className="font-medium text-text">
											{tracks.audioEnabled
												? audioExportMode === 'all'
													? `${audioStreams.length} track${audioStreams.length === 1 ? '' : 's'}`
													: '1 track'
												: 'None'}
										</span>
									</div>
								)}
							</div>
							{(hasTrimAdjustments || hasResizeAdjustments || hasColorAdjustments) && (
								<div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
									{hasTrimAdjustments && (
										<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-[13px] font-medium text-accent">
											<Scissors size={11} /> Trimmed
										</span>
									)}
									{hasResizeAdjustments && (
										<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-[13px] font-medium text-accent">
											<Scaling size={11} /> Resized
										</span>
									)}
									{hasColorAdjustments && (
										<span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-[13px] font-medium text-accent">
											<Palette size={11} /> Color adjusted
										</span>
									)}
								</div>
							)}
						</div>

						{resultUrl && (
							<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
								<p className="text-[13px] text-success font-medium">Export ready</p>
							</div>
						)}
					</>
				)}
			</div>

			{/* Actions */}
			<div className="p-4 border-t border-border flex flex-col gap-2">
				{processing && (
					<div className="rounded-xl border border-accent/20 bg-accent/5 p-3 flex flex-col gap-1.5">
						<div className="flex items-center justify-between text-sm">
							<span className="text-text-secondary font-medium">Exporting...</span>
							<span className="font-mono font-medium tabular-nums text-accent">
								{(Math.max(0, progress) * 100).toFixed(1)}%
							</span>
						</div>
						<div className="h-1.5 rounded-full bg-border overflow-hidden">
							<div
								className="h-full rounded-full bg-accent transition-[width] duration-300"
								style={{ width: `${Math.max(0, progress) * 100}%` }}
							/>
						</div>
						{exportStats.fps > 0 && (
							<div className="flex gap-3 text-[13px] text-text-tertiary font-mono tabular-nums">
								<span>{exportStats.fps.toFixed(1)} fps</span>
								<span>{exportStats.speed.toFixed(1)}x</span>
								<span>frame {exportStats.frame}</span>
							</div>
						)}
					</div>
				)}

				{exportError && (
					<div className="animate-slide-up-fade rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
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
				{metadataExportLocked && (
					<p className="text-[13px] text-text-tertiary">Export locked while metadata loads.</p>
				)}

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
			<Helmet>
				<title>Video — Vixely</title>
				<meta name="description" content="Trim, crop, and convert videos locally in your browser." />
			</Helmet>
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

			<div className="h-[2px] gradient-accent shrink-0" />
			<div className="flex flex-1 min-h-0 animate-fade-in">
				{/* ── Main Area ── */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Player */}
					<div
						className="flex-1 flex items-center justify-center workspace-bg p-3 sm:p-6 overflow-hidden relative"
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
					>
						{videoUrl ? (
							<VideoPlayer
								src={videoUrl}
								videoRef={videoRef}
								fallbackSubtitleVtt={subtitlePreviewVtt}
								assSubtitleContent={assSubtitleContent}
								embeddedFonts={embeddedFonts}
								onLoadedMetadata={handleVideoLoaded}
								onTimeUpdate={handleTimeUpdate}
								onSeek={handleSeek}
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

						{unsupportedAudioCodec && videoUrl && audioRemuxState !== 'done' && (
							<div className="absolute top-3 left-3 right-3 z-10 pointer-events-none sm:left-6 sm:right-6 sm:top-6">
								<div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/80 backdrop-blur-sm px-3 py-2 text-[13px] text-amber-200">
									{audioRemuxState === 'remuxing' ? (
										<>
											<LoaderCircle size={14} className="shrink-0 text-amber-400 animate-spin" />
											<span>Preparing audio...</span>
										</>
									) : (
										<>
											<AlertCircle size={14} className="shrink-0 text-amber-400" />
											<span>
												<span className="font-medium text-amber-100">
													{unsupportedAudioCodec.toUpperCase()}
												</span>{' '}
												audio can&apos;t be previewed in the browser. Export works normally.
											</span>
										</>
									)}
								</div>
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
									{metadataStatusLabel && (
										<span
											className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
												metadataLoadStage === 'error'
													? 'border-warning/30 bg-warning/10 text-warning'
													: 'border-accent/30 bg-accent/10 text-accent'
											}`}
										>
											{metadataLoadStage === 'error' ? (
												<AlertCircle size={12} />
											) : (
												<LoaderCircle size={12} className="animate-spin" />
											)}
											{metadataStatusLabel}
										</span>
									)}
									<span>{formatFileSize(file.size)}</span>
									{videoStreamInfo?.width && videoStreamInfo?.height && (
										<span>
											{videoStreamInfo.width}&times;{videoStreamInfo.height}
										</span>
									)}
									<span>{videoFps.toFixed(2)} fps</span>
									<span>{formatCompactTime(duration)}</span>
									<div className="flex-1" />
									<button
										onClick={() => {
											setShowInfo(true);
										}}
										className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
										title="File info"
									>
										<Info size={13} />
									</button>
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
