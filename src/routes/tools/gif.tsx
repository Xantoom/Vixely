import { createFileRoute } from '@tanstack/react-router';
import { Film, FilePlus2, Settings, Info, Lock, Unlock, Maximize2, Download } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { FileMetadataModal } from '@/components/FileMetadataModal.tsx';
import { Seo } from '@/components/Seo.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Slider, Timeline } from '@/components/ui/index.ts';
import { gifPresetEntries, GIF_ACCEPT } from '@/config/presets.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { usePendingActionConfirmation } from '@/hooks/usePendingActionConfirmation.ts';
import { usePreventUnload } from '@/hooks/usePreventUnload.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useGifEditorStore, type GifMode } from '@/stores/gifEditor.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

export const Route = createFileRoute('/tools/gif')({ component: GifFoundry });

const GIF_PRESETS = gifPresetEntries();

/* ── Mode Tab Config ── */

const MODE_TABS: { mode: GifMode; label: string; icon: typeof Settings }[] = [
	{ mode: 'settings', label: 'Settings', icon: Settings },
	{ mode: 'resize', label: 'Resize', icon: Maximize2 },
	{ mode: 'export', label: 'Export', icon: Download },
];

/* ── Toggle Switch ── */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	const labelId = useId();

	return (
		<div className="flex items-center justify-between">
			<span id={labelId} className="text-[14px] font-medium text-text-secondary">
				{label}
			</span>
			<button
				onClick={() => {
					onChange(!checked);
				}}
				type="button"
				role="switch"
				aria-checked={checked}
				aria-labelledby={labelId}
				className={`h-6 w-10 rounded-full transition-colors cursor-pointer ${
					checked ? 'bg-accent' : 'bg-surface-raised'
				}`}
			>
				<div
					aria-hidden
					className={`h-4 w-4 rounded-full bg-white transition-transform mx-1 ${
						checked ? 'translate-x-4' : 'translate-x-0'
					}`}
				/>
			</button>
		</div>
	);
}

/* ── Main Component ── */

