import type JASSUB from 'jassub';
import { Play, Pause, Volume2, VolumeX, Maximize, Languages, AudioLines, Check, CircleOff } from 'lucide-react';
import { useRef, useState, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { formatTimecode } from '@/components/ui/index.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

interface VideoPlayerProps {
	src: string;
	videoRef: RefObject<HTMLVideoElement | null>;
	fallbackSubtitleVtt?: string | null;
	assSubtitleContent?: string | null;
	onLoadedMetadata?: () => void;
	onTimeUpdate?: () => void;
	onSeek?: (time: number) => void;
	processing?: boolean;
	progress?: number;
}

interface ParsedSubtitleCue {
	start: number;
	end: number;
	text: string;
}

const CRUNCHYROLL_SUBTITLE_FONT_STACK = '"Trebuchet MS", Verdana, "Noto Sans", sans-serif';

function formatTrackLine(trackName: string, language?: string, codec?: string, channels?: number): string {
	const lang = language?.trim() ? language.toUpperCase() : 'UND';
	const codecLabel = codec?.trim() ? codec.toUpperCase() : '-';
	const channelsLabel =
		channels == null
			? '-'
			: channels === 1
				? 'Mono'
				: channels === 2
					? 'Stereo'
					: channels === 6
						? '5.1'
						: channels === 8
							? '7.1'
							: `${channels}ch`;
	return `${trackName} - ${lang} - ${codecLabel} - ${channelsLabel}`;
}

function formatExactTime(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const secs = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function splitCommaFields(raw: string, expectedCount: number): string[] {
	if (expectedCount <= 1) return [raw.trim()];
	const parts: string[] = [];
	let rest = raw;
	for (let i = 0; i < expectedCount - 1; i++) {
		const comma = rest.indexOf(',');
		if (comma === -1) {
			parts.push(rest.trim());
			rest = '';
			continue;
		}
		parts.push(rest.slice(0, comma).trim());
		rest = rest.slice(comma + 1);
	}
	parts.push(rest.trim());
	return parts;
}

function parseAssDefaultFontFamily(assContent?: string | null): string | null {
	if (!assContent?.trim()) return null;
	const lines = assContent.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
	let section = '';
	let styleFormat: string[] = [];
	let firstFont: string | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith(';')) continue;
		if (line.startsWith('[') && line.endsWith(']')) {
			section = line.slice(1, -1);
			continue;
		}
		if (section !== 'V4+ Styles' && section !== 'V4 Styles') continue;
		if (line.startsWith('Format:')) {
			styleFormat = line
				.slice('Format:'.length)
				.split(',')
				.map((value) => value.trim());
			continue;
		}
		if (!line.startsWith('Style:') || styleFormat.length === 0) continue;

		const values = splitCommaFields(line.slice('Style:'.length).trim(), styleFormat.length);
		const indexByField = new Map(styleFormat.map((field, i) => [field.toLowerCase(), i] as const));
		const fontNameRaw = values[indexByField.get('fontname') ?? -1]?.trim();
		if (!fontNameRaw) continue;
		const fontName = fontNameRaw.replace(/^['"]|['"]$/g, '').trim();
		if (!fontName) continue;
		if (!firstFont) firstFont = fontName;

		const styleName = values[indexByField.get('name') ?? -1]?.trim().toLowerCase();
		if (styleName === 'default') return fontName;
	}

	return firstFont;
}

function parseVttTimestamp(input: string): number | null {
	const parts = input.trim().split(':');
	if (parts.length < 2 || parts.length > 3) return null;
	const secMs = parts.pop();
	if (!secMs) return null;
	const secMsParts = secMs.split('.');
	if (secMsParts.length !== 2) return null;

	const sec = Number(secMsParts[0]);
	const ms = Number(secMsParts[1]);
	const min = Number(parts.pop() ?? '0');
	const hour = Number(parts.pop() ?? '0');
	if (![hour, min, sec, ms].every((n) => Number.isFinite(n))) return null;

	return hour * 3600 + min * 60 + sec + ms / 1000;
}

function parseWebVttCues(vtt: string): ParsedSubtitleCue[] {
	if (!vtt.trim()) return [];
	const lines = vtt.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
	const cues: ParsedSubtitleCue[] = [];
	let i = 0;

	while (i < lines.length) {
		let line = lines[i]!.trim();
		if (!line) {
			i++;
			continue;
		}

		if (
			line.startsWith('WEBVTT') ||
			line.startsWith('NOTE') ||
			line.startsWith('STYLE') ||
			line.startsWith('REGION')
		) {
			i++;
			while (i < lines.length && lines[i]!.trim()) i++;
			continue;
		}

		if (!line.includes('-->')) {
			i++;
			if (i >= lines.length) break;
			line = lines[i]!.trim();
			if (!line.includes('-->')) continue;
		}

		const [left, rightRaw] = line.split('-->');
		if (!left || !rightRaw) {
			i++;
			continue;
		}
		const start = parseVttTimestamp(left.trim());
		const end = parseVttTimestamp(rightRaw.trim().split(/\s+/)[0] ?? '');
		if (start == null || end == null || end <= start) {
			i++;
			continue;
		}

		i++;
		const textLines: string[] = [];
		while (i < lines.length && lines[i]!.trim()) {
			textLines.push(lines[i]!);
			i++;
		}
		const text = textLines
			.join('\n')
			.replaceAll(/<[^>]+>/g, '')
			.trim();
		if (text) cues.push({ start, end, text });
	}

	return cues;
}

export function VideoPlayer({
	src,
	videoRef,
	fallbackSubtitleVtt,
	assSubtitleContent,
	onLoadedMetadata,
	onTimeUpdate,
	onSeek,
	processing,
	progress = 0,
}: VideoPlayerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const seekBarRef = useRef<HTMLDivElement>(null);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [openMenu, setOpenMenu] = useState<'audio' | 'subtitle' | null>(null);
	const [assRenderState, setAssRenderState] = useState<'inactive' | 'initializing' | 'ready' | 'failed'>('inactive');
	const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
	const [seekHoverRatio, setSeekHoverRatio] = useState<number | null>(null);
	const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
	const assRendererRef = useRef<JASSUB | null>(null);
	const assRendererVersionRef = useRef(0);

	const probeResult = useVideoEditorStore((s) => s.probeResult);
	const tracks = useVideoEditorStore((s) => s.tracks);
	const setTracks = useVideoEditorStore((s) => s.setTracks);
	const subtitleEnabled = tracks.subtitleEnabled;
	const audioStreams = probeResult?.streams.filter((s) => s.type === 'audio') ?? [];
	const subtitleStreams = probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [];
	const hasAudio = audioStreams.length > 0;
	const hasSubtitles = subtitleStreams.length > 0;
	const useFallbackSubtitleOverlay =
		subtitleEnabled && Boolean(fallbackSubtitleVtt) && (!assSubtitleContent || assRenderState !== 'ready');
	const fallbackSubtitleCues = useMemo(() => parseWebVttCues(fallbackSubtitleVtt ?? ''), [fallbackSubtitleVtt]);
	const fallbackSubtitleText = useMemo(() => {
		if (!useFallbackSubtitleOverlay || fallbackSubtitleCues.length === 0) return null;
		const activeTexts: string[] = [];
		for (const cue of fallbackSubtitleCues) {
			if (currentTime >= cue.start && currentTime <= cue.end) activeTexts.push(cue.text);
		}
		if (activeTexts.length === 0) return null;
		return activeTexts.join('\n');
	}, [useFallbackSubtitleOverlay, fallbackSubtitleCues, currentTime]);
	const fallbackSubtitleFontFamily = useMemo(() => {
		const parsedAssFont = parseAssDefaultFontFamily(assSubtitleContent);
		if (!parsedAssFont) return CRUNCHYROLL_SUBTITLE_FONT_STACK;
		return `"${parsedAssFont}", ${CRUNCHYROLL_SUBTITLE_FONT_STACK}`;
	}, [assSubtitleContent]);

	const destroyAssRenderer = useCallback(() => {
		assRendererVersionRef.current += 1;
		const renderer = assRendererRef.current;
		assRendererRef.current = null;
		if (!renderer) return;
		void renderer.destroy().catch((err) => {
			console.error('[video] Failed to destroy ASS renderer', err);
		});
	}, []);

	const resetHideTimer = useCallback(() => {
		setShowControls(true);
		clearTimeout(hideTimeout.current);
		if (playing) {
			hideTimeout.current = setTimeout(() => setShowControls(false), 2500);
		}
	}, [playing]);

	useEffect(() => {
		resetHideTimer();
		return () => clearTimeout(hideTimeout.current);
	}, [playing, resetHideTimer]);

	useEffect(() => {
		if (!showControls) setOpenMenu(null);
	}, [showControls]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const updateSize = () => {
			setContainerSize({ width: container.clientWidth, height: container.clientHeight });
		};
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		return () => {
			destroyAssRenderer();
		};
	}, [destroyAssRenderer]);

	useEffect(() => {
		const video = videoRef.current;
		const content = subtitleEnabled ? assSubtitleContent?.trim() : null;
		if (!video) {
			setAssRenderState('inactive');
			destroyAssRenderer();
			return;
		}

		let cancelled = false;
		const version = ++assRendererVersionRef.current;

		if (!content) {
			setAssRenderState('inactive');
			const clearTrack = async () => {
				try {
					const renderer = assRendererRef.current;
					if (!renderer) return;
					await renderer.setVideo(video);
					await renderer.ready;
					if (cancelled || version !== assRendererVersionRef.current) return;
					await renderer.renderer.freeTrack();
					if (cancelled || version !== assRendererVersionRef.current) return;
					if (video.paused) await renderer.resize(true);
				} catch (err) {
					console.error('[video] Failed to clear ASS track', err);
					destroyAssRenderer();
				}
			};
			void clearTrack();
			return () => {
				cancelled = true;
			};
		}

		setAssRenderState('initializing');

		const setupAssRenderer = async () => {
			try {
				const { default: JassubRenderer } = await import('jassub');
				if (cancelled || version !== assRendererVersionRef.current) return;

				let renderer = assRendererRef.current;
				if (!renderer) {
					renderer = new JassubRenderer({ video, subContent: content });
					assRendererRef.current = renderer;
					await renderer.ready;
				} else {
					await renderer.setVideo(video);
					await renderer.ready;
				}

				if (cancelled || version !== assRendererVersionRef.current) return;
				await renderer.renderer.setTrack(content);
				if (cancelled || version !== assRendererVersionRef.current) return;
				if (video.paused) await renderer.resize(true);
				if (cancelled || version !== assRendererVersionRef.current) return;
				setAssRenderState('ready');
			} catch (err) {
				console.error('[video] Failed to initialize ASS renderer', err);
				setAssRenderState('failed');
				destroyAssRenderer();
			}
		};

		void setupAssRenderer();

		return () => {
			cancelled = true;
		};
	}, [videoRef, subtitleEnabled, assSubtitleContent, destroyAssRenderer]);

	const handleMetadata = useCallback(() => {
		const v = videoRef.current;
		if (v) {
			setDuration(v.duration);
			setVideoSize({ width: v.videoWidth, height: v.videoHeight });
			onLoadedMetadata?.();
		}
	}, [videoRef, onLoadedMetadata]);

	const handleTimeUpdate = useCallback(() => {
		const v = videoRef.current;
		if (v) {
			setCurrentTime(v.currentTime);
			onTimeUpdate?.();
		}
	}, [videoRef, onTimeUpdate]);

	const handleSeeked = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		setCurrentTime(v.currentTime);
		onTimeUpdate?.();

		if (!v.paused || !subtitleEnabled || !assSubtitleContent?.trim()) return;
		const renderer = assRendererRef.current;
		if (!renderer) return;
		void renderer.resize(true).catch((err) => {
			console.error('[video] Failed to repaint ASS subtitles after seek', err);
		});
	}, [videoRef, onTimeUpdate, subtitleEnabled, assSubtitleContent]);

	const togglePlay = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) {
			v.play();
			setPlaying(true);
		} else {
			v.pause();
			setPlaying(false);
		}
	}, [videoRef]);

	const updateSeekHover = useCallback(
		(clientX: number): number | null => {
			const bar = seekBarRef.current;
			if (!bar || duration <= 0) return null;
			const rect = bar.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			setSeekHoverRatio(ratio);
			return ratio;
		},
		[duration],
	);

	const handleSeek = useCallback(
		(e: React.PointerEvent) => {
			const v = videoRef.current;
			if (!v) return;
			const ratio = updateSeekHover(e.clientX);
			if (ratio == null) return;
			const targetTime = ratio * duration;
			if (typeof v.fastSeek === 'function') {
				v.fastSeek(targetTime);
			} else {
				v.currentTime = targetTime;
			}
			setCurrentTime(targetTime);
			onSeek?.(targetTime);
		},
		[videoRef, duration, onSeek, updateSeekHover],
	);

	const handleSeekPointerMove = useCallback(
		(e: React.PointerEvent) => {
			updateSeekHover(e.clientX);
			if (e.buttons === 1) handleSeek(e);
		},
		[handleSeek, updateSeekHover],
	);

	const handleSeekPointerEnter = useCallback(
		(e: React.PointerEvent) => {
			updateSeekHover(e.clientX);
		},
		[updateSeekHover],
	);

	const handleSeekPointerLeave = useCallback(() => {
		setSeekHoverRatio(null);
	}, []);

	const toggleMute = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.muted = !muted;
		setMuted(!muted);
	}, [videoRef, muted]);

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = videoRef.current;
			if (!v) return;
			const val = Number(e.target.value);
			v.volume = val;
			setVolume(val);
			if (val === 0) {
				v.muted = true;
				setMuted(true);
			} else if (muted) {
				v.muted = false;
				setMuted(false);
			}
		},
		[videoRef, muted],
	);

	const toggleFullscreen = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			el.requestFullscreen();
		}
	}, []);

	const handleEnded = useCallback(() => setPlaying(false), []);

	const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
	const playerFrameStyle = useMemo(() => {
		const { width: videoWidth, height: videoHeight } = videoSize;
		const { width: containerWidth, height: containerHeight } = containerSize;
		if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
			return { width: '100%', height: '100%' } as const;
		}
		const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
		return { width: `${videoWidth * scale}px`, height: `${videoHeight * scale}px` } as const;
	}, [videoSize, containerSize]);

	return (
		<div
			ref={containerRef}
			className="relative w-full h-full group overflow-hidden flex items-center justify-center"
			onDragOver={(e) => e.preventDefault()}
		>
			<div
				className="relative overflow-hidden rounded-xl"
				style={playerFrameStyle}
				onPointerMove={resetHideTimer}
				onPointerLeave={() => playing && setShowControls(false)}
			>
				<video
					ref={videoRef}
					src={src}
					onLoadedMetadata={handleMetadata}
					onTimeUpdate={handleTimeUpdate}
					onSeeked={handleSeeked}
					onPlay={() => setPlaying(true)}
					onPause={() => setPlaying(false)}
					onEnded={handleEnded}
					onClick={togglePlay}
					draggable={false}
					onDragStart={(e) => e.preventDefault()}
					className="w-full h-full object-contain cursor-pointer"
				/>

				{fallbackSubtitleText && (
					<div className="pointer-events-none absolute inset-x-0 bottom-14 sm:bottom-16 z-10 flex justify-center px-3">
						<div
							className="max-w-[92%] whitespace-pre-line text-center text-sm sm:text-base font-semibold tracking-[0.01em] text-white [text-shadow:-1px_-1px_0_rgba(0,0,0,0.96),1px_-1px_0_rgba(0,0,0,0.96),-1px_1px_0_rgba(0,0,0,0.96),1px_1px_0_rgba(0,0,0,0.96),0_2px_4px_rgba(0,0,0,0.92)]"
							style={{ fontFamily: fallbackSubtitleFontFamily }}
						>
							{fallbackSubtitleText}
						</div>
					</div>
				)}

				<div
					className={`absolute bottom-0 left-0 right-0 rounded-b-xl bg-gradient-to-t from-black/80 to-transparent px-3 sm:px-4 pt-8 pb-3 transition-opacity duration-200 ${
						showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
					}`}
				>
					{/* Seek bar */}
					<div
						ref={seekBarRef}
						className="h-1.5 w-full bg-white/20 rounded-full mb-3 cursor-pointer relative group/seek touch-none"
						onPointerDown={handleSeek}
						onPointerEnter={handleSeekPointerEnter}
						onPointerMove={handleSeekPointerMove}
						onPointerLeave={handleSeekPointerLeave}
					>
						{seekHoverRatio != null && (
							<div
								className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md border border-white/20 bg-black/85 px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-white shadow-lg"
								style={{ left: `${seekHoverRatio * 100}%` }}
							>
								{formatExactTime(seekHoverRatio * duration)}
							</div>
						)}
						<div
							className="absolute inset-y-0 left-0 bg-accent rounded-full"
							style={{ width: `${pct}%` }}
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity"
							style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
						/>
					</div>

					<div className="flex items-center gap-2 sm:gap-3">
						{/* Play/Pause */}
						<button
							onClick={togglePlay}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							{playing ? <Pause size={18} /> : <Play size={18} />}
						</button>

						{/* Time */}
						<span className="text-[13px] font-mono text-white/80 tabular-nums">
							{formatTimecode(currentTime)} / {formatTimecode(duration)}
						</span>

						<div className="flex-1" />

						{/* Audio track selector */}
						<div className="relative">
							<button
								onClick={
									hasAudio ? () => setOpenMenu(openMenu === 'audio' ? null : 'audio') : undefined
								}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									!hasAudio
										? 'text-white/30 cursor-not-allowed'
										: openMenu === 'audio'
											? 'bg-white/20 text-white cursor-pointer'
											: 'text-white hover:bg-white/10 cursor-pointer'
								} ${hasAudio && !tracks.audioEnabled ? 'opacity-50' : ''}`}
								title="Audio tracks"
								disabled={!hasAudio}
							>
								<AudioLines size={16} />
							</button>
							{hasAudio && openMenu === 'audio' && (
								<TrackMenu
									label="Audio"
									enabled={tracks.audioEnabled}
									onToggle={() => setTracks({ audioEnabled: !tracks.audioEnabled })}
									onClose={() => setOpenMenu(null)}
									canDisable
									selectedIndex={tracks.audioTrackIndex}
									onSelect={(i) => setTracks({ audioTrackIndex: i })}
									streams={audioStreams.map((s, i) => ({
										line: formatTrackLine(`Track ${i + 1}`, s.language, s.codec, s.channels),
									}))}
								/>
							)}
						</div>

						{/* Subtitle track selector */}
						<div className="relative">
							<button
								onClick={
									hasSubtitles
										? () => setOpenMenu(openMenu === 'subtitle' ? null : 'subtitle')
										: undefined
								}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									!hasSubtitles
										? 'text-white/30 cursor-not-allowed'
										: openMenu === 'subtitle'
											? 'bg-white/20 text-white cursor-pointer'
											: 'text-white hover:bg-white/10 cursor-pointer'
								} ${hasSubtitles && !tracks.subtitleEnabled ? 'opacity-50' : ''}`}
								title="Subtitle tracks"
								disabled={!hasSubtitles}
							>
								<Languages size={16} />
							</button>
							{hasSubtitles && openMenu === 'subtitle' && (
								<TrackMenu
									label="Subtitles"
									enabled={tracks.subtitleEnabled}
									onToggle={() => setTracks({ subtitleEnabled: !tracks.subtitleEnabled })}
									onClose={() => setOpenMenu(null)}
									canDisable
									selectedIndex={tracks.subtitleTrackIndex}
									onSelect={(i) => setTracks({ subtitleTrackIndex: i })}
									streams={subtitleStreams.map((s, i) => ({
										line: formatTrackLine(`Track ${i + 1}`, s.language, s.codec, s.channels),
									}))}
								/>
							)}
						</div>

						{/* Volume */}
						<button
							onClick={toggleMute}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
						</button>
						<input
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={muted ? 0 : volume}
							onChange={handleVolumeChange}
							className="w-12 sm:w-16 h-1 accent-white"
						/>

						{/* Fullscreen */}
						<button
							onClick={toggleFullscreen}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							<Maximize size={16} />
						</button>
					</div>
				</div>
			</div>

			{/* Processing overlay */}
			{processing && (
				<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/80 backdrop-blur-sm">
					<div className="h-10 w-10 rounded-full border-[3px] border-border border-t-accent animate-spin" />
					<p className="mt-3 text-sm font-medium font-mono tabular-nums">
						Exporting... {(Math.max(0, progress) * 100).toFixed(2)}%
					</p>
					<div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
						<div
							className="h-full bg-accent transition-all duration-300"
							style={{ width: `${Math.max(0, progress) * 100}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

function TrackMenu({
	label,
	enabled,
	onToggle,
	onClose,
	canDisable,
	selectedIndex,
	onSelect,
	streams,
}: {
	label: string;
	enabled: boolean;
	onToggle: () => void;
	onClose: () => void;
	canDisable: boolean;
	selectedIndex: number;
	onSelect: (index: number) => void;
	streams: { line: string }[];
}) {
	return (
		<div className="absolute bottom-full right-0 mb-2 w-[min(20rem,80vw)] rounded-md border border-white/15 bg-neutral-950/95 backdrop-blur-md shadow-[0_10px_20px_rgba(0,0,0,0.45)] animate-fade-in overflow-hidden">
			<div className="px-2 py-1.5 border-b border-white/10">
				<p className="text-[11px] font-semibold text-white/60 uppercase tracking-[0.12em]">{label}</p>
			</div>

			<div className="p-1 space-y-1">
				{canDisable && (
					<button
						onClick={() => {
							onToggle();
							onClose();
						}}
						className={`w-full text-left rounded px-1.5 py-1 transition-colors cursor-pointer border ${
							!enabled
								? 'bg-white/12 border-white/30 text-white'
								: 'bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white'
						}`}
					>
						<div className="flex items-center gap-2">
							<CircleOff size={14} className={!enabled ? 'text-white' : 'text-white/55'} />
							<span className="text-[11px] font-medium">Off</span>
							{!enabled && <Check size={14} className="ml-auto text-white" />}
						</div>
					</button>
				)}

				<div className="max-h-32 overflow-y-auto pr-0.5 space-y-1">
					{streams.map((stream, i) => {
						const isActive = enabled && selectedIndex === i;
						return (
							<button
								key={i}
								onClick={() => {
									if (!enabled) onToggle();
									onSelect(i);
									onClose();
								}}
								className={`w-full text-left rounded px-1.5 py-1 transition-all cursor-pointer border ${
									isActive
										? 'bg-accent/22 border-accent/45 text-white'
										: 'bg-white/[0.02] border-white/10 text-white/80 hover:bg-white/[0.06] hover:text-white'
								}`}
							>
								<div className="flex items-center gap-2">
									<p className="min-w-0 flex-1 text-[11px] font-medium text-white/90 truncate">
										{stream.line}
									</p>
									<div
										className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
											isActive
												? 'border-accent bg-accent text-white'
												: 'border-white/25 text-transparent'
										}`}
									>
										<Check size={11} />
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
