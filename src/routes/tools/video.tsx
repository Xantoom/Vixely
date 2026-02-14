import { createFileRoute } from '@tanstack/react-router';
import {
	Camera,
	Video,
	FilePlus2,
	Settings,
	Info,
	Layers,
	Palette,
	Scissors,
	Download,
	Scaling,
	Volume2,
	VolumeX,
	Subtitles,
	AlertCircle,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { MonetagAd } from '@/components/AdContainer.tsx';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button, Slider, Timeline, formatTimecode } from '@/components/ui/index.ts';
import { AdvancedSettings } from '@/components/video/AdvancedSettings.tsx';
import { FrameCaptureDialog } from '@/components/video/FrameCaptureDialog.tsx';
import {
	getPlatformIcon,
	getPlatformKey,
	getPlatformLabel,
	PlatformIconComponent,
} from '@/components/video/PlatformIcons.tsx';
import { ResizePanel } from '@/components/video/ResizePanel.tsx';
import { VideoInfoModal } from '@/components/video/VideoInfoModal.tsx';
import { VideoPlayer } from '@/components/video/VideoPlayer.tsx';
import { MONETAG_ZONES } from '@/config/monetag.ts';
import { videoPresetEntries, buildVideoArgs, VIDEO_ACCEPT } from '@/config/presets.ts';
import { useVideoProcessor } from '@/hooks/useVideoProcessor.ts';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

export const Route = createFileRoute('/tools/video')({ component: VideoStudio });

const VIDEO_PRESETS = videoPresetEntries();

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

