import { createFileRoute } from '@tanstack/react-router';
import {
	Clapperboard,
	Crop,
	Download,
	Film,
	ImageIcon,
	Layers,
	Palette,
	Scissors,
	Settings2,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Video,
	Zap,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { EditorLanding } from '@/components/editor/EditorLanding.tsx';
import { EditorEmptyState, EditorShell } from '@/components/editor/index.ts';
import { GifAnalyzerPanel } from '@/components/gif/GifAnalyzerPanel.tsx';
import { GifAspectRatioPanel } from '@/components/gif/GifAspectRatioPanel.tsx';
import { GifCanvasPlayer } from '@/components/gif/GifCanvasPlayer.tsx';
import { GifCropPanel } from '@/components/gif/GifCropPanel.tsx';
import { GifExportPanel } from '@/components/gif/GifExportPanel.tsx';
import { GifFadePanel } from '@/components/gif/GifFadePanel.tsx';
import { GifFiltersPanel } from '@/components/gif/GifFiltersPanel.tsx';
import { GifFormatConvertPanel } from '@/components/gif/GifFormatConvertPanel.tsx';
import { GifFramesPanel } from '@/components/gif/GifFramesPanel.tsx';
import { GifImageOverlayPanel } from '@/components/gif/GifImageOverlayPanel.tsx';
import { GifInfoModal } from '@/components/gif/GifInfoModal.tsx';
import { GifMakerPanel } from '@/components/gif/GifMakerPanel.tsx';
import { GifOptimizePanel } from '@/components/gif/GifOptimizePanel.tsx';
import { GifPreviewOverlays } from '@/components/gif/GifPreviewOverlays.tsx';
import { GifResizePanel } from '@/components/gif/GifResizePanel.tsx';
import { GifRotatePanel } from '@/components/gif/GifRotatePanel.tsx';
import { GifSettingsPanel } from '@/components/gif/GifSettingsPanel.tsx';
import { GifTextOverlayPanel } from '@/components/gif/GifTextOverlayPanel.tsx';
import { GifToolbar } from '@/components/gif/GifToolbar.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection.tsx';
import { Button, Timeline } from '@/components/ui/index.ts';
import { ToolRail, type ToolRailItem } from '@/components/ui/ToolRail.tsx';
import { gifPresetEntries, GIF_ACCEPT } from '@/config/presets.ts';
import { useEditorLayoutPrefs } from '@/hooks/useEditorLayoutPrefs.ts';
import { useFrameStepController } from '@/hooks/useFrameStepController.ts';
import { useGifDecoder } from '@/hooks/useGifDecoder.ts';
import { useLongTaskObserver } from '@/hooks/useLongTaskObserver.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { usePanZoom } from '@/hooks/usePanZoom.ts';
import { usePendingActionConfirmation } from '@/hooks/usePendingActionConfirmation.ts';
import { usePreventUnload } from '@/hooks/usePreventUnload.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useTimelineScrubController } from '@/hooks/useTimelineScrubController.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { filtersAreDefault } from '@/modules/shared-core/types/filters.ts';
import { useEditorSessionStore } from '@/stores/editorSession.ts';
import { useGifEditorStore, type GifMode } from '@/stores/gifEditor.ts';
import { buildExportFilename } from '@/utils/exportFilename.ts';
import { formatFileSize } from '@/utils/format.ts';

/* ── SEO Landing Data ── */

const GIF_LANDING_FEATURES = [
	{
		icon: Zap,
		title: 'Optimize & Compress',
		description:
			'Reduce GIF file size dramatically while preserving visual quality. Perfect for sharing on Discord and social media.',
	},
	{
		icon: Scissors,
		title: 'Trim & Cut',
		description: 'Remove unwanted frames, trim start and end points, and keep only the best parts of your GIF.',
	},
	{
		icon: Palette,
		title: 'Colors & Filters',
		description: 'Adjust brightness, contrast, saturation, and apply creative filters with real-time preview.',
	},
	{
		icon: ShieldCheck,
		title: 'Privacy First',
		description: 'Your GIFs never leave your device. All processing runs locally in your browser via WebAssembly.',
	},
] as const;

const GIF_LANDING_FORMATS = ['GIF', 'APNG', 'WebP (animated)', 'MP4 (to GIF)'] as const;

const GIF_LANDING_FAQS = [
	{
		question: 'How do I reduce GIF file size?',
		answer: 'Use the Optimize panel to reduce colors, resize dimensions, adjust frame rate, and apply lossy compression. Vixely can often reduce GIF file sizes by 50-80% while maintaining good visual quality.',
	},
	{
		question: 'Can I trim a GIF?',
		answer: 'Yes. Use the timeline to set trim start and end points, then export to keep only the frames you want. You can also convert a video clip to GIF with custom timing.',
	},
	{
		question: 'What GIF formats are supported?',
		answer: 'Vixely supports GIF, APNG, and animated WebP. You can also convert video files (MP4, WebM, etc.) to GIF format with full control over quality and frame rate.',
	},
	{
		question: 'Is my GIF uploaded to a server?',
		answer: 'No. All GIF processing happens entirely in your browser using WebAssembly. Your files never leave your device — completely private.',
	},
] as const;

const GIF_CROSS_LINKS = [
	{
		title: 'Video Editor',
		subtitle: 'Trim, resize & export videos',
		href: '/tools/video' as const,
		icon: Video,
		accentBg: 'bg-blue-500/10',
		accentText: 'text-blue-400',
		borderTop: 'border-t-blue-500',
	},
	{
		title: 'Image Editor',
		subtitle: 'Crop, adjust & export images',
		href: '/tools/image' as const,
		icon: ImageIcon,
		accentBg: 'bg-amber-500/10',
		accentText: 'text-amber-400',
		borderTop: 'border-t-amber-500',
	},
] as const;

export const Route = createFileRoute('/tools/gif')({ component: GifFoundry });

const GIF_PRESETS = gifPresetEntries();

const ASPECT_RATIO_MAP: Record<string, number> = {
	'1:1': 1,
	'4:3': 4 / 3,
	'16:9': 16 / 9,
	'3:2': 3 / 2,
	'9:16': 9 / 16,
	'21:9': 21 / 9,
};
function parseAspectPreset(preset: string): number | undefined {
	return ASPECT_RATIO_MAP[preset];
}

function isGifFileLike(file: File): boolean {
	return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

/** Flat tool list for the GIF editor ToolRail */
const GIF_TOOLS: ToolRailItem<GifMode>[] = [
	{ id: 'settings', label: 'Settings', icon: Settings2 },
	{ id: 'transform', label: 'Transform', icon: Crop },
	{ id: 'filters', label: 'Filters', icon: SlidersHorizontal },
	{ id: 'overlays', label: 'Overlays', icon: Layers },
	{ id: 'effects', label: 'Effects', icon: Sparkles },
	{ id: 'frames', label: 'Frames', icon: Clapperboard },
	{ id: 'optimize', label: 'Optimize', icon: Zap },
	{ id: 'export', label: 'Export', icon: Download },
];
function GifFoundry() {
	useLongTaskObserver('gif-route');
	const { tier, setSidebarOpen } = useEditorLayoutPrefs({ editor: 'gif' });
	const { ready, processing, progress, error, createGif, extractGifFrames } = useVideoProcessor();
	const store = useGifEditorStore(
		useShallow((s) => ({
			mode: s.mode,
			speed: s.speed,
			reverse: s.reverse,
			colorReduction: s.colorReduction,
			loopCount: s.loopCount,
			crop: s.crop,
			rotation: s.rotation,
			flipH: s.flipH,
			flipV: s.flipV,
			filters: s.filters,
			compressionSpeed: s.compressionSpeed,
			frameSkip: s.frameSkip,
			dithering: s.dithering,
			extractedFrames: s.extractedFrames,
			textOverlays: s.textOverlays,
			imageOverlay: s.imageOverlay,
			fadeInDuration: s.fadeInDuration,
			fadeOutDuration: s.fadeOutDuration,
			fadeColor: s.fadeColor,
			convertFormat: s.convertFormat,
			aspectPreset: s.aspectPreset,
			aspectPaddingColor: s.aspectPaddingColor,
			zoom: s.zoom,
			panX: s.panX,
			panY: s.panY,
			setMode: s.setMode,
			resetAll: s.resetAll,
			setExtractedFrames: s.setExtractedFrames,
			clearExtractedFrames: s.clearExtractedFrames,
			setView: s.setView,
			zoomTo: s.zoomTo,
			fitToView: s.fitToView,
			resetView: s.resetView,
		})),
	);

	const [file, setFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useObjectUrlState();
	const [isGifSource, setIsGifSource] = useState(false);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(5);
	const [fps, setFps] = useState(15);
	const [width, setWidth] = useState(480);
	const [height, setHeight] = useState<number | null>(null);
	const [lockAspect, setLockAspect] = useState(true);
	const [sourceAspect, setSourceAspect] = useState(16 / 9);
	const [sourceWidth, setSourceWidth] = useState<number | null>(null);
	const [sourceHeight, setSourceHeight] = useState<number | null>(null);
	const [loop, setLoop] = useState(true);
	const [resultUrl, setResultUrl] = useObjectUrlState();
	const [resultSize, setResultSize] = useState(0);
	const [resultFileName, setResultFileName] = useState<string | null>(null);
	const [activePreview, setActivePreview] = useState<'source' | 'result'>('source');
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

	const [showInfo, setShowInfo] = useState(false);
	const [compareMode, setCompareMode] = useState(false);
	const [gifPaused, setGifPaused] = useState(false);
	const [gifCurrentFrame, setGifCurrentFrame] = useState(0);
	const gifPlayerRef = useRef<import('@/components/gif/GifCanvasPlayer.tsx').GifCanvasPlayerHandle>(null);
	const { isConfirmOpen, requestAction, confirmPendingAction, cancelPendingAction } = usePendingActionConfirmation(
		file !== null,
	);
	const setEditorUnsaved = useEditorSessionStore((s) => s.setUnsaved);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const previewContainerRef = useRef<HTMLDivElement>(null);

	// Decode GIF frames for canvas-based preview (speed, reverse, filters in real-time)
	const gifBlobUrl = isGifSource ? videoUrl : null;
	const { frames: gifFrames, supported: gifDecoderSupported } = useGifDecoder(gifBlobUrl);
	const hasDecodedFrames = gifDecoderSupported && gifFrames.length > 0;

	// Filter out deleted frames from preview when user has extracted and edited frames
	const previewFrames = useMemo(() => {
		if (store.extractedFrames.length === 0 || gifFrames.length === 0) return gifFrames;
		// Build a set of remaining frame indices from extracted frames
		// extractedFrames indices are re-indexed after deletion, but we track original count
		if (store.extractedFrames.length === gifFrames.length) return gifFrames;
		// When some frames were deleted, only keep the frames at positions matching extracted frame indices
		// Since extracted frames are re-indexed after deletion, use the count as a signal
		const keepCount = store.extractedFrames.length;
		if (keepCount >= gifFrames.length) return gifFrames;
		// Evenly sample from original frames to match the remaining count
		const step = gifFrames.length / keepCount;
		const filtered = [];
		for (let i = 0; i < keepCount; i++) {
			filtered.push(gifFrames[Math.round(i * step)]!);
		}
		return filtered;
	}, [gifFrames, store.extractedFrames]);

	// Zoom/pan
	const zoomView = useMemo(
		() => ({ panX: store.panX, panY: store.panY, zoom: store.zoom }),
		[store.panX, store.panY, store.zoom],
	);
	// Disable left-click pan when crop is active so drag gestures control the crop overlay
	const hasCropActive = store.crop != null && store.mode === 'transform';
	usePanZoom({
		containerRef: previewContainerRef,
		view: zoomView,
		setView: store.setView,
		zoomTo: store.zoomTo,
		enabled: !!videoUrl,
		leftClickPan: !hasCropActive,
		attachKey: videoUrl,
	});

	// Stable refs for zoom callbacks — avoids stale closures & effect re-runs
	const fitToViewRef = useRef(store.fitToView);
	fitToViewRef.current = store.fitToView;
	const zoomToRef = useRef(store.zoomTo);
	zoomToRef.current = store.zoomTo;
	const zoomRef = useRef(store.zoom);
	zoomRef.current = store.zoom;

	const handleToggleGifPause = useCallback(() => {
		setGifPaused((prev) => !prev);
	}, []);

	const handleGifStepFrame = useCallback(
		(dir: -1 | 1) => {
			const total = previewFrames.length;
			if (total === 0) return;
			setGifPaused(true);
			const next = (((gifCurrentFrame + dir) % total) + total) % total;
			setGifCurrentFrame(next);
			gifPlayerRef.current?.stepTo(next);
		},
		[previewFrames.length, gifCurrentFrame],
	);

	const handleZoomIn = useCallback(() => {
		const el = previewContainerRef.current;
		if (!el) return;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		zoomToRef.current(Math.min(10, zoomRef.current * 1.25), cx, cy);
	}, []);

	const handleZoomOut = useCallback(() => {
		const el = previewContainerRef.current;
		if (!el) return;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		zoomToRef.current(Math.max(0.1, zoomRef.current / 1.25), cx, cy);
	}, []);

	const handleFitToScreen = useCallback(() => {
		const el = previewContainerRef.current;
		if (!el) return;
		const w = sourceWidth ?? 480;
		const h = sourceHeight ?? 270;
		fitToViewRef.current(el.clientWidth, el.clientHeight, w, h);
	}, [sourceWidth, sourceHeight]);

	// Auto-fit when source dimensions change (file loaded) or container first becomes visible
	useEffect(() => {
		if (!sourceWidth || !sourceHeight) return;
		const el = previewContainerRef.current;
		if (!el) return;

		const fit = () => {
			const cw = el.clientWidth;
			const ch = el.clientHeight;
			if (cw > 0 && ch > 0) {
				fitToViewRef.current(cw, ch, sourceWidth, sourceHeight);
			}
		};

		fit();

		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width: w, height: h } = entry.contentRect;
			if (w > 0 && h > 0) {
				fitToViewRef.current(w, h, sourceWidth, sourceHeight);
				ro.disconnect();
			}
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
		};
	}, [sourceWidth, sourceHeight]);

	// Live CSS preview for filters + rotation/flip
	const previewStyle = useMemo((): React.CSSProperties => {
		const f = store.filters;
		const parts: string[] = [];
		const brightness = (f.exposure ?? 1) * (1 + (f.brightness ?? 0));
		if (Math.abs(brightness - 1) > 0.01) parts.push(`brightness(${brightness.toFixed(3)})`);
		if (Math.abs((f.contrast ?? 1) - 1) > 0.01) parts.push(`contrast(${(f.contrast ?? 1).toFixed(3)})`);
		if (Math.abs((f.saturation ?? 1) - 1) > 0.01) parts.push(`saturate(${(f.saturation ?? 1).toFixed(3)})`);
		if (Math.abs(f.hue ?? 0) > 0.5) parts.push(`hue-rotate(${(f.hue ?? 0).toFixed(1)}deg)`);
		if ((f.sepia ?? 0) > 0.01) parts.push(`sepia(${(f.sepia ?? 0).toFixed(3)})`);
		if ((f.blur ?? 0) > 0.1) parts.push(`blur(${(f.blur ?? 0).toFixed(2)}px)`);

		const transforms: string[] = [];
		if (store.rotation !== 0) transforms.push(`rotate(${store.rotation}deg)`);
		if (store.flipH) transforms.push('scaleX(-1)');
		if (store.flipV) transforms.push('scaleY(-1)');

		return {
			filter: parts.length > 0 ? parts.join(' ') : undefined,
			transform: transforms.length > 0 ? transforms.join(' ') : undefined,
			transition: 'filter 0.15s, transform 0.15s',
		};
	}, [store.filters, store.rotation, store.flipH, store.flipV]);

	const isDirty = file !== null;
	usePreventUnload(isDirty || processing);

	useEffect(() => {
		setEditorUnsaved('gif', isDirty);
		return () => {
			setEditorUnsaved('gif', false);
		};
	}, [isDirty, setEditorUnsaved]);
	const videoFps = Math.max(1, fps);
	const frameDuration = 1 / videoFps;
	const minTrimDuration = frameDuration;
	const totalFrames = Math.max(0, Math.ceil(duration * videoFps));

	const timeToFrames = useCallback(
		(time: number) => {
			if (!Number.isFinite(time) || time <= 0) return 0;
			return Math.max(0, Math.round(time * videoFps));
		},
		[videoFps],
	);

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

	const handleNew = useCallback(() => {
		requestAction(() => {
			setFile(null);
			setVideoUrl(null);
			setIsGifSource(false);
			setDuration(0);
			setCurrentTime(0);
			setTrimStart(0);
			setTrimEnd(5);
			setFps(15);
			setWidth(480);
			setHeight(null);
			setLockAspect(true);
			setSourceAspect(16 / 9);
			setSourceWidth(null);
			setSourceHeight(null);
			setLoop(true);
			setResultUrl(null);
			setResultSize(0);
			setResultFileName(null);
			setActivePreview('source');
			store.resetAll();
		});
	}, [requestAction, store, setResultUrl, setVideoUrl]);

	/* ── File Handling ── */
	const handleFile = useCallback(
		(f: File) => {
			if (!isGifFileLike(f)) {
				toast.error('Invalid file type', { description: 'Choose a GIF file (.gif)' });
				return;
			}

			setFile(f);
			setResultUrl(null);
			setResultSize(0);
			setResultFileName(null);
			setActivePreview('source');
			setSourceWidth(null);
			setSourceHeight(null);

			const gifSource = f.type === 'image/gif' || f.name.toLowerCase().endsWith('.gif');
			setIsGifSource(gifSource);
			setVideoUrl(URL.createObjectURL(f));

			if (gifSource) {
				const probeUrl = URL.createObjectURL(f);
				const probeImage = new Image();
				probeImage.onload = () => {
					const nextWidth = probeImage.naturalWidth || 0;
					const nextHeight = probeImage.naturalHeight || 0;
					if (nextWidth > 0 && nextHeight > 0) {
						setSourceWidth(nextWidth);
						setSourceHeight(nextHeight);
						setSourceAspect(nextWidth / nextHeight);
					}
					URL.revokeObjectURL(probeUrl);
				};
				probeImage.onerror = () => {
					URL.revokeObjectURL(probeUrl);
				};
				probeImage.src = probeUrl;

				setDuration(10);
				setTrimStart(0);
				setTrimEnd(5);
			}

			toast.success('GIF loaded', { description: f.name });
		},
		[setResultUrl, setVideoUrl],
	);

	const handleVideoLoaded = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const dur = video.duration;
		setDuration(dur);
		setTrimStart(0);
		setTrimEnd(Math.min(5, dur));
		setCurrentTime(0);
		if (video.videoWidth > 0 && video.videoHeight > 0) {
			setSourceAspect(video.videoWidth / video.videoHeight);
			setSourceWidth(video.videoWidth);
			setSourceHeight(video.videoHeight);
		}
	}, []);
	const { clampToTrim, handleSeek, handleTimelineScrubStart, handleTimelineScrubEnd, handleTimeUpdate } =
		useTimelineScrubController({ videoRef, trimStart, trimEnd, processing, setCurrentTime });
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
		acceptFile: isGifFileLike,
		onRejectedFile: () => {
			toast.error('Invalid file type', { description: 'Drop a GIF file (.gif)' });
		},
	});

	const togglePlaybackInTrim = useCallback(() => {
		const video = videoRef.current;
		if (!video || processing || isGifSource) return;
		if (video.paused) {
			if (video.currentTime < trimStart || video.currentTime >= trimEnd - frameDuration / 2) {
				video.currentTime = trimStart;
				setCurrentTime(trimStart);
			}
			void video.play().catch(() => {});
			return;
		}
		video.pause();
	}, [frameDuration, isGifSource, processing, trimEnd, trimStart]);

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
				if (isGifSource && hasDecodedFrames) {
					handleToggleGifPause();
				} else {
					togglePlaybackInTrim();
				}
			}
			if (isGifSource && hasDecodedFrames) {
				if (e.key === 'ArrowLeft') {
					e.preventDefault();
					handleGifStepFrame(-1);
				} else if (e.key === 'ArrowRight') {
					e.preventDefault();
					handleGifStepFrame(1);
				}
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [togglePlaybackInTrim, isGifSource, hasDecodedFrames, handleToggleGifPause, handleGifStepFrame]);

	/* ── Resize Handlers ── */
	const handleWidthChange = useCallback(
		(w: number) => {
			setWidth(w);
			if (lockAspect) {
				setHeight(Math.round(w / sourceAspect));
			}
		},
		[lockAspect, sourceAspect],
	);

	const handleHeightChange = useCallback(
		(h: number) => {
			setHeight(h);
			if (lockAspect) {
				setWidth(Math.round(h * sourceAspect));
			}
		},
		[lockAspect, sourceAspect],
	);

	/* ── Presets ── */
	const applyPreset = useCallback(
		(key: string) => {
			const preset = GIF_PRESETS.find(([k]) => k === key);
			if (!preset) return;
			const [, cfg] = preset;
			setFps(cfg.fps);
			setWidth(cfg.width);
			if (lockAspect) setHeight(Math.round(cfg.width / sourceAspect));
			if (cfg.maxDuration != null) {
				setTrimEnd(Math.min(trimStart + cfg.maxDuration, duration || cfg.maxDuration));
			}
			toast(`Applied "${cfg.name}"`);
		},
		[trimStart, duration, lockAspect, sourceAspect],
	);

	/* ── Extract Frames ── */
	const handleExtractFrames = useCallback(async () => {
		if (!file) return;
		toast('Extracting frames...');
		store.clearExtractedFrames();
		const clipDuration = Math.max(trimEnd - trimStart, 0.5);
		try {
			const frames = await extractGifFrames({
				file,
				fps,
				width,
				height: height ?? undefined,
				startTime: trimStart > 0 ? trimStart : undefined,
				duration: clipDuration,
				speed: store.speed !== 1 ? store.speed : undefined,
				reverse: store.reverse || undefined,
				thumbWidth: 120,
			});
			const defaultDelay = Math.round(100 / fps);
			const extractedFrames = frames.map((f) => ({
				index: f.index,
				url: URL.createObjectURL(f.blob),
				width: f.width,
				height: f.height,
				timeMs: f.timeMs,
				delayCentiseconds: defaultDelay,
				selected: false,
			}));
			store.setExtractedFrames(extractedFrames);
			toast.success(`Extracted ${extractedFrames.length} frames`);
		} catch {
			toast.error('Frame extraction failed');
		}
	}, [file, fps, width, height, trimStart, trimEnd, store, extractGifFrames]);

	/* ── Generate ── */
	const handleGenerate = useCallback(async () => {
		if (!file) return;

		toast('Generating GIF...');
		const clipDuration = Math.max(trimEnd - trimStart, 0.5);

		// Apply frame skip to FPS
		let effectiveFps = fps;
		if (store.frameSkip === 'every2nd') effectiveFps = Math.max(1, Math.round(fps / 2));
		else if (store.frameSkip === 'every3rd') effectiveFps = Math.max(1, Math.round(fps / 3));
		else if (store.frameSkip === 'every4th') effectiveFps = Math.max(1, Math.round(fps / 4));

		// Crop params (passed to worker for per-frame crop)
		const cropParams = store.crop
			? {
					cropX: Math.round(store.crop.x),
					cropY: Math.round(store.crop.y),
					cropW: Math.round(store.crop.width),
					cropH: Math.round(store.crop.height),
				}
			: {};

		// Filter params
		const f = store.filters;
		const filterParams = {
			filterExposure: f.exposure !== 1 ? f.exposure : undefined,
			filterBrightness: f.brightness !== 0 ? f.brightness : undefined,
			filterContrast: f.contrast !== 1 ? f.contrast : undefined,
			filterSaturation: f.saturation !== 1 ? f.saturation : undefined,
			filterHue: f.hue !== 0 ? f.hue : undefined,
			filterSepia: f.sepia !== 0 ? f.sepia : undefined,
			filterBlur: f.blur !== 0 ? f.blur : undefined,
			filterHighlights: f.highlights !== 0 ? f.highlights : undefined,
			filterShadows: f.shadows !== 0 ? f.shadows : undefined,
			filterTemperature: f.temperature !== 0 ? f.temperature : undefined,
			filterTint: f.tint !== 0 ? f.tint : undefined,
			filterVignette: f.vignette !== 0 ? f.vignette : undefined,
			filterGrain: f.grain !== 0 ? f.grain : undefined,
		};

		// Text overlays
		const textOverlays =
			store.textOverlays.length > 0
				? store.textOverlays.map((o) => ({
						text: o.text,
						x: o.x,
						y: o.y,
						fontSize: o.fontSize,
						fontFamily: o.fontFamily,
						color: o.color,
						outlineColor: o.outlineColor,
						outlineWidth: o.outlineWidth,
						opacity: o.opacity,
					}))
				: undefined;

		// Image overlay
		const hasImageOverlay = store.imageOverlay.file !== null;
		let imageOverlayBlob: Blob | undefined;
		if (hasImageOverlay && store.imageOverlay.file) {
			imageOverlayBlob = store.imageOverlay.file;
		}

		// Fade — convert seconds to frame count
		const fadeInFrames =
			store.fadeInDuration > 0 ? Math.max(1, Math.round(store.fadeInDuration * effectiveFps)) : undefined;
		const fadeOutFrames =
			store.fadeOutDuration > 0 ? Math.max(1, Math.round(store.fadeOutDuration * effectiveFps)) : undefined;

		// Per-frame delays from frame editor (if frames have been extracted and edited)
		const frameDelaysCs =
			store.extractedFrames.length > 0 ? store.extractedFrames.map((f) => f.delayCentiseconds) : undefined;

		try {
			const data = await createGif({
				file,
				fps: effectiveFps,
				width,
				height: height ?? undefined,
				startTime: trimStart > 0 ? trimStart : undefined,
				duration: clipDuration,
				speed: store.speed !== 1 ? store.speed : undefined,
				reverse: store.reverse || undefined,
				maxColors: store.colorReduction,
				loopCount: store.loopCount,
				compressionSpeed: store.compressionSpeed,
				frameDelaysCs,
				...cropParams,
				rotation: store.rotation !== 0 ? store.rotation : undefined,
				flipH: store.flipH || undefined,
				flipV: store.flipV || undefined,
				...filterParams,
				textOverlays,
				imageOverlayBlob,
				imageOverlayX: hasImageOverlay ? store.imageOverlay.x : undefined,
				imageOverlayY: hasImageOverlay ? store.imageOverlay.y : undefined,
				imageOverlayWidth: hasImageOverlay ? store.imageOverlay.width : undefined,
				imageOverlayHeight: hasImageOverlay ? store.imageOverlay.height : undefined,
				imageOverlayOpacity: hasImageOverlay ? store.imageOverlay.opacity : undefined,
				fadeInFrames,
				fadeOutFrames,
				fadeColor: store.fadeInDuration > 0 || store.fadeOutDuration > 0 ? store.fadeColor : undefined,
				aspectRatio: store.aspectPreset !== 'free' ? parseAspectPreset(store.aspectPreset) : undefined,
				aspectPaddingColor: store.aspectPreset !== 'free' ? store.aspectPaddingColor : undefined,
			});

			const blob = new Blob([new Uint8Array(data)], { type: 'image/gif' });
			const downloadName = buildExportFilename(file.name, 'gif');
			setResultSize(blob.size);
			setResultUrl(URL.createObjectURL(blob));
			setResultFileName(downloadName);
			setActivePreview('result');
			toast.success('GIF ready', { description: formatFileSize(blob.size) });
		} catch {
			toast.error('Generation failed');
		}
	}, [file, fps, width, height, trimStart, trimEnd, store, createGif, setResultUrl]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = resultFileName ?? buildExportFilename(file?.name, 'gif');
		a.click();
	}, [resultUrl, resultFileName, file]);

	/* ── Computed ── */
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const estimatedFrames = Math.ceil(clipDuration * fps);
	const outputHeight = height ?? Math.round(width / sourceAspect);
	const canShowResultPreview = Boolean(resultUrl) && !processing;
	const showingResult = canShowResultPreview && activePreview === 'result';

	useEffect(() => {
		if (!canShowResultPreview && activePreview === 'result') {
			setActivePreview('source');
		}
	}, [activePreview, canShowResultPreview]);

	const isMobile = tier === 'mobile';
	const isTablet = tier === 'tablet';
	const hasResizeChanges =
		sourceWidth != null && sourceHeight != null && (width !== sourceWidth || outputHeight !== sourceHeight);
	const toolActivity: Record<GifMode, boolean> = {
		settings:
			store.speed !== 1 ||
			store.reverse ||
			store.colorReduction !== 256 ||
			store.loopCount !== 0 ||
			fps !== 15 ||
			!loop ||
			trimStart > 0 ||
			trimEnd < duration,
		transform:
			store.crop != null ||
			hasResizeChanges ||
			!lockAspect ||
			store.rotation !== 0 ||
			store.flipH ||
			store.flipV ||
			store.aspectPreset !== 'free',
		filters: !filtersAreDefault(store.filters),
		overlays: store.textOverlays.length > 0 || store.imageOverlay.file != null,
		effects: store.fadeInDuration > 0 || store.fadeOutDuration > 0,
		frames: store.extractedFrames.length > 0,
		optimize: store.compressionSpeed !== 10 || store.frameSkip !== 'none' || !store.dithering,
		export: false,
	};
	const hasChanges = Object.values(toolActivity).some(Boolean);

	const gifToolItems: ToolRailItem<GifMode>[] = useMemo(
		() => GIF_TOOLS.map((tool) => ({ ...tool, hasActivity: toolActivity[tool.id] })),
		[toolActivity],
	);

	const handleToolChange = useCallback(
		(toolId: GifMode) => {
			store.setMode(toolId);
			if (isMobile) setSidebarOpen(true);
		},
		[store.setMode, isMobile, setSidebarOpen],
	);

	const handleToolToggle = useCallback(
		(toolId: GifMode) => {
			if (store.mode === toolId) {
				if (isMobile) setSidebarOpen(false);
			} else {
				store.setMode(toolId);
				if (isMobile) setSidebarOpen(true);
			}
		},
		[store.mode, store.setMode, isMobile, setSidebarOpen],
	);

	const gifToolRail = (
		<ToolRail
			items={gifToolItems}
			activeId={store.mode}
			onChange={isTablet || isMobile ? handleToolToggle : handleToolChange}
			direction={isTablet ? 'vertical' : 'horizontal'}
			ariaLabel="GIF editor tools"
		/>
	);

	const modePanel = useMemo(() => {
		switch (store.mode) {
			case 'settings':
				return (
					<GifSettingsPanel
						fps={fps}
						onFpsChange={setFps}
						loop={loop}
						onLoopChange={setLoop}
						isGifSource={isGifSource}
						trimStart={trimStart}
						trimEnd={trimEnd}
						onTrimStartChange={setTrimStart}
						onTrimEndChange={setTrimEnd}
						duration={duration}
						selectedPreset={selectedPreset}
						onSelectPreset={setSelectedPreset}
						onApplyPreset={applyPreset}
					/>
				);
			case 'transform':
				return (
					<>
						<CollapsibleSection title="Crop" changeCount={store.crop ? 1 : 0}>
							<GifCropPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
						</CollapsibleSection>
						<CollapsibleSection title="Resize" changeCount={hasResizeChanges ? 1 : 0}>
							<GifResizePanel
								width={width}
								height={height}
								lockAspect={lockAspect}
								sourceAspect={sourceAspect}
								onWidthChange={handleWidthChange}
								onHeightChange={handleHeightChange}
								onLockAspectChange={setLockAspect}
							/>
						</CollapsibleSection>
						<CollapsibleSection
							title="Rotate & Flip"
							changeCount={(store.rotation !== 0 ? 1 : 0) + (store.flipH ? 1 : 0) + (store.flipV ? 1 : 0)}
						>
							<GifRotatePanel />
						</CollapsibleSection>
						<CollapsibleSection
							title="Aspect Ratio"
							changeCount={store.aspectPreset !== 'free' ? 1 : 0}
							defaultCollapsed
						>
							<GifAspectRatioPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
						</CollapsibleSection>
					</>
				);
			case 'filters':
				return <GifFiltersPanel />;
			case 'overlays':
				return (
					<>
						<CollapsibleSection title="Text" changeCount={store.textOverlays.length}>
							<GifTextOverlayPanel />
						</CollapsibleSection>
						<CollapsibleSection title="Image" changeCount={store.imageOverlay.file ? 1 : 0}>
							<GifImageOverlayPanel />
						</CollapsibleSection>
					</>
				);
			case 'effects':
				return <GifFadePanel />;
			case 'frames':
				return (
					<>
						<GifFramesPanel
							file={file}
							processing={processing}
							progress={progress}
							onExtractFrames={() => {
								void handleExtractFrames();
							}}
						/>
						{store.extractedFrames.length > 0 && (
							<CollapsibleSection title="Reorder & Create">
								<GifMakerPanel />
							</CollapsibleSection>
						)}
					</>
				);
			case 'optimize':
				return <GifOptimizePanel />;
			case 'export':
				return (
					<>
						<GifExportPanel
							file={file}
							ready={ready}
							processing={processing}
							progress={progress}
							error={error}
							estimatedFrames={estimatedFrames}
							clipDuration={clipDuration}
							width={width}
							outputHeight={outputHeight}
							resultUrl={resultUrl}
							resultSize={resultSize}
							onGenerate={() => {
								void handleGenerate();
							}}
							onDownload={handleDownload}
						/>
						<CollapsibleSection title="Convert Format" defaultCollapsed>
							<GifFormatConvertPanel file={file} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
						</CollapsibleSection>
						{file && (
							<CollapsibleSection title="Analyze" defaultCollapsed>
								<GifAnalyzerPanel file={file} />
							</CollapsibleSection>
						)}
					</>
				);
			default:
				return null;
		}
	}, [
		store.mode,
		fps,
		loop,
		isGifSource,
		trimStart,
		trimEnd,
		duration,
		applyPreset,
		sourceWidth,
		sourceHeight,
		width,
		height,
		lockAspect,
		sourceAspect,
		handleWidthChange,
		handleHeightChange,
		file,
		processing,
		progress,
		handleExtractFrames,
		ready,
		error,
		estimatedFrames,
		clipDuration,
		outputHeight,
		resultUrl,
		resultSize,
		handleGenerate,
		handleDownload,
	]);

	/* ── Sidebar Content ── */
	const sidebarContent = (
		<>
			<div
				className="p-3 flex flex-col gap-4 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden animate-panel-crossfade"
				key={store.mode}
			>
				{modePanel}
			</div>

			{store.mode !== 'export' && (
				<div className="p-3 border-t border-border flex flex-col gap-2 bg-surface-raised/10">
					<div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
						<Palette size={11} />
						<span>Quick Export</span>
					</div>
					<Button
						className="w-full"
						disabled={!file || !ready || processing}
						onClick={() => {
							void handleGenerate();
						}}
					>
						{processing ? `Generating ${Math.round(progress * 100)}%` : 'Generate GIF'}
					</Button>

					{resultUrl && (
						<Button
							variant="secondary"
							className="w-full"
							onClick={() => {
								handleDownload();
							}}
						>
							Download ({formatFileSize(resultSize)})
						</Button>
					)}

					{error && <p className="text-[14px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}
				</div>
			)}
		</>
	);

	return (
		<>
			<Seo
				title="Free Online GIF Editor — Vixely"
				description="Create, edit, crop, resize, rotate, optimize and convert GIFs with filters and effects — entirely in your browser. No upload required."
				path="/tools/gif"
				jsonLd={[
					buildWebAppSchema(
						'Vixely GIF Editor',
						'Create, edit, crop, resize, rotate, optimize and convert GIFs — entirely in your browser.',
						'https://vixely.app/tools/gif',
					),
					buildFAQSchema(GIF_LANDING_FAQS.map((f) => ({ question: f.question, answer: f.answer }))),
				]}
			/>
			<h1 className="sr-only">GIF Editor</h1>
			<input
				ref={fileInputRef}
				type="file"
				accept={GIF_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleFile(f);
					e.currentTarget.value = '';
				}}
			/>

			<EditorShell
				editor="gif"
				hasFile={file !== null}
				sidebarLabel="gif inspector"
				toolRail={file ? gifToolRail : undefined}
				toolPanelOpen={isTablet && file !== null}
				main={
					<>
						{file && (
							<GifToolbar
								file={file}
								processing={processing}
								sourceWidth={sourceWidth}
								sourceHeight={sourceHeight}
								duration={duration}
								currentFrame={isGifSource ? gifCurrentFrame : timeToFrames(currentTime)}
								totalFrames={isGifSource ? previewFrames.length : totalFrames}
								isGifSource={isGifSource}
								gifPaused={gifPaused}
								onToggleGifPause={handleToggleGifPause}
								onGifStepFrame={handleGifStepFrame}
								compareMode={compareMode}
								hasChanges={hasChanges}
								onToggleCompare={() => {
									setCompareMode((prev) => !prev);
								}}
								onOpenFile={() => {
									fileInputRef.current?.click();
								}}
								onNew={handleNew}
								onStepFrame={stepCurrentFrame}
								onStartFrameHold={startFrameHold}
								onStopFrameHold={stopFrameHold}
								onShowInfo={() => {
									setShowInfo(true);
								}}
								zoom={store.zoom}
								onZoomIn={handleZoomIn}
								onZoomOut={handleZoomOut}
								onFitToScreen={handleFitToScreen}
							/>
						)}
						{videoUrl ? (
							<div
								ref={previewContainerRef}
								className="flex-1 min-h-0 relative overflow-hidden workspace-bg"
								style={{ touchAction: 'none' }}
								{...dropHandlers}
							>
								{/* Source/Result toggle — fixed above the zoomable area */}
								{canShowResultPreview && (
									<div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center rounded-lg border border-border/60 bg-bg/80 backdrop-blur-sm p-0.5">
										<button
											onClick={() => {
												setActivePreview('source');
											}}
											className={`rounded-md px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
												!showingResult
													? 'bg-accent/15 text-accent'
													: 'text-text-tertiary hover:text-text-secondary'
											}`}
										>
											Source
										</button>
										<button
											onClick={() => {
												setActivePreview('result');
											}}
											className={`rounded-md px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
												showingResult
													? 'bg-accent/15 text-accent'
													: 'text-text-tertiary hover:text-text-secondary'
											}`}
										>
											Result
										</button>
									</div>
								)}

								{/* Zoomable / pannable layer */}
								<div
									className="absolute top-0 left-0 pointer-events-none"
									style={{
										width: sourceWidth ?? undefined,
										height: sourceHeight ?? undefined,
										transform: `translate(${store.panX}px, ${store.panY}px) scale(${store.zoom})`,
										transformOrigin: '0 0',
										position: 'relative',
									}}
								>
									{showingResult && resultUrl ? (
										<img
											src={resultUrl}
											alt="Generated GIF"
											width={width}
											height={outputHeight}
											className="rounded-lg bg-black"
											draggable={false}
										/>
									) : isGifSource && hasDecodedFrames ? (
										<GifCanvasPlayer
											ref={gifPlayerRef}
											frames={previewFrames}
											filters={store.filters}
											fps={fps}
											speed={store.speed}
											reverse={store.reverse}
											paused={gifPaused}
											onFrameChange={setGifCurrentFrame}
											width={sourceWidth ?? 480}
											height={sourceHeight ?? 270}
											fadeInDuration={store.fadeInDuration}
											fadeOutDuration={store.fadeOutDuration}
											style={previewStyle}
											className="rounded-lg bg-black"
										/>
									) : isGifSource ? (
										<img
											src={videoUrl}
											alt="GIF source"
											width={sourceWidth ?? undefined}
											height={sourceHeight ?? undefined}
											style={previewStyle}
											className="rounded-lg bg-black"
											draggable={false}
										/>
									) : (
										<video
											ref={videoRef}
											src={videoUrl}
											onLoadedMetadata={handleVideoLoaded}
											onTimeUpdate={handleTimeUpdate}
											loop={loop}
											style={previewStyle}
											className="rounded-lg bg-black pointer-events-auto"
										/>
									)}

									{/* Overlays: crop mask, text, image overlay, aspect ratio bars */}
									{sourceWidth != null && sourceHeight != null && !showingResult && (
										<GifPreviewOverlays sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
									)}
								</div>

								{/* Status badges — fixed overlay */}
								{showingResult ? (
									<div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
										<p className="text-[13px] text-success font-medium bg-bg/80 backdrop-blur-sm rounded-lg px-3 py-1.5">
											Result size: {formatFileSize(resultSize)}
										</p>
									</div>
								) : (
									(store.rotation !== 0 ||
										store.flipH ||
										store.flipV ||
										store.crop ||
										hasResizeChanges) && (
										<div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 flex-wrap justify-center">
											{hasResizeChanges && (
												<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent backdrop-blur-sm font-mono tabular-nums">
													{width}×{outputHeight}
												</span>
											)}
											{store.rotation !== 0 && (
												<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent backdrop-blur-sm">
													Rotate {store.rotation}°
												</span>
											)}
											{store.flipH && (
												<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent backdrop-blur-sm">
													Flip H
												</span>
											)}
											{store.flipV && (
												<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent backdrop-blur-sm">
													Flip V
												</span>
											)}
											{store.crop && (
												<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent backdrop-blur-sm">
													Crop {Math.round(store.crop.width)}×{Math.round(store.crop.height)}
												</span>
											)}
										</div>
									)
								)}

								{/* Processing overlay */}
								{processing && (
									<div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
										<div className="w-full max-w-sm rounded-xl border border-border/70 bg-bg/60 backdrop-blur-sm px-4 py-3 flex flex-col items-center">
											<div className="h-9 w-9 rounded-full border-[3px] border-border border-t-accent animate-spin" />
											<p className="mt-2 text-sm font-medium">{Math.round(progress * 100)}%</p>
											<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised">
												<div
													className="h-full bg-accent transition-all duration-300"
													style={{ width: `${progress * 100}%` }}
												/>
											</div>
											<p className="mt-2 text-[12px] text-text-tertiary">Optimizing palette...</p>
										</div>
									</div>
								)}

								{/* Drag overlay when file is loaded */}
								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
										<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
											Drop to replace GIF
										</div>
									</div>
								)}
							</div>
						) : (
							<EditorLanding
								emptyState={
									<EditorEmptyState
										icon={Film}
										variant="hero"
										isDragging={isDragging}
										title="No GIF loaded"
										description="Drop a GIF or click to get started"
										dragTitle="Drop your GIF here"
										dragDescription="Release to load"
										onChooseFile={() => fileInputRef.current?.click()}
										formatHints={['GIF', 'APNG', 'WebP']}
									/>
								}
								dropHandlers={dropHandlers}
								isDragging={isDragging}
								hasFile={false}
								replaceLabel="Drop your GIF here"
								features={[...GIF_LANDING_FEATURES]}
								formats={GIF_LANDING_FORMATS}
								formatColor="bg-emerald-400"
								faqs={[...GIF_LANDING_FAQS]}
								crossLinks={[...GIF_CROSS_LINKS]}
							/>
						)}
					</>
				}
				timeline={
					!isGifSource && duration > 0 ? (
						<div className="border-t border-border bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(9,9,11,0.98)_100%)] px-3 py-2 sm:px-4 sm:py-2.5">
							<Timeline
								duration={duration}
								trimStart={trimStart}
								trimEnd={trimEnd}
								currentTime={currentTime}
								density="compact"
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
							/>
						</div>
					) : undefined
				}
				sidebar={file ? sidebarContent : undefined}
				overlays={
					<>
						{/* File info modal */}
						{showInfo && file && (
							<GifInfoModal
								file={file}
								width={sourceWidth}
								height={sourceHeight}
								duration={duration}
								fps={fps}
								frameCount={estimatedFrames}
								isGifSource={isGifSource}
								onClose={() => {
									setShowInfo(false);
								}}
							/>
						)}

						{/* Confirm reset modal */}
						{isConfirmOpen && (
							<ConfirmResetModal onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />
						)}
					</>
				}
			/>
		</>
	);
}
