import { createFileRoute } from '@tanstack/react-router';
import { Film, FilePlus2, Settings, Info } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
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
import { GifModeTabs } from '@/components/gif/GifModeTabs.tsx';
import { GifOptimizePanel } from '@/components/gif/GifOptimizePanel.tsx';
import { GifResizePanel } from '@/components/gif/GifResizePanel.tsx';
import { GifRotatePanel } from '@/components/gif/GifRotatePanel.tsx';
import { GifSettingsPanel } from '@/components/gif/GifSettingsPanel.tsx';
import { GifTextOverlayPanel } from '@/components/gif/GifTextOverlayPanel.tsx';
import { Seo } from '@/components/Seo.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Timeline } from '@/components/ui/index.ts';
import { gifPresetEntries, GIF_ACCEPT } from '@/config/presets.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { usePendingActionConfirmation } from '@/hooks/usePendingActionConfirmation.ts';
import { usePreventUnload } from '@/hooks/usePreventUnload.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { formatFileSize } from '@/utils/format.ts';

export const Route = createFileRoute('/tools/gif')({ component: GifFoundry });

const GIF_PRESETS = gifPresetEntries();

function GifFoundry() {
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

	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const { isConfirmOpen, requestAction, confirmPendingAction, cancelPendingAction } = usePendingActionConfirmation(
		file !== null,
	);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const isDirty = file !== null;
	usePreventUnload(isDirty || processing);

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
			store.resetAll();
		});
	}, [requestAction, store, setResultUrl, setVideoUrl]);

	/* ── File Handling ── */
	const handleFile = useCallback(
		(f: File) => {
			setFile(f);
			setResultUrl(null);
			setResultSize(0);
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

	const handleTimeUpdate = useCallback(() => {
		const video = videoRef.current;
		if (video) setCurrentTime(video.currentTime);
	}, []);

	const handleSeek = useCallback((time: number) => {
		const video = videoRef.current;
		if (video) {
			video.currentTime = time;
			setCurrentTime(time);
		}
	}, []);

	useEffect(() => {
		const video = videoRef.current;
		if (video && !processing) {
			if (video.currentTime < trimStart || video.currentTime > trimEnd) {
				video.currentTime = trimStart;
				setCurrentTime(trimStart);
			}
		}
	}, [trimStart, trimEnd, processing]);

	const { isDragging, dropHandlers } = useSingleFileDrop<HTMLDivElement>({
		onFile: handleFile,
		acceptFile: (droppedFile) => droppedFile.type.startsWith('video/') || droppedFile.type === 'image/gif',
		onRejectedFile: () => {
			toast.error('Invalid file type', { description: 'Drop a video or GIF file' });
		},
	});

	/* ── Keyboard shortcuts ── */
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;
			if (e.key === ' ' && videoRef.current && !isGifSource) {
				e.preventDefault();
				if (videoRef.current.paused) void videoRef.current.play().catch(() => {});
				else videoRef.current.pause();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [isGifSource]);

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
			});

			const blob = new Blob([new Uint8Array(data)], { type: 'image/gif' });
			setResultSize(blob.size);
			setResultUrl(URL.createObjectURL(blob));
			toast.success('GIF ready', { description: formatFileSize(blob.size) });
		} catch {
			toast.error('Generation failed');
		}
	}, [file, fps, width, height, trimStart, trimEnd, store, createGif, setResultUrl]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = 'vixely-output.gif';
		a.click();
	}, [resultUrl]);

	/* ── Computed ── */
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const estimatedFrames = Math.ceil(clipDuration * fps);
	const outputHeight = height ?? Math.round(width / sourceAspect);

	/* ── Sidebar Content ── */
	const sidebarContent = (
		<>
			<GifModeTabs mode={store.mode} onModeChange={store.setMode} />

			{/* File Picker */}
			<div className="p-4 border-b border-border">
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
				{file && <p className="mt-1.5 text-[14px] text-text-tertiary">{formatFileSize(file.size)}</p>}
			</div>

			{/* Mode Content */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				{store.mode === 'settings' && (
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
				)}

				{store.mode === 'crop' && <GifCropPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />}

				{store.mode === 'resize' && (
					<GifResizePanel
						width={width}
						height={height}
						lockAspect={lockAspect}
						sourceAspect={sourceAspect}
						onWidthChange={handleWidthChange}
						onHeightChange={handleHeightChange}
						onLockAspectChange={setLockAspect}
					/>
				)}

				{store.mode === 'rotate' && <GifRotatePanel />}

				{store.mode === 'filters' && <GifFiltersPanel />}

				{store.mode === 'optimize' && <GifOptimizePanel />}

				{store.mode === 'frames' && (
					<GifFramesPanel
						file={file}
						processing={processing}
						progress={progress}
						onExtractFrames={() => {
							void handleExtractFrames();
						}}
					/>
				)}

				{store.mode === 'text' && <GifTextOverlayPanel />}

				{store.mode === 'maker' && <GifMakerPanel />}

				{store.mode === 'overlay' && <GifImageOverlayPanel />}

				{store.mode === 'fade' && <GifFadePanel />}

				{store.mode === 'analyze' && <GifAnalyzerPanel file={file} />}

				{store.mode === 'convert' && (
					<GifFormatConvertPanel file={file} sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
				)}

				{store.mode === 'aspect' && (
					<GifAspectRatioPanel sourceWidth={sourceWidth} sourceHeight={sourceHeight} />
				)}

				{store.mode === 'export' && (
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
				)}
			</div>

			{/* Generate action (visible on all tabs except export which has its own) */}
			{store.mode !== 'export' && (
				<div className="p-4 border-t border-border flex flex-col gap-2">
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
							<div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 max-w-full max-h-full w-full overflow-auto">
								{/* Source */}
								<div className="flex-1 min-w-0 max-h-full flex flex-col">
									<p className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 shrink-0">
										Source
									</p>
									{isGifSource ? (
										<img
											src={videoUrl}
											alt="GIF source"
											width={sourceWidth ?? undefined}
											height={sourceHeight ?? undefined}
											className="max-w-full max-h-full rounded-lg bg-black object-contain"
										/>
									) : (
										<video
											ref={videoRef}
											src={videoUrl}
											onLoadedMetadata={handleVideoLoaded}
											onTimeUpdate={handleTimeUpdate}
											loop={loop}
											controls
											className="max-w-full max-h-full rounded-lg bg-black"
										/>
									)}

									{/* Transform indicator */}
									{(store.rotation !== 0 || store.flipH || store.flipV || store.crop) && (
										<div className="mt-2 flex gap-1.5 flex-wrap">
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
													Crop {Math.round(store.crop.width)}×{Math.round(store.crop.height)}
												</span>
											)}
										</div>
									)}
								</div>

								{/* Result */}
								{resultUrl && !processing && (
									<div className="flex-1 min-w-0 max-h-full flex flex-col">
										<div className="flex items-center justify-between mb-2 shrink-0">
											<p className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider">
												Result
											</p>
											<span className="text-[14px] font-mono text-success">
												{formatFileSize(resultSize)}
											</span>
										</div>
										<div className="rounded-lg border border-success/20 bg-surface overflow-hidden max-h-full">
											<img
												src={resultUrl}
												alt="Generated GIF"
												width={width}
												height={outputHeight}
												className="max-w-full max-h-full object-contain"
											/>
										</div>
									</div>
								)}

								{/* Processing */}
								{processing && (
									<div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
										<div className="h-10 w-10 rounded-full border-[3px] border-border border-t-accent animate-spin" />
										<p className="mt-3 text-sm font-medium">{Math.round(progress * 100)}%</p>
										<div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
											<div
												className="h-full bg-accent transition-all duration-300"
												style={{ width: `${progress * 100}%` }}
											/>
										</div>
										<p className="mt-2 text-[14px] text-text-tertiary">Optimizing palette...</p>
									</div>
								)}
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
								onTrimStartChange={setTrimStart}
								onTrimEndChange={(v) => {
									setTrimEnd(Math.min(v, trimStart + 30));
								}}
								onSeek={handleSeek}
							/>
						</div>
					)}
				</div>

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
				<aside className="hidden md:flex w-72 xl:w-80 shrink-0 overflow-hidden border-l border-border bg-surface flex-col">
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
			<div className="mt-6 grid grid-cols-2 gap-3 text-left max-w-md">
				<FeatureCard title="Crop & Resize" description="Visual crop tool with aspect ratio presets" />
				<FeatureCard title="Rotate & Flip" description="90°, 180°, 270° rotation and mirroring" />
				<FeatureCard title="Color Filters" description="13 adjustments: exposure, contrast, hue..." />
				<FeatureCard title="Optimize" description="Compression, frame skip, color reduction" />
				<FeatureCard title="GIF Maker" description="Create GIFs from multiple images" />
				<FeatureCard title="Text & Overlays" description="Add text, watermarks, and image overlays" />
				<FeatureCard title="Fade Effects" description="Fade in/out with customizable colors" />
				<FeatureCard title="Analyze & Convert" description="Inspect GIF internals, convert formats" />
			</div>
		</div>
	);
}

function FeatureCard({ title, description }: { title: string; description: string }) {
	return (
		<div className="rounded-lg bg-surface/50 border border-border/50 px-3 py-2">
			<p className="text-[14px] font-medium text-text-secondary">{title}</p>
			<p className="text-[12px] text-text-tertiary mt-0.5">{description}</p>
		</div>
	);
}