function GifFoundry() {
	const { ready, processing, progress, error, createGif } = useVideoProcessor();
	const { mode, speed, reverse, colorReduction, setMode, setSpeed, setReverse, setColorReduction, resetStore } =
		useGifEditorStore(
			useShallow((s) => ({
				mode: s.mode,
				speed: s.speed,
				reverse: s.reverse,
				colorReduction: s.colorReduction,
				setMode: s.setMode,
				setSpeed: s.setSpeed,
				setReverse: s.setReverse,
				setColorReduction: s.setColorReduction,
				resetStore: s.resetAll,
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
	const trimStartInputId = useId();
	const trimDurationInputId = useId();
	const resizeWidthInputId = useId();
	const resizeHeightInputId = useId();
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
			resetStore();
		});
	}, [requestAction, resetStore, setResultUrl, setVideoUrl]);

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

	/* ── Generate ── */
	const handleGenerate = useCallback(async () => {
		if (!file) return;

		toast('Generating GIF...');
		const clipDuration = Math.max(trimEnd - trimStart, 0.5);

		try {
			const data = await createGif({
				file,
				fps,
				width,
				height: height ?? undefined,
				startTime: trimStart > 0 ? trimStart : undefined,
				duration: clipDuration,
				speed: speed !== 1 ? speed : undefined,
				reverse: reverse || undefined,
				maxColors: colorReduction < 256 ? colorReduction : undefined,
			});

			const blob = new Blob([new Uint8Array(data)], { type: 'image/gif' });
			setResultSize(blob.size);
			setResultUrl(URL.createObjectURL(blob));
			toast.success('GIF ready', { description: formatFileSize(blob.size) });
		} catch {
			toast.error('Generation failed');
		}
	}, [file, fps, width, height, trimStart, trimEnd, speed, reverse, colorReduction, createGif]);

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

	/* ── Sidebar Content by Mode ── */
	const sidebarContent = (
		<>
			{/* Mode Tabs */}
			<div className="flex border-b border-border bg-surface overflow-x-auto">
				{MODE_TABS.map((tab) => {
					const isActive = mode === tab.mode;
					return (
						<button
							key={tab.mode}
							onClick={() => {
								setMode(tab.mode);
							}}
							className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[14px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
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
				{mode === 'settings' && (
					<>
						{/* Presets */}
						<div>
							<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
								Quick Presets
							</h3>
							<div className="grid grid-cols-2 gap-1.5">
								{GIF_PRESETS.map(([key, preset]) => (
									<button
										key={key}
										onClick={() => {
											applyPreset(key);
										}}
										className="rounded-lg px-2.5 py-2 text-left cursor-pointer bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text transition-all"
									>
										<p className="text-[14px] font-medium truncate">{preset.name}</p>
										<p className="text-[14px] text-text-tertiary truncate">{preset.description}</p>
									</button>
								))}
							</div>
						</div>

						{/* FPS */}
						<Slider
							label="Smoothness"
							displayValue={`${fps} fps`}
							min={5}
							max={30}
							step={1}
							value={fps}
							onChange={(e) => {
								setFps(Number(e.target.value));
							}}
						/>

						{/* Loop */}
						<Toggle checked={loop} onChange={setLoop} label="Loop" />

						{/* Speed */}
						<Slider
							label="Speed"
							displayValue={`${speed}x`}
							min={0.25}
							max={4}
							step={0.25}
							value={speed}
							onChange={(e) => {
								setSpeed(Number(e.target.value));
							}}
						/>

						{/* Reverse */}
						<Toggle checked={reverse} onChange={setReverse} label="Reverse" />

						{/* GIF source trim inputs */}
						{isGifSource && (
							<div>
								<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
									Trim
								</h3>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label
											htmlFor={trimStartInputId}
											className="text-[14px] text-text-tertiary mb-1 block"
										>
											Start (s)
										</label>
										<input
											id={trimStartInputId}
											type="number"
											min={0}
											step={0.1}
											value={trimStart}
											onChange={(e) => {
												setTrimStart(Math.max(0, Number(e.target.value)));
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
									<div className="flex-1">
										<label
											htmlFor={trimDurationInputId}
											className="text-[14px] text-text-tertiary mb-1 block"
										>
											Duration (s)
										</label>
										<input
											id={trimDurationInputId}
											type="number"
											min={0.5}
											step={0.5}
											value={Number((trimEnd - trimStart).toFixed(1))}
											onChange={(e) => {
												setTrimEnd(trimStart + Math.max(0.5, Number(e.target.value)));
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
								</div>
							</div>
						)}
					</>
				)}

				{mode === 'resize' && (
					<>
						{/* Width / Height */}
						<div>
							<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
								Dimensions
							</h3>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<label
										htmlFor={resizeWidthInputId}
										className="text-[14px] text-text-tertiary mb-1 block"
									>
										Width
									</label>
									<input
										id={resizeWidthInputId}
										type="number"
										min={16}
										max={1920}
										value={width}
										onChange={(e) => {
											handleWidthChange(Math.max(16, Number(e.target.value)));
										}}
										className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
								<button
									onClick={() => {
										setLockAspect(!lockAspect);
									}}
									type="button"
									aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
									title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
									className={`mt-4 h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
										lockAspect ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text'
									}`}
								>
									{lockAspect ? <Lock size={12} /> : <Unlock size={12} />}
								</button>
								<div className="flex-1">
									<label
										htmlFor={resizeHeightInputId}
										className="text-[14px] text-text-tertiary mb-1 block"
									>
										Height
									</label>
									<input
										id={resizeHeightInputId}
										type="number"
										min={16}
										max={1920}
										value={height ?? Math.round(width / sourceAspect)}
										onChange={(e) => {
											handleHeightChange(Math.max(16, Number(e.target.value)));
										}}
										className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
							</div>
						</div>

						{/* Quick Size Slider */}
						<Slider
							label="Quick Size"
							displayValue={`${formatNumber(width)}px`}
							min={128}
							max={1280}
							step={16}
							value={width}
							onChange={(e) => {
								handleWidthChange(Number(e.target.value));
							}}
						/>

						{/* Common size presets */}
						<div>
							<label className="text-[14px] text-text-tertiary mb-2 block">Common Sizes</label>
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
								{[
									{ label: '320', w: 320 },
									{ label: '480', w: 480 },
									{ label: '640', w: 640 },
									{ label: '720', w: 720 },
									{ label: '1080', w: 1080 },
									{ label: '1280', w: 1280 },
								].map((s) => (
									<button
										key={s.w}
										onClick={() => {
											handleWidthChange(s.w);
										}}
										className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
											width === s.w
												? 'bg-accent/15 text-accent border border-accent/30'
												: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
										}`}
									>
										{s.label}px
									</button>
								))}
							</div>
						</div>
					</>
				)}

				{mode === 'export' && (
					<>
						{/* Color Reduction */}
						<Slider
							label="Colors"
							displayValue={`${colorReduction}`}
							min={16}
							max={256}
							step={16}
							value={colorReduction}
							onChange={(e) => {
								setColorReduction(Number(e.target.value));
							}}
						/>
						<div className="flex justify-between text-[14px] text-text-tertiary -mt-2">
							<span>Smaller file</span>
							<span>Better quality</span>
						</div>

						{/* Estimates */}
						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-[14px]">
								<span className="text-text-tertiary">Frames</span>
								<span className="font-mono text-text-secondary">{formatNumber(estimatedFrames)}</span>
							</div>
							<div className="flex justify-between text-[14px]">
								<span className="text-text-tertiary">Duration</span>
								<span className="font-mono text-text-secondary">{formatNumber(clipDuration, 1)}s</span>
							</div>
							<div className="flex justify-between text-[14px]">
								<span className="text-text-tertiary">Resolution</span>
								<span className="font-mono text-text-secondary">
									{width} x {outputHeight}
								</span>
							</div>
							<div className="flex justify-between text-[14px]">
								<span className="text-text-tertiary">Speed</span>
								<span className="font-mono text-text-secondary">
									{speed}x{reverse ? ' (reversed)' : ''}
								</span>
							</div>
							<div className="flex justify-between text-[14px]">
								<span className="text-text-tertiary">Colors</span>
								<span className="font-mono text-text-secondary">{colorReduction}</span>
							</div>
						</div>

						{/* Result info */}
						{resultUrl && (
							<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
								<p className="text-[14px] text-success font-medium">GIF ready</p>
								<p className="text-[14px] text-text-tertiary mt-0.5">{formatFileSize(resultSize)}</p>
							</div>
						)}
					</>
				)}
			</div>

			{/* Actions (always visible at bottom) */}
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
		</>
	);

	return (
		<div data-editor="gif" className="h-full flex flex-col">
			<Seo
				title="GIF Editor — Vixely"
				description="Convert videos to optimized GIFs with trim, resize, and palette controls entirely in your browser."
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
						{ label: 'Duration', value: duration > 0 ? `${duration.toFixed(1)}s` : null },
						{ label: 'GIF settings', value: `${width}px @ ${fps}fps` },
						{ label: 'Speed', value: speed !== 1 ? `${speed}x${reverse ? ' (reversed)' : ''}` : null },
						{ label: 'Est. frames', value: String(estimatedFrames) },
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
