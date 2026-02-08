import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import { formatTimecode } from '@/components/ui/index.ts';

interface VideoPlayerProps {
	src: string;
	videoRef: RefObject<HTMLVideoElement | null>;
	onLoadedMetadata?: () => void;
	onTimeUpdate?: () => void;
	processing?: boolean;
	progress?: number;
	cssFilter?: string;
}

export function VideoPlayer({
	src,
	videoRef,
	onLoadedMetadata,
	onTimeUpdate,
	processing,
	progress = 0,
	cssFilter,
}: VideoPlayerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const seekBarRef = useRef<HTMLDivElement>(null);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

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

	const handleMetadata = useCallback(() => {
		const v = videoRef.current;
		if (v) {
			setDuration(v.duration);
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

	const handleSeek = useCallback(
		(e: React.PointerEvent) => {
			const bar = seekBarRef.current;
			const v = videoRef.current;
			if (!bar || !v) return;
			const rect = bar.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
			const targetTime = ratio * duration;
			// Use fastSeek for smoother scrubbing when available
			if (typeof v.fastSeek === 'function') {
				v.fastSeek(targetTime);
			} else {
				v.currentTime = targetTime;
			}
			setCurrentTime(targetTime);
		},
		[videoRef, duration],
	);

	const handleSeekDrag = useCallback(
		(e: React.PointerEvent) => {
			if (e.buttons !== 1) return;
			handleSeek(e);
		},
		[handleSeek],
	);

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

	return (
		<div
			ref={containerRef}
			className="relative w-full max-w-7xl group"
			onPointerMove={resetHideTimer}
			onPointerLeave={() => playing && setShowControls(false)}
		>
			<video
				ref={videoRef}
				src={src}
				onLoadedMetadata={handleMetadata}
				onTimeUpdate={handleTimeUpdate}
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				onEnded={handleEnded}
				onClick={togglePlay}
				className="w-full rounded-xl bg-black cursor-pointer"
				style={cssFilter && cssFilter !== 'none' ? { filter: cssFilter } : undefined}
			/>

			{/* Custom controls overlay */}
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
					onPointerMove={handleSeekDrag}
				>
					<div
						className="absolute inset-y-0 left-0 bg-accent rounded-full transition-[width] duration-75"
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
					<span className="text-[11px] font-mono text-white/80 tabular-nums">
						{formatTimecode(currentTime)} / {formatTimecode(duration)}
					</span>

					<div className="flex-1" />

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

			{/* Processing overlay */}
			{processing && (
				<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/80 backdrop-blur-sm">
					<div className="h-10 w-10 rounded-full border-[3px] border-border border-t-accent animate-spin" />
					<p className="mt-3 text-sm font-medium">Exporting... {Math.round(progress * 100)}%</p>
					<div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
						<div
							className="h-full bg-accent transition-all duration-300"
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