function VideoStudio() {
	const {
		ready,
		processing,
		progress,
		exportStats,
		error,
		transcode,
		captureFrame,
		probe,
		extractSubtitlePreview,
		cancel,
	} = useVideoProcessor();
	const store = useVideoEditorStore();
	const {
		mode: videoMode,
		setMode: setVideoMode,
		filters: videoFilters,
		setFilter: setVideoFilter,
		resetFilters: resetVideoFilters,
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
		useCustomExport,
		setUseCustomExport,
		ffmpegFilterArgs,
		resizeFilterArgs,
		resetAll,
	} = store;

	const [file, setFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultExt, setResultExt] = useState<string | null>(null);
	const [subtitlePreviewVtt, setSubtitlePreviewVtt] = useState<string | null>(null);
	const [assSubtitleContent, setAssSubtitleContent] = useState<string | null>(null);
	const [capturedFrame, setCapturedFrame] = useState<Uint8Array | null>(null);
	const [showResetModal, setShowResetModal] = useState(false);
	const [showInfo, setShowInfo] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragCounter = useRef(0);
	const progressRef = useRef(0);

	const isDirty = file !== null;

	const videoFps = useMemo(() => {
		if (!probeResult) return 30;
		const vs = probeResult.streams.find((s) => s.type === 'video');
		return vs?.fps ?? 30;
	}, [probeResult]);

	const audioStreams = useMemo(() => probeResult?.streams.filter((s) => s.type === 'audio') ?? [], [probeResult]);
	const subtitleStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [],
		[probeResult],
	);

	const groupedPresets = useMemo(() => groupPresetsByPlatform(VIDEO_PRESETS), []);

	useEffect(() => {
		progressRef.current = progress;
	}, [progress]);

	useEffect(() => {
		if (processing || !file) {
			setSubtitlePreviewVtt(null);
			setAssSubtitleContent(null);
			return;
		}
		if (!tracks.subtitleEnabled) return;

		const selectedSubtitleStream = subtitleStreams[tracks.subtitleTrackIndex];
		if (!selectedSubtitleStream) {
			setSubtitlePreviewVtt(null);
			setAssSubtitleContent(null);
			return;
		}

		let cancelled = false;
		extractSubtitlePreview(file, selectedSubtitleStream.index, selectedSubtitleStream.codec)
			.then((preview) => {
				if (cancelled) return;
				if (preview.format === 'ass') {
					setSubtitlePreviewVtt(preview.fallbackWebVtt ?? null);
					setAssSubtitleContent(preview.content);
					return;
				}

				setAssSubtitleContent(null);
				setSubtitlePreviewVtt(preview.content);
			})
			.catch((err) => {
				if (cancelled) return;
				if (err instanceof Error && err.message.includes('Superseded')) return;
				console.error('[video] Subtitle preview extraction failed', err);
				setSubtitlePreviewVtt(null);
				setAssSubtitleContent(null);
			});

		return () => {
			cancelled = true;
		};
	}, [processing, file, tracks.subtitleEnabled, tracks.subtitleTrackIndex, subtitleStreams, extractSubtitlePreview]);

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
			setResultExt(null);
			setCapturedFrame(null);
			resetAll();
		});
	}, [confirmAction, resetAll]);

	const handleFile = useCallback(
		(f: File) => {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			setFile(f);
			setResultUrl(null);
			setResultExt(null);
			setSelectedPreset(null);
			setCapturedFrame(null);
			setTrimStart(0);
			setTrimEnd(0);
			setDuration(0);
			setCurrentTime(0);
			setVideoUrl(URL.createObjectURL(f));
			toast.success('Video loaded', { description: f.name });

			probe(f)
				.then((result) => {
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
							bitrate: s.bitrate,
							isDefault: s.isDefault,
							isForced: s.isForced,
						})),
					});
					setTracks({
						audioEnabled: probedAudioStreams.length > 0,
						audioTrackIndex: defaultAudioTrackIndex,
						subtitleEnabled: probedSubtitleStreams.length > 0,
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
				.catch(() => {
					// Probe failure is non-critical
				});
		},
		[probe, setProbeResult, setTracks, setResize, videoUrl],
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

	const exportStartRef = useRef<number>(0);

	const handleExport = useCallback(async () => {
		if (!file) return;

		const isCustom = useCustomExport || !selectedPreset;

		setResultUrl(null);
		setResultExt(null);
		exportStartRef.current = Date.now();
		const clipDuration = Math.max(trimEnd - trimStart, 0.5);

		const args: string[] = [];

		// Trim args
		if (trimStart > 0) args.push('-ss', trimStart.toFixed(3));
		if (trimEnd < duration) args.push('-t', clipDuration.toFixed(3));

		const selectedAudioStream = tracks.audioEnabled ? audioStreams[tracks.audioTrackIndex] : undefined;
		const selectedSubtitleStream = tracks.subtitleEnabled ? subtitleStreams[tracks.subtitleTrackIndex] : undefined;

		// Build -vf filter chain (resize + color correction + optional ASS render)
		const vfParts = [...resizeFilterArgs(), ...ffmpegFilterArgs()];
		const subtitlesEnabled = selectedSubtitleStream != null;
		const selectedVideoStream = probeResult?.streams.find((s) => s.type === 'video');
		if (subtitlesEnabled) {
			const inputExt = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
			const inputName = `input${inputExt}`;
			const originalSize =
				selectedVideoStream?.width && selectedVideoStream?.height
					? `:original_size=${selectedVideoStream.width}x${selectedVideoStream.height}`
					: '';
			vfParts.push(`subtitles=${inputName}:si=${selectedSubtitleStream.index}${originalSize}`);
		}
		const noVideoFilters = vfParts.length === 0;

		// Detect if we can use stream copy (no re-encoding = near-instant)
		const sourceVideoCodec = probeResult?.streams.find((s) => s.type === 'video')?.codec;
		const sourceAudioCodec = selectedAudioStream?.codec;

		const codecToLib: Record<string, string> = {
			h264: 'libx264',
			hevc: 'libx265',
			vp9: 'libvpx-vp9',
			av1: 'libaom-av1',
		};
		const audioCodecToLib: Record<string, string> = { aac: 'aac', opus: 'libopus' };

		let outputName: string;
		let ext: string;
		let includeAudio = selectedAudioStream != null;

		if (isCustom) {
			const s = advancedSettings;
			includeAudio = includeAudio && s.audioCodec !== 'none';
			const sourceLib = sourceVideoCodec ? codecToLib[sourceVideoCodec] : undefined;
			const sourceAudioLib = sourceAudioCodec ? audioCodecToLib[sourceAudioCodec] : undefined;
			const canCopyVideo = noVideoFilters && sourceLib === s.codec;
			const canCopyAudio = includeAudio && sourceAudioLib === s.audioCodec;

			if (canCopyVideo) {
				args.push('-c:v', 'copy');
			} else {
				if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
				args.push('-c:v', s.codec);

				if (s.codec === 'libx264' || s.codec === 'libx265') {
					args.push('-crf', String(s.crf), '-preset', s.preset);
				} else if (s.codec === 'libvpx-vp9') {
					args.push('-crf', String(s.crf), '-b:v', '0');
				} else {
					args.push('-crf', String(s.crf));
				}
			}

			if (includeAudio) {
				if (canCopyAudio) {
					args.push('-c:a', 'copy');
				} else {
					args.push('-c:a', s.audioCodec, '-b:a', s.audioBitrate);
				}
			}

			ext = s.container;
			outputName = `output.${ext}`;
		} else {
			const { args: presetArgs, format } = buildVideoArgs(selectedPreset!, clipDuration);

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

			if (includeAudio) {
				const audioCodecForFormat = format === 'webm' ? 'libopus' : 'aac';
				args.push('-c:a', audioCodecForFormat, '-b:a', '96k');
			}

			ext = format;
			outputName = `output.${ext}`;
		}

		// Explicit stream mapping keeps selected tracks deterministic.
		args.push('-map', '0:v:0');
		if (includeAudio && selectedAudioStream) args.push('-map', `0:${selectedAudioStream.index}`);

		// 10s timeout: cancel if no progress at all
		const timeoutId = setTimeout(() => {
			if (progressRef.current <= 0) {
				cancel();
				toast.error('Export timed out', { description: 'No progress after 10 seconds — worker restarted' });
			}
		}, 10_000);

		try {
			const result = await transcode({ file, args, outputName });
			clearTimeout(timeoutId);
			const blob = new Blob([result], { type: `video/${ext}` });
			const url = URL.createObjectURL(blob);
			setResultUrl(url);
			setResultExt(ext);
			toast.success('Export complete', { description: `vixely-export.${ext}` });

			// Auto-download
			const a = document.createElement('a');
			a.href = url;
			a.download = `vixely-export.${ext}`;
			a.click();
		} catch {
			clearTimeout(timeoutId);
			toast.error('Export failed');
		}
	}, [
		file,
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
		transcode,
		cancel,
		resizeFilterArgs,
		ffmpegFilterArgs,
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
	const timeToFrames = (t: number) => Math.round(t * videoFps);
	const framesToTime = (f: number) => f / videoFps;

	/* ── Sidebar content ── */
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
							className={`flex-1 flex flex-col items-center gap-1 py-3 text-[12px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
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
				{file && <p className="mt-1.5 text-sm text-text-tertiary">{formatFileSize(file.size)}</p>}
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
													onClick={() =>
														setSelectedPreset(selectedPreset === key ? null : key)
													}
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
														<p className="text-xs font-medium truncate">{preset.name}</p>
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
									onClick={() => setTrimInputMode('time')}
									className={`px-2 py-0.5 text-[12px] font-semibold uppercase cursor-pointer transition-colors ${
										trimInputMode === 'time'
											? 'bg-accent/15 text-accent'
											: 'text-text-tertiary hover:text-text-secondary'
									}`}
								>
									Time
								</button>
								<button
									onClick={() => setTrimInputMode('frames')}
									className={`px-2 py-0.5 text-[12px] font-semibold uppercase cursor-pointer transition-colors ${
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
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<label className="text-[13px] text-text-tertiary mb-1 block">Start (s)</label>
									<input
										type="number"
										min={0}
										max={duration}
										step={0.1}
										value={Number(trimStart.toFixed(1))}
										onChange={(e) =>
											setTrimStart(Math.max(0, Math.min(Number(e.target.value), trimEnd - 0.5)))
										}
										className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
								<div className="flex-1">
									<label className="text-[13px] text-text-tertiary mb-1 block">End (s)</label>
									<input
										type="number"
										min={0}
										max={duration}
										step={0.1}
										value={Number(trimEnd.toFixed(1))}
										onChange={(e) =>
											setTrimEnd(
												Math.min(duration, Math.max(Number(e.target.value), trimStart + 0.5)),
											)
										}
										className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
							</div>
						) : (
							<>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label className="text-[13px] text-text-tertiary mb-1 block">
											Start (frame)
										</label>
										<input
											type="number"
											min={0}
											max={timeToFrames(duration)}
											step={1}
											value={timeToFrames(trimStart)}
											onChange={(e) => {
												const f = Math.max(
													0,
													Math.min(Number(e.target.value), timeToFrames(trimEnd) - 1),
												);
												setTrimStart(framesToTime(f));
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
									<div className="flex-1">
										<label className="text-[13px] text-text-tertiary mb-1 block">End (frame)</label>
										<input
											type="number"
											min={0}
											max={timeToFrames(duration)}
											step={1}
											value={timeToFrames(trimEnd)}
											onChange={(e) => {
												const f = Math.min(
													timeToFrames(duration),
													Math.max(Number(e.target.value), timeToFrames(trimStart) + 1),
												);
												setTrimEnd(framesToTime(f));
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										variant="secondary"
										size="sm"
										className="flex-1 text-[13px]"
										onClick={() => {
											const step = 1 / videoFps;
											handleSeek(Math.max(0, currentTime - step));
										}}
									>
										-1 Frame
									</Button>
									<Button
										variant="secondary"
										size="sm"
										className="flex-1 text-[13px]"
										onClick={() => {
											const step = 1 / videoFps;
											handleSeek(Math.min(duration, currentTime + step));
										}}
									>
										+1 Frame
									</Button>
								</div>
							</>
						)}

						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Clip duration</span>
								<span className="font-mono text-text-secondary">{clipDuration.toFixed(1)}s</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Total</span>
								<span className="font-mono text-text-secondary">{duration.toFixed(1)}s</span>
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
								Adjustments are applied during export via FFmpeg
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
								onChange={(e) => setVideoFilter('brightness', Number(e.target.value))}
							/>
							<Slider
								label="Contrast"
								displayValue={`${(videoFilters.contrast * 100).toFixed(0)}`}
								min={0.2}
								max={3}
								step={0.01}
								value={videoFilters.contrast}
								onChange={(e) => setVideoFilter('contrast', Number(e.target.value))}
							/>
							<Slider
								label="Saturation"
								displayValue={`${(videoFilters.saturation * 100).toFixed(0)}`}
								min={0}
								max={3}
								step={0.01}
								value={videoFilters.saturation}
								onChange={(e) => setVideoFilter('saturation', Number(e.target.value))}
							/>
							<Slider
								label="Hue"
								displayValue={`${videoFilters.hue >= 0 ? '+' : ''}${videoFilters.hue.toFixed(0)}\u00b0`}
								min={-180}
								max={180}
								step={1}
								value={videoFilters.hue}
								onChange={(e) => setVideoFilter('hue', Number(e.target.value))}
							/>
						</div>
					</>
				)}

				{/* ── Export Tab ── */}
				{videoMode === 'export' && (
					<>
						{selectedPreset ? (
							<>
								{/* Preset vs Custom toggle — only shown when a preset is selected */}
								<div className="flex rounded-lg border border-border overflow-hidden">
									<button
										onClick={() => setUseCustomExport(false)}
										className={`flex-1 py-2 text-[13px] font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
											!useCustomExport
												? 'bg-accent/15 text-accent'
												: 'text-text-tertiary hover:text-text-secondary'
										}`}
									>
										Use Preset
									</button>
									<button
										onClick={() => setUseCustomExport(true)}
										className={`flex-1 py-2 text-[13px] font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
											useCustomExport
												? 'bg-accent/15 text-accent'
												: 'text-text-tertiary hover:text-text-secondary'
										}`}
									>
										Custom
									</button>
								</div>

								{!useCustomExport ? (
									<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
										<div className="flex justify-between text-sm">
											<span className="text-text-tertiary">Preset</span>
											<span className="font-mono text-text-secondary">
												{VIDEO_PRESETS.find(([k]) => k === selectedPreset)?.[1]?.name ?? '—'}
											</span>
										</div>
										<div className="flex justify-between text-sm">
											<span className="text-text-tertiary">Clip duration</span>
											<span className="font-mono text-text-secondary">
												{clipDuration.toFixed(1)}s
											</span>
										</div>
									</div>
								) : (
									<AdvancedSettings
										settings={advancedSettings}
										onChange={setAdvancedSettings}
										hasAudio={audioStreams.length > 0 && tracks.audioEnabled}
										defaultExpanded
									/>
								)}
							</>
						) : (
							<AdvancedSettings
								settings={advancedSettings}
								onChange={setAdvancedSettings}
								hasAudio={audioStreams.length > 0 && tracks.audioEnabled}
								defaultExpanded
							/>
						)}

						{/* Audio / Subtitle track controls */}
						{(audioStreams.length > 0 || subtitleStreams.length > 0) && (
							<div className="flex flex-col gap-3">
								<h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">
									Track Selection
								</h3>

								{audioStreams.length > 0 && (
									<div className="flex items-center gap-2">
										<button
											onClick={() => setTracks({ audioEnabled: !tracks.audioEnabled })}
											className={`h-8 w-8 flex items-center justify-center rounded-md border transition-all cursor-pointer ${
												tracks.audioEnabled
													? 'border-accent/30 bg-accent/10 text-accent'
													: 'border-border bg-surface-raised/60 text-text-tertiary'
											}`}
											title={tracks.audioEnabled ? 'Disable audio' : 'Enable audio'}
										>
											{tracks.audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
										</button>
										<span className="text-sm text-text-secondary flex-1">Audio</span>
										{tracks.audioEnabled && audioStreams.length > 1 && (
											<select
												value={tracks.audioTrackIndex}
												onChange={(e) => setTracks({ audioTrackIndex: Number(e.target.value) })}
												className="h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] text-text cursor-pointer focus:outline-none focus:border-accent/50"
											>
												{audioStreams.map((s, i) => (
													<option key={s.index} value={i}>
														Track {i + 1}
														{s.language ? ` (${s.language})` : ''} — {s.codec}
													</option>
												))}
											</select>
										)}
									</div>
								)}

								{subtitleStreams.length > 0 && (
									<div className="flex items-center gap-2">
										<button
											onClick={() => setTracks({ subtitleEnabled: !tracks.subtitleEnabled })}
											className={`h-8 w-8 flex items-center justify-center rounded-md border transition-all cursor-pointer ${
												tracks.subtitleEnabled
													? 'border-accent/30 bg-accent/10 text-accent'
													: 'border-border bg-surface-raised/60 text-text-tertiary'
											}`}
											title={tracks.subtitleEnabled ? 'Disable subtitles' : 'Enable subtitles'}
										>
											<Subtitles size={13} />
										</button>
										<span className="text-sm text-text-secondary flex-1">Subtitles</span>
										{tracks.subtitleEnabled && subtitleStreams.length > 1 && (
											<select
												value={tracks.subtitleTrackIndex}
												onChange={(e) =>
													setTracks({ subtitleTrackIndex: Number(e.target.value) })
												}
												className="h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] text-text cursor-pointer focus:outline-none focus:border-accent/50"
											>
												{subtitleStreams.map((s, i) => (
													<option key={s.index} value={i}>
														Track {i + 1}
														{s.language ? ` (${s.language})` : ''} — {s.codec}
													</option>
												))}
											</select>
										)}
									</div>
								)}
							</div>
						)}

						{/* Export summary */}
						<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Clip duration</span>
								<span className="font-mono text-text-secondary">{clipDuration.toFixed(1)}s</span>
							</div>
							{(useCustomExport || !selectedPreset) && (
								<>
									<div className="flex justify-between text-sm">
										<span className="text-text-tertiary">Codec</span>
										<span className="font-mono text-text-secondary">{advancedSettings.codec}</span>
									</div>
									<div className="flex justify-between text-sm">
										<span className="text-text-tertiary">Container</span>
										<span className="font-mono text-text-secondary">
											.{advancedSettings.container}
										</span>
									</div>
									<div className="flex justify-between text-sm">
										<span className="text-text-tertiary">CRF</span>
										<span className="font-mono text-text-secondary">{advancedSettings.crf}</span>
									</div>
								</>
							)}
							{resize.width !== resize.originalWidth || resize.height !== resize.originalHeight ? (
								<div className="flex justify-between text-sm">
									<span className="text-text-tertiary">Output size</span>
									<span className="font-mono text-text-secondary">
										{resize.width}&times;{resize.height}
									</span>
								</div>
							) : null}
						</div>

						{resultUrl && (
							<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
								<p className="text-xs text-success font-medium">Export ready</p>
							</div>
						)}
					</>
				)}
			</div>

			{/* Actions */}
			<div className="p-4 border-t border-border flex flex-col gap-2">
				{processing && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center justify-between text-sm">
							<span className="text-text-tertiary">Exporting...</span>
							<span className="font-mono font-medium tabular-nums text-accent">
								{(Math.max(0, progress) * 100).toFixed(2)}%
							</span>
						</div>
						<div className="h-1.5 rounded-full bg-border overflow-hidden">
							<div
								className="h-full rounded-full bg-accent transition-[width] duration-300"
								style={{ width: `${Math.max(0, progress) * 100}%` }}
							/>
						</div>
						{exportStats.fps > 0 && (
							<div className="flex gap-3 text-[11px] text-text-tertiary font-mono tabular-nums">
								<span>{exportStats.fps.toFixed(1)} fps</span>
								<span>{exportStats.speed.toFixed(1)}x</span>
								<span>frame {exportStats.frame}</span>
							</div>
						)}
					</div>
				)}

				<div className="flex gap-2">
					<Button
						className="flex-1"
						disabled={!file || !ready || processing}
						onClick={() => {
							handleExport();
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

				{error && <p className="text-sm text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}

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
								fallbackSubtitleVtt={subtitlePreviewVtt}
								assSubtitleContent={assSubtitleContent}
								onLoadedMetadata={handleVideoLoaded}
								onTimeUpdate={handleTimeUpdate}
								onSeek={handleSeek}
								processing={processing}
								progress={progress}
							/>
						) : (
							<div className="flex flex-col items-center gap-6">
								<EmptyState
									isDragging={isDragging}
									onChooseFile={() => fileInputRef.current?.click()}
								/>
								<MonetagAd zoneId={MONETAG_ZONES.sidebar} className="w-full max-w-xs" />
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
							<div className="flex items-center gap-2 sm:gap-3 mb-3">
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
								<span className="hidden sm:inline text-[13px] font-mono text-text-tertiary tabular-nums mr-3">
									Frame {formatNumber(timeToFrames(currentTime))} /{' '}
									{formatNumber(timeToFrames(duration))}
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
				<aside className="hidden md:flex w-80 xl:w-88 shrink-0 overflow-hidden border-l border-border bg-surface flex-col">
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
				<VideoInfoModal
					file={file}
					probeResult={probeResult}
					duration={duration}
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
