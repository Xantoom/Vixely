import { createFileRoute } from '@tanstack/react-router';
import {
	Clapperboard,
	Download,
	Film,
	FilePlus2,
	Info,
	Palette,
	Settings,
	SlidersHorizontal,
	Sparkles,
	StepBack,
	StepForward,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { FileMetadataModal } from '@/components/FileMetadataModal.tsx';
import { GifAnalyzerPanel } from '@/components/gif/GifAnalyzerPanel.tsx';
import { GifAspectRatioPanel } from '@/components/gif/GifAspectRatioPanel.tsx';
import { GifCropPanel } from '@/components/gif/GifCropPanel.tsx';
import { GifExportPanel } from '@/components/gif/GifExportPanel.tsx';
import { GifFadePanel } from '@/components/gif/GifFadePanel.tsx';
import { GifFiltersPanel } from '@/components/gif/GifFiltersPanel.tsx';
import { GifFormatConvertPanel } from '@/components/gif/GifFormatConvertPanel.tsx';
import { GifFramesPanel } from '@/components/gif/GifFramesPanel.tsx';
import { GifImageOverlayPanel } from '@/components/gif/GifImageOverlayPanel.tsx';
import { GifMakerPanel } from '@/components/gif/GifMakerPanel.tsx';
import { GifOptimizePanel } from '@/components/gif/GifOptimizePanel.tsx';
import { GifResizePanel } from '@/components/gif/GifResizePanel.tsx';
import { GifRotatePanel } from '@/components/gif/GifRotatePanel.tsx';
import { GifSettingsPanel } from '@/components/gif/GifSettingsPanel.tsx';
import { GifTextOverlayPanel } from '@/components/gif/GifTextOverlayPanel.tsx';
import { Seo } from '@/components/Seo.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Timeline, formatCompactTime } from '@/components/ui/index.ts';
import { gifPresetEntries, GIF_ACCEPT } from '@/config/presets.ts';
import { useFrameStepController } from '@/hooks/useFrameStepController.ts';
import { useLongTaskObserver } from '@/hooks/useLongTaskObserver.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { usePendingActionConfirmation } from '@/hooks/usePendingActionConfirmation.ts';
import { usePreventUnload } from '@/hooks/usePreventUnload.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useTimelineScrubController } from '@/hooks/useTimelineScrubController.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useGifEditorStore, type GifMode } from '@/stores/gifEditor.ts';
import { buildExportFilename } from '@/utils/exportFilename.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

export const Route = createFileRoute('/tools/gif')({ component: GifFoundry });

const GIF_PRESETS = gifPresetEntries();
const VIDEO_FILENAME_RE = /\.(mp4|mkv|webm|mov|m4v|avi|mts|m2ts|ts)$/i;

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

function isGifEditorFileLike(file: File): boolean {
	return (
		file.type.startsWith('video/') ||
		file.type === 'image/gif' ||
		file.name.toLowerCase().endsWith('.gif') ||
		VIDEO_FILENAME_RE.test(file.name)
	);
}

type SidebarSectionId = 'setup' | 'style' | 'timing' | 'output';

interface SidebarTool {
	mode: GifMode;
	label: string;
	description: string;
}

