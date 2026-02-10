import { createFileRoute } from '@tanstack/react-router';
import { Camera, Video, FilePlus2, Settings, Info, Layers, Palette, Scissors, Download } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { FileMetadataModal } from '@/components/FileMetadataModal.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Slider, Timeline, formatTimecode } from '@/components/ui/index.ts';
import { FrameCaptureDialog } from '@/components/video/FrameCaptureDialog.tsx';
import { VideoPlayer } from '@/components/video/VideoPlayer.tsx';
import { videoPresetEntries, buildVideoArgs, VIDEO_ACCEPT } from '@/config/presets.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useVideoEditorStore, type VideoMode, type VideoFilters } from '@/stores/videoEditor.ts';
import { MonetagAd } from '@/components/AdContainer.tsx';
import { MONETAG_ZONES } from '@/config/monetag.ts';
import { formatFileSize } from '@/utils/format.ts';

export const Route = createFileRoute('/tools/video')({ component: VideoStudio });

const VIDEO_PRESETS = videoPresetEntries();

const PLATFORM_ICONS: Record<string, string> = {
	discord: 'D',
	twitch: 'T',
	twitter: 'X',
	square: '1:1',
	portrait: '9:16',
	high: 'HQ',
};

function getPresetIcon(key: string): string {
	for (const [prefix, icon] of Object.entries(PLATFORM_ICONS)) {
		if (key.includes(prefix)) return icon;
	}
	return 'V';
}

/* ── Mode Tab Config ── */

const VIDEO_MODE_TABS: { mode: VideoMode; label: string; icon: typeof Layers }[] = [
	{ mode: 'presets', label: 'Presets', icon: Layers },
	{ mode: 'color', label: 'Color', icon: Palette },
	{ mode: 'trim', label: 'Trim', icon: Scissors },
	{ mode: 'export', label: 'Export', icon: Download },
];