interface SidebarSection {
	id: SidebarSectionId;
	label: string;
	description: string;
	icon: typeof Settings;
	tools: SidebarTool[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
	{
		id: 'setup',
		label: 'Setup',
		description: 'Define source timing and base geometry.',
		icon: SlidersHorizontal,
		tools: [
			{ mode: 'settings', label: 'Settings', description: 'Speed, loop, presets and trim defaults.' },
			{ mode: 'crop', label: 'Crop', description: 'Cut framing to the exact focus area.' },
			{ mode: 'resize', label: 'Resize', description: 'Control output dimensions and aspect lock.' },
			{ mode: 'rotate', label: 'Rotate', description: 'Rotate and mirror orientation.' },
			{ mode: 'aspect', label: 'Aspect', description: 'Letterbox or pillarbox to fixed aspect ratio.' },
		],
	},
	{
		id: 'style',
		label: 'Style',
		description: 'Apply visual treatment and overlays.',
		icon: Sparkles,
		tools: [
			{ mode: 'filters', label: 'Filters', description: 'Color tuning and image effects.' },
			{ mode: 'text', label: 'Text', description: 'Add titles or captions over frames.' },
			{ mode: 'overlay', label: 'Overlay', description: 'Stamp logos or watermark assets.' },
			{ mode: 'fade', label: 'Fade', description: 'Intro and outro color fades.' },
		],
	},
	{
		id: 'timing',
		label: 'Timing',
		description: 'Control frame pacing and optimization.',
		icon: Clapperboard,
		tools: [
			{ mode: 'frames', label: 'Frames', description: 'Extract and adjust per-frame timing.' },
			{ mode: 'optimize', label: 'Optimize', description: 'Compression and frame skipping.' },
			{ mode: 'maker', label: 'Maker', description: 'Build GIFs from image sequences.' },
		],
	},
	{
		id: 'output',
		label: 'Output',
		description: 'Inspect, convert, and export final media.',
		icon: Download,
		tools: [
			{ mode: 'convert', label: 'Convert', description: 'Transcode into alternate formats.' },
			{ mode: 'analyze', label: 'Analyze', description: 'Inspect GIF internals and metadata.' },
			{ mode: 'export', label: 'Export', description: 'Generate and deliver your final GIF.' },
		],
	},
];

const MODE_TO_SECTION: Record<GifMode, SidebarSectionId> = {
	settings: 'setup',
	crop: 'setup',
	resize: 'setup',
	rotate: 'setup',
	aspect: 'setup',
	filters: 'style',
	text: 'style',
	overlay: 'style',
	fade: 'style',
	frames: 'timing',
	optimize: 'timing',
	maker: 'timing',
	convert: 'output',
	analyze: 'output',
	export: 'output',
};

function GifFoundry() {
	useLongTaskObserver('gif-route');
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
			extractedFrames: s.extractedFrames,
			textOverlays: s.textOverlays,
			imageOverlay: s.imageOverlay,
			fadeInDuration: s.fadeInDuration,
			fadeOutDuration: s.fadeOutDuration,
			fadeColor: s.fadeColor,
			aspectPreset: s.aspectPreset,
			aspectPaddingColor: s.aspectPaddingColor,
			setMode: s.setMode,
			resetAll: s.resetAll,
			setExtractedFrames: s.setExtractedFrames,
			clearExtractedFrames: s.clearExtractedFrames,
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
	const [sidebarSection, setSidebarSection] = useState<SidebarSectionId>('setup');

	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const { isConfirmOpen, requestAction, confirmPendingAction, cancelPendingAction } = usePendingActionConfirmation(
		file !== null,
	);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
	const videoFps = Math.max(1, fps);
	const frameDuration = useMemo(() => 1 / videoFps, [videoFps]);
	const minTrimDuration = frameDuration;
	const totalFrames = useMemo(() => Math.max(0, Math.ceil(duration * videoFps)), [duration, videoFps]);

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

			toast.success('File loaded', { description: f.name });
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
		acceptFile: isGifEditorFileLike,
		onRejectedFile: () => {
			toast.error('Invalid file type', { description: 'Drop a video or GIF file' });
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
				togglePlaybackInTrim();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [togglePlaybackInTrim]);

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

	useEffect(() => {
		setSidebarSection(MODE_TO_SECTION[store.mode]);
	}, [store.mode]);

	const activeSidebarSection = useMemo(
		() => SIDEBAR_SECTIONS.find((section) => section.id === sidebarSection) ?? SIDEBAR_SECTIONS[0]!,
		[sidebarSection],
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
						onApplyPreset={applyPreset}
					/>
				);
			case 'crop':
				return <GifCropPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />;
			case 'resize':
				return (
					<GifResizePanel
						width={width}
						height={height}
						lockAspect={lockAspect}
						sourceAspect={sourceAspect}
						onWidthChange={handleWidthChange}
						onHeightChange={handleHeightChange}
						onLockAspectChange={setLockAspect}
					/>
				);
			case 'rotate':
				return <GifRotatePanel />;
			case 'filters':
				return <GifFiltersPanel />;
			case 'optimize':
				return <GifOptimizePanel />;
			case 'frames':
				return (
					<GifFramesPanel
						file={file}
						processing={processing}
						progress={progress}
						onExtractFrames={() => {
							void handleExtractFrames();
						}}
					/>
				);
			case 'text':
				return <GifTextOverlayPanel />;
			case 'maker':
				return <GifMakerPanel />;
			case 'overlay':
				return <GifImageOverlayPanel />;
			case 'fade':
				return <GifFadePanel />;
			case 'analyze':
				return <GifAnalyzerPanel file={file} />;
			case 'convert':
				return <GifFormatConvertPanel file={file} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />;
			case 'aspect':
				return <GifAspectRatioPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />;
			case 'export':
				return (
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
						onCloseDrawer={() => {
							setDrawerOpen(false);
						}}
					/>
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
			<div className="p-4 border-b border-border/70 bg-surface-raised/20">
				<div className="mb-3 flex items-center justify-between gap-3">
					<div>
						<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-tertiary">
							GIF Studio
						</p>
						<p className="text-[13px] text-text-secondary">Focused workflow from source to export.</p>
					</div>
					{file && (
						<span className="rounded-md border border-border/70 bg-bg/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
							{isGifSource ? 'GIF Source' : 'Video Source'}
						</span>
					)}
				</div>
				<div className="flex gap-2">
					<Button
						variant="secondary"
						className="flex-1 min-w-0"
						onClick={() => fileInputRef.current?.click()}
					>
						{file ? <span className="truncate">{file.name}</span> : 'Choose File'}
					</Button>
					{file && (
						<>
							<Button
								variant="ghost"
								size="icon"
								onClick={handleNew}
								title="New (discard current)"
								aria-label="New file (discard current media)"
							>
								<FilePlus2 size={16} />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => {
									setShowInfo(true);
								}}
								title="File info"
								aria-label="Open file info"
							>
								<Info size={16} />
							</Button>
						</>
					)}
				</div>
				{file && (
					<div className="mt-2 rounded-lg border border-border/60 bg-bg/35 px-2.5 py-2 text-[12px] text-text-tertiary">
						<p className="truncate text-text-secondary font-medium">{file.name}</p>
						<p className="mt-0.5">
							{formatFileSize(file.size)}
							{sourceWidth && sourceHeight ? ` · ${sourceWidth}×${sourceHeight}` : ''}
						</p>
					</div>
				)}
			</div>

			<div className="p-4 border-b border-border/70 bg-surface/70">
				<p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-tertiary">Workflow</p>
				<div className="grid grid-cols-2 gap-2">
					{SIDEBAR_SECTIONS.map((section) => {
						const isActive = sidebarSection === section.id;
						return (
							<button
								key={section.id}
								onClick={() => {
									setSidebarSection(section.id);
									if (MODE_TO_SECTION[store.mode] !== section.id) {
										store.setMode(section.tools[0]!.mode);
									}
								}}
								className={`rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
									isActive
										? 'border-accent/35 bg-accent/10'
										: 'border-border/60 bg-bg/35 hover:border-border hover:bg-bg/50'
								}`}
							>
								<div className="flex items-center gap-1.5">
									<section.icon
										size={14}
										className={isActive ? 'text-accent' : 'text-text-tertiary'}
									/>
									<span
										className={`text-[12px] font-semibold ${isActive ? 'text-accent' : 'text-text-secondary'}`}
									>
										{section.label}
									</span>
								</div>
								<p className="mt-1 text-[11px] leading-relaxed text-text-tertiary">
									{section.description}
								</p>
							</button>
						);
					})}
				</div>
			</div>

			<div className="px-4 py-3 border-b border-border/70">
				<div className="flex flex-wrap gap-1.5">
					{activeSidebarSection.tools.map((tool) => {
						const isActive = tool.mode === store.mode;
						return (
							<button
								key={tool.mode}
								onClick={() => {
									store.setMode(tool.mode);
								}}
								title={tool.description}
								className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
									isActive
										? 'border-accent/35 bg-accent/10 text-accent'
										: 'border-border/60 bg-surface-raised/35 text-text-tertiary hover:text-text-secondary'
								}`}
							>
								{tool.label}
							</button>
						);
					})}
				</div>
			</div>

			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">{modePanel}</div>

			{store.mode !== 'export' && (
				<div className="p-4 border-t border-border flex flex-col gap-2 bg-surface-raised/10">
					<div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
						<Palette size={12} />
						<span>Quick Export</span>
					</div>
					<Button
						className="w-full"
						disabled={!file || !ready || processing}
						onClick={() => {
							void handleGenerate();
							setDrawerOpen(false);
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
								setDrawerOpen(false);
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
		<div data-editor="gif" className="h-full flex flex-col">
			<Seo
				title="GIF Editor — Vixely"
				description="Create, edit, crop, resize, rotate, optimize and convert GIFs with filters and effects — entirely in your browser."
				path="/tools/gif"
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
				}}
			/>

			<div className="h-0.5 gradient-accent shrink-0" />
			<div className="flex flex-1 min-h-0 animate-fade-in">
				{/* ── Main Area ── */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Workspace */}
					<div
						className="flex-1 flex items-center justify-center workspace-bg p-3 sm:p-6 overflow-hidden relative"
						{...dropHandlers}
					>
						{videoUrl ? (
							<div className="w-full h-full flex items-center justify-center">
								<div className="w-full max-w-5xl max-h-full flex flex-col items-center gap-3">
									{canShowResultPreview && (
										<div className="inline-flex items-center rounded-lg border border-border/60 bg-bg/40 p-0.5">
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

									<div className="w-full min-h-0 flex items-center justify-center">
										{showingResult && resultUrl ? (
											<div className="rounded-xl border border-success/30 bg-surface/80 p-2 max-w-full max-h-full">
												<img
													src={resultUrl}
													alt="Generated GIF"
													width={width}
													height={outputHeight}
													className="max-w-full max-h-[min(70vh,680px)] object-contain rounded-lg bg-black"
												/>
											</div>
										) : isGifSource ? (
											<img
												src={videoUrl}
												alt="GIF source"
												width={sourceWidth ?? undefined}
												height={sourceHeight ?? undefined}
												style={previewStyle}
												className="max-w-full max-h-[min(70vh,680px)] rounded-lg bg-black object-contain"
											/>
										) : (
											<video
												ref={videoRef}
												src={videoUrl}
												onLoadedMetadata={handleVideoLoaded}
												onTimeUpdate={handleTimeUpdate}
												loop={loop}
												controls
												style={previewStyle}
												className="max-w-full max-h-[min(70vh,680px)] rounded-lg bg-black"
											/>
										)}
									</div>

									{showingResult ? (
										<p className="text-[13px] text-success font-medium">
											Result size: {formatFileSize(resultSize)}
										</p>
									) : (
										(store.rotation !== 0 || store.flipH || store.flipV || store.crop) && (
											<div className="mt-1 flex gap-1.5 flex-wrap justify-center">
												{store.rotation !== 0 && (
													<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent">
														Rotate {store.rotation}°
													</span>
												)}
												{store.flipH && (
													<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent">
														Flip H
													</span>
												)}
												{store.flipV && (
													<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent">
														Flip V
													</span>
												)}
												{store.crop && (
													<span className="text-[12px] px-2 py-0.5 rounded bg-accent/10 text-accent">
														Crop {Math.round(store.crop.width)}×
														{Math.round(store.crop.height)}
													</span>
												)}
											</div>
										)
									)}

									{processing && (
										<div className="w-full max-w-sm rounded-xl border border-border/70 bg-bg/60 px-4 py-3 flex flex-col items-center">
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
									)}
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center gap-6">
								<EmptyState
									isDragging={isDragging}
									onChooseFile={() => fileInputRef.current?.click()}
								/>
							</div>
						)}

						{/* Drag overlay when file is loaded */}
						{isDragging && videoUrl && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
								<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
									Drop to replace file
								</div>
							</div>
						)}
					</div>

					{/* Timeline (only for video sources) */}
					{!isGifSource && duration > 0 && (
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
							/>
							{file && (
								<div className="mt-3 rounded-lg border border-border/70 bg-bg/40 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-tertiary">
									<span className="font-medium text-text-secondary truncate max-w-full">
										{file.name}
									</span>
									<span>{formatFileSize(file.size)}</span>
									{sourceWidth && sourceHeight && (
										<span>
											{sourceWidth}&times;{sourceHeight}
										</span>
									)}
									<span>{videoFps.toFixed(2)} fps</span>
									<span>{formatCompactTime(duration)}</span>
									<div className="flex-1" />
									<button
										onClick={() => {
											setShowInfo(true);
										}}
										type="button"
										aria-label="Open GIF file info"
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
							type="button"
							aria-label="Open GIF settings"
							title="Open GIF settings"
						>
							<Settings size={20} className="text-white" />
						</button>

						{/* ── Desktop Sidebar ── */}
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
				<FileMetadataModal
					file={file}
					fields={[
						{ label: 'Source type', value: isGifSource ? 'GIF' : 'Video' },
						{
							label: 'Source dimensions',
							value: sourceWidth && sourceHeight ? `${sourceWidth}×${sourceHeight}` : null,
						},
						{ label: 'Duration', value: duration > 0 ? `${duration.toFixed(1)}s` : null },
						{ label: 'Output size', value: `${width}×${outputHeight}px @ ${fps}fps` },
						{
							label: 'Speed',
							value: store.speed !== 1 ? `${store.speed}x${store.reverse ? ' (reversed)' : ''}` : null,
						},
						{ label: 'Rotation', value: store.rotation !== 0 ? `${store.rotation}°` : null },
						{
							label: 'Flip',
							value:
								store.flipH || store.flipV
									? [store.flipH && 'Horizontal', store.flipV && 'Vertical']
											.filter(Boolean)
											.join(', ')
									: null,
						},
						{
							label: 'Crop',
							value: store.crop
								? `${Math.round(store.crop.width)}×${Math.round(store.crop.height)} at (${Math.round(store.crop.x)},${Math.round(store.crop.y)})`
								: null,
						},
						{ label: 'Est. frames', value: String(estimatedFrames) },
						{ label: 'Loop', value: store.loopCount === 0 ? 'Infinite' : `${store.loopCount}×` },
					]}
					onClose={() => {
						setShowInfo(false);
					}}
				/>
			)}

			{/* Confirm reset modal */}
			{isConfirmOpen && <ConfirmResetModal onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />}
		</div>
	);
}

/* ── Empty State ── */

function EmptyState({ isDragging, onChooseFile }: { isDragging: boolean; onChooseFile: () => void }) {
	return (
		<div className="flex flex-col items-center text-center">
			<div
				className={`rounded-2xl bg-surface border border-border p-8 mb-5 transition-all ${isDragging ? 'border-accent scale-105 shadow-[0_0_40px_var(--color-accent-glow)]' : ''}`}
			>
				<Film
					size={48}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? 'text-accent' : 'text-accent/25'}`}
				/>
			</div>
			<p className="text-sm font-medium text-text-secondary">
				{isDragging ? 'Drop your file here' : 'No file loaded'}
			</p>
			<p className="mt-1 text-[14px] text-text-tertiary">
				{isDragging ? 'Release to load' : 'Drop a video or GIF, or click to get started'}
			</p>
			{!isDragging && (
				<Button variant="secondary" size="sm" className="mt-4" onClick={onChooseFile}>
					Choose File
				</Button>
			)}
		</div>
	);
}