function VideoStudio() {
	const { ready, processing, progress, error, transcode, captureFrame } = useVideoProcessor();
	const {
		mode: videoMode,
		setMode: setVideoMode,
		filters: videoFilters,
		setFilter: setVideoFilter,
		resetFilters: resetVideoFilters,
		cssFilter,
	} = useVideoEditorStore();
	const videoEditorCssFilter = cssFilter();

	const [file, setFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [customCrf, setCustomCrf] = useState(23);
	const [capturedFrame, setCapturedFrame] = useState<Uint8Array | null>(null);
	const [showResetModal, setShowResetModal] = useState(false);
	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragCounter = useRef(0);

	const isDirty = file !== null;

	// beforeunload warning when file is loaded or processing
	useEffect(() => {
		if (!isDirty && !processing) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [isDirty, processing]);

	const confirmAction = useCallback(
		(action: () => void) => {
			if (isDirty) {
				setPendingAction(() => action);
				setShowResetModal(true);
			} else {
				action();
			}
		},
		[isDirty],
	);

	const handleConfirmReset = useCallback(() => {
		setShowResetModal(false);
		pendingAction?.();
		setPendingAction(null);
	}, [pendingAction]);

	const handleCancelReset = useCallback(() => {
		setShowResetModal(false);
		setPendingAction(null);
	}, []);

	const handleNew = useCallback(() => {
		confirmAction(() => {
			setFile(null);
			setVideoUrl(null);
			setDuration(0);
			setCurrentTime(0);
			setTrimStart(0);
			setTrimEnd(0);
			setSelectedPreset(null);
			setResultUrl(null);
			setShowAdvanced(false);
			setCustomCrf(23);
			setCapturedFrame(null);
		});
	}, [confirmAction]);

	const handleFile = useCallback((f: File) => {
		setFile(f);
		setResultUrl(null);
		setSelectedPreset(null);
		setCapturedFrame(null);
		setVideoUrl(URL.createObjectURL(f));
		toast.success('Video loaded', { description: f.name });
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

	// Seek playhead only if it falls outside the new trim range
	useEffect(() => {
		const video = videoRef.current;
		if (video && !processing) {
			if (video.currentTime < trimStart || video.currentTime > trimEnd) {
				video.currentTime = trimStart;
				setCurrentTime(trimStart);
			}
		}
	}, [trimStart, trimEnd, processing]);

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
			if (e.target instanceof HTMLInputElement) return;

			if (e.key === ' ' && videoRef.current) {
				e.preventDefault();
				if (videoRef.current.paused) videoRef.current.play();
				else videoRef.current.pause();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	const handleScreenshot = useCallback(async () => {
		if (!file) return;
		toast('Capturing frame...');
		try {
			const data = await captureFrame({ file, timestamp: currentTime });
			setCapturedFrame(data);
		} catch {
			toast.error('Failed to capture frame');
		}
	}, [file, currentTime, captureFrame]);

	const handleExport = useCallback(async () => {
		if (!file || !selectedPreset) return;

		toast('Export started...');
		const clipDuration = Math.max(trimEnd - trimStart, 0.5);
		const { args: presetArgs, format } = buildVideoArgs(selectedPreset, clipDuration);

		const args: string[] = [];
		if (trimStart > 0) args.push('-ss', trimStart.toFixed(3));
		if (trimEnd < duration) args.push('-t', clipDuration.toFixed(3));
		args.push(...presetArgs);
		args.push('-c:a', 'libopus', '-b:a', '96k');

		const outputName = `output.${format}`;

		try {
			const result = await transcode({ file, args, outputName });
			const blob = new Blob([result], { type: `video/${format}` });
			const url = URL.createObjectURL(blob);
			setResultUrl(url);
			toast.success('Export complete', { description: formatFileSize(blob.size) });
		} catch {
			toast.error('Export failed');
		}
	}, [file, trimStart, trimEnd, duration, selectedPreset, transcode]);

	const handleDownload = useCallback(() => {
		if (!resultUrl || !selectedPreset) return;
		const { format } = buildVideoArgs(selectedPreset, 1);
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = `vixely-export.${format}`;
		a.click();
	}, [resultUrl, selectedPreset]);

	/* ── Sidebar content (shared between desktop + mobile) ── */
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const sidebarContent = (
		<>
			{/* Mode Tabs */}
			<div className="flex border-b border-border bg-surface overflow-x-auto">
				{VIDEO_MODE_TABS.map((tab) => {
					const isActive = videoMode === tab.mode;
					return (
						<button
							key={tab.mode}
							onClick={() => setVideoMode(tab.mode)}
							className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
								isActive
									? 'text-accent border-b-2 border-accent'
									: 'text-text-tertiary hover:text-text-secondary'
							}`}
						>
							<tab.icon size={14} />
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* File picker */}
			<div className="p-4 border-b border-border">
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
				<div className="flex gap-2">
					<Button
						variant="secondary"
						className="flex-1 min-w-0"
						onClick={() => fileInputRef.current?.click()}
					>
						{file ? <span className="truncate">{file.name}</span> : 'Choose Video'}
					</Button>
					{file && (
						<>
							<Button variant="ghost" size="icon" onClick={handleNew} title="New (discard current)">
								<FilePlus2 size={16} />
							</Button>
							<Button variant="ghost" size="icon" onClick={() => setShowInfo(true)} title="File info">
								<Info size={16} />
							</Button>
						</>
					)}
				</div>
				{file && <p className="mt-1.5 text-[11px] text-text-tertiary">{formatFileSize(file.size)}</p>}
			</div>

			{/* Tab Content */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				{videoMode === 'presets' && (
					<>
						<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
							One-Click Presets
						</h3>
						<div className="flex flex-col gap-2">
							{VIDEO_PRESETS.map(([key, preset]) => (
								<button
									key={key}
									onClick={() => setSelectedPreset(selectedPreset === key ? null : key)}
									className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer ${
										selectedPreset === key
											? 'bg-accent/10 border border-accent/30 text-text'
											: 'bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text'
									}`}
								>
									<div
										className={`h-8 w-8 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
											selectedPreset === key
												? 'bg-accent text-bg'
												: 'bg-surface-raised text-text-tertiary'
										}`}
									>
										{getPresetIcon(key)}
									</div>
									<div className="min-w-0">
										<p className="text-xs font-medium truncate">{preset.name}</p>
										<p className="text-[10px] text-text-tertiary truncate">
											{preset.description}
										</p>
									</div>
								</button>
							))}
						</div>
					</>
				)}

				{videoMode === 'color' && (
					<>
						<div className="flex items-center justify-between">
							<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
								Color Correction
							</h3>
							<button
								onClick={resetVideoFilters}
								className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
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
								onChange={(e) =>
									setVideoFilter('brightness', Number(e.target.value))
								}
							/>
							<Slider
								label="Contrast"
								displayValue={`${(videoFilters.contrast * 100).toFixed(0)}`}
								min={0.2}
								max={3}
								step={0.01}
								value={videoFilters.contrast}
								onChange={(e) =>
									setVideoFilter('contrast', Number(e.target.value))
								}
							/>
							<Slider
								label="Saturation"
								displayValue={`${(videoFilters.saturation * 100).toFixed(0)}`}
								min={0}
								max={3}
								step={0.01}
								value={videoFilters.saturation}
								onChange={(e) =>
									setVideoFilter('saturation', Number(e.target.value))
								}
							/>
							<Slider
								label="Hue"
								displayValue={`${videoFilters.hue >= 0 ? '+' : ''}${videoFilters.hue.toFixed(0)}\u00b0`}
								min={-180}
								max={180}
								step={1}
								value={videoFilters.hue}
								onChange={(e) =>
									setVideoFilter('hue', Number(e.target.value))
								}
							/>
						</div>
					</>
				)}

				{videoMode === 'trim' && (
					<>
						<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
							Trim Range
						</h3>
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<label className="text-[10px] text-text-tertiary mb-1 block">Start (s)</label>
								<input
									type="number"
									min={0}
									max={duration}
									step={0.1}
									value={Number(trimStart.toFixed(1))}
									onChange={(e) =>
										setTrimStart(
											Math.max(0, Math.min(Number(e.target.value), trimEnd - 0.5)),
										)
									}
									className="w-full h-7 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
							<div className="flex-1">
								<label className="text-[10px] text-text-tertiary mb-1 block">End (s)</label>
								<input
									type="number"
									min={0}
									max={duration}
									step={0.1}
									value={Number(trimEnd.toFixed(1))}
									onChange={(e) =>
										setTrimEnd(
											Math.min(
												duration,
												Math.max(Number(e.target.value), trimStart + 0.5),
											),
										)
									}
									className="w-full h-7 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
						</div>

						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Clip duration</span>
								<span className="font-mono text-text-secondary">
									{clipDuration.toFixed(1)}s
								</span>
							</div>
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Total</span>
								<span className="font-mono text-text-secondary">
									{duration.toFixed(1)}s
								</span>
							</div>
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Current</span>
								<span className="font-mono text-text-secondary">
									{formatTimecode(currentTime)}
								</span>
							</div>
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Frame</span>
								<span className="font-mono text-text-secondary">
									{Math.round(currentTime * 30)} / {Math.round(duration * 30)}
								</span>
							</div>
						</div>
					</>
				)}

				{videoMode === 'export' && (
					<>
						<Slider
							label="Quality (CRF)"
							displayValue={`${customCrf}`}
							min={15}
							max={45}
							step={1}
							value={customCrf}
							onChange={(e) => setCustomCrf(Number(e.target.value))}
						/>
						<div className="flex justify-between text-[9px] text-text-tertiary -mt-2">
							<span>Higher quality</span>
							<span>Smaller file</span>
						</div>

						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Preset</span>
								<span className="font-mono text-text-secondary">
									{selectedPreset
										? VIDEO_PRESETS.find(([k]) => k === selectedPreset)?.[1]
												?.name ?? '—'
										: 'None'}
								</span>
							</div>
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">Clip duration</span>
								<span className="font-mono text-text-secondary">
									{clipDuration.toFixed(1)}s
								</span>
							</div>
							<div className="flex justify-between text-[11px]">
								<span className="text-text-tertiary">CRF</span>
								<span className="font-mono text-text-secondary">{customCrf}</span>
							</div>
						</div>

						{resultUrl && (
							<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
								<p className="text-xs text-success font-medium">Export ready</p>
							</div>
						)}
					</>
				)}
			</div>

			{/* Actions (always visible at bottom) */}
			<div className="p-4 border-t border-border flex flex-col gap-2">
				<Button
					className="w-full"
					disabled={!file || !ready || processing || !selectedPreset}
					onClick={() => {
						handleExport();
						setDrawerOpen(false);
					}}
				>
					{processing ? `Exporting ${Math.round(progress * 100)}%` : 'Export'}
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
						Download
					</Button>
				)}

				{error && <p className="text-[11px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}

				{resultUrl && <MonetagAd zoneId={MONETAG_ZONES.export} className="mt-1" />}
			</div>
		</>
	);

	return (
		<div data-editor="video" className="h-full flex flex-col">
			<Helmet>
				<title>Video — Vixely</title>
				<meta name="description" content="Trim, crop, and convert videos locally in your browser." />
			</Helmet>

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
								onLoadedMetadata={handleVideoLoaded}
								onTimeUpdate={handleTimeUpdate}
								processing={processing}
								progress={progress}
								cssFilter={videoEditorCssFilter}
							/>
						) : (
							<div className="flex flex-col items-center gap-6">
								<EmptyState isDragging={isDragging} onChooseFile={() => fileInputRef.current?.click()} />
								<MonetagAd zoneId={MONETAG_ZONES.sidebar} className="w-full max-w-xs" />
							</div>
						)}

						{/* Drag overlay when video is loaded */}
						{isDragging && videoUrl && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
								<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
									Drop to replace video
								</div>
							</div>
						)}
					</div>

					{/* Timeline (below player) */}
					{duration > 0 && (
						<div className="border-t border-border bg-surface px-3 sm:px-6 py-3 sm:py-4">
							<div className="flex items-center gap-2 sm:gap-3 mb-3">
								{/* Screenshot button */}
								<Button
									variant="ghost"
									size="icon"
									onClick={handleScreenshot}
									disabled={!file || processing}
									title="Capture current frame"
								>
									<Camera size={16} />
								</Button>
								<span className="text-xs text-text-tertiary">Capture Frame</span>
								<div className="flex-1" />
								<span className="hidden sm:inline text-[10px] font-mono text-text-tertiary tabular-nums mr-3">
									Frame {Math.round(currentTime * 30)} / {Math.round(duration * 30)}
								</span>
								<span className="text-xs font-mono text-text-secondary tabular-nums">
									{formatTimecode(currentTime)}
								</span>
							</div>
							<Timeline
								duration={duration}
								trimStart={trimStart}
								trimEnd={trimEnd}
								currentTime={currentTime}
								onTrimStartChange={setTrimStart}
								onTrimEndChange={setTrimEnd}
								onSeek={handleSeek}
							/>
						</div>
					)}
				</div>

				{/* ── Mobile Sidebar Toggle ── */}
				<button
					className="md:hidden fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full gradient-accent flex items-center justify-center shadow-lg cursor-pointer"
					onClick={() => setDrawerOpen(true)}
				>
					<Settings size={20} className="text-white" />
				</button>

				{/* ── Right Sidebar (Desktop) ── */}
				<aside className="hidden md:flex w-72 xl:w-80 shrink-0 overflow-hidden border-l border-border bg-surface flex-col">
					{sidebarContent}
				</aside>

				{/* ── Mobile Sidebar Drawer ── */}
				<Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
					<div className="h-full flex flex-col bg-surface">{sidebarContent}</div>
				</Drawer>
			</div>

			{/* Frame capture dialog */}
			{capturedFrame && (
				<FrameCaptureDialog
					pngData={capturedFrame}
					timestamp={formatTimecode(currentTime).replace(/:/g, '.')}
					onClose={() => setCapturedFrame(null)}
				/>
			)}

			{/* File info modal */}
			{showInfo && file && (
				<FileMetadataModal
					file={file}
					fields={[
						{ label: 'Duration', value: duration > 0 ? `${duration.toFixed(1)}s` : null },
						{
							label: 'Trim range',
							value: duration > 0 ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s` : null,
						},
					]}
					onClose={() => setShowInfo(false)}
				/>
			)}

			{/* Confirm reset modal */}
			{showResetModal && <ConfirmResetModal onConfirm={handleConfirmReset} onCancel={handleCancelReset} />}
		</div>
	);
}

function EmptyState({ isDragging, onChooseFile }: { isDragging: boolean; onChooseFile: () => void }) {
	return (
		<div className="flex flex-col items-center text-center">
			<div
				className={`rounded-2xl bg-surface border border-border p-8 mb-5 transition-all ${isDragging ? 'border-accent scale-105 shadow-[0_0_40px_var(--color-accent-glow)]' : ''}`}
			>
				<Video
					size={48}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? 'text-accent' : 'text-accent/25'}`}
				/>
			</div>
			<p className="text-sm font-medium text-text-secondary">
				{isDragging ? 'Drop your video here' : 'No video loaded'}
			</p>
			<p className="mt-1 text-xs text-text-tertiary">
				{isDragging ? 'Release to load' : 'Drop a file or click to get started'}
			</p>
			{!isDragging && (
				<Button variant="secondary" size="sm" className="mt-4" onClick={onChooseFile}>
					Choose File
				</Button>
			)}
		</div>
	);
}
