import { AudioLines, ChevronFirst, ChevronLast, type LucideIcon, Pause, Play } from 'lucide-react';
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from 'react';
import { codecName, formatPreciseTime } from '@/lib/format';
import { channelLayout, trackName } from '@/lib/language';
import type { AudioTrackInfo } from '@/media/audio-tracks';
import { usePlayback, usePlaybackLength } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { Menu, type MenuItem } from '@/ui/Menu';
import { VolumeControl } from './VolumeControl';

/**
 * The play button of every player: round, in the editor's colours, the icon swapping with a
 * short turn.
 */
export function PlayButton({
	playing,
	onToggle,
	disabled = false,
	size = 'md',
}: {
	playing: boolean;
	onToggle: () => void;
	disabled?: boolean;
	size?: 'md' | 'lg';
}) {
	const box = size === 'lg' ? 'size-11' : 'size-10';
	const icon = size === 'lg' ? 18 : 16;
	return (
		<button
			type="button"
			aria-label={playing ? m.pause() : m.play()}
			data-tip={playing ? m.pause() : m.play()}
			disabled={disabled}
			onClick={onToggle}
			className={`bg-ed text-ed-ink ease-spring relative grid ${box} flex-none place-items-center rounded-full transition-[transform,filter] duration-200 enabled:hover:scale-[1.06] enabled:hover:brightness-[1.06] enabled:active:scale-[0.94] disabled:opacity-45`}
		>
			<Play
				size={icon}
				fill="currentColor"
				strokeWidth={0}
				aria-hidden="true"
				className={`ease-spring absolute translate-x-px transition-[transform,opacity] duration-200 ${playing ? 'scale-50 -rotate-90 opacity-0' : ''}`}
			/>
			<Pause
				size={icon}
				fill="currentColor"
				strokeWidth={0}
				aria-hidden="true"
				className={`ease-spring absolute transition-[transform,opacity] duration-200 ${playing ? '' : 'scale-50 rotate-90 opacity-0'}`}
			/>
		</button>
	);
}

/** A player's menu, as an icon in the bar of the player. */
export function PlayerMenu<T extends string>({
	icon: Icon,
	label,
	value,
	items,
	onChange,
	active = false,
}: {
	icon: LucideIcon;
	label: string;
	value: T | null;
	items: MenuItem<T>[];
	onChange: (value: T) => void;
	/** Something is on (subtitles shown): a mark under the icon, as players do. */
	active?: boolean;
}) {
	return (
		<Menu label={label} title={label} value={value} items={items} onChange={onChange} buttonClassName="text-muted">
			<span className="relative grid place-items-center">
				<Icon size={18} aria-hidden="true" />
				{active && (
					<span className="bg-ed absolute -bottom-[5px] h-[2.5px] w-3.5 rounded-full" aria-hidden="true" />
				)}
			</span>
		</Menu>
	);
}

/** `English, Director's commentary`. */
export function audioTrackLabel(track: AudioTrackInfo): string {
	return trackName(track.language, track.name);
}

/** `AAC 5.1`. */
export function audioTrackDetail(track: AudioTrackInfo): string {
	return [track.codec ? codecName(track.codec) : null, channelLayout(track.channels)].filter(Boolean).join(' ');
}

/** Which audio track plays. Always offered, even for one track, so the user sees what they hear. */
export function AudioTrackMenu() {
	const tracks = usePlayback((state) => state.details?.audioTracks ?? null);
	const current = usePlayback((state) => state.audioTrack);
	const setAudioTrack = usePlayback((state) => state.setAudioTrack);
	if (!tracks || tracks.length === 0) return null;
	return (
		<PlayerMenu
			icon={AudioLines}
			label={m.player_audio_track()}
			value={current === null ? null : String(current)}
			items={tracks.map((track) => ({
				value: String(track.id),
				label: audioTrackLabel(track),
				detail: audioTrackDetail(track),
				disabled: !track.playable,
			}))}
			onChange={(value) => {
				setAudioTrack(Number(value));
			}}
		/>
	);
}

/** Seconds moved by the arrow keys on the bar; ten times more with Shift. */
const KEY_STEP = 1;

/**
 * The position bar: click or drag anywhere to go there. The part played fills with the editor's
 * colours; hovering shows the time under the pointer.
 */
function SeekBar() {
	const time = usePlayback((state) => state.time);
	const seek = usePlayback((state) => state.seek);
	const length = usePlaybackLength();
	const trackRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const shown = Math.min(time, length);
	const ratio = length > 0 ? shown / length : 0;

	const at = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return 0;
		return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * length;
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(true);
		seek(at(event.clientX));
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const moment = at(event.clientX);
		setHover(moment);
		if (dragging) seek(moment);
	};
	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const step = (event.shiftKey ? 10 : 1) * KEY_STEP;
		const target =
			event.key === 'ArrowLeft' || event.key === 'ArrowDown'
				? shown - step
				: event.key === 'ArrowRight' || event.key === 'ArrowUp'
					? shown + step
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? length
							: null;
		if (target === null) return;
		event.preventDefault();
		seek(Math.min(length, Math.max(0, target)));
	};

	useEffect(() => {
		if (!dragging) return;
		const stop = () => {
			setDragging(false);
		};
		window.addEventListener('pointerup', stop);
		window.addEventListener('pointercancel', stop);
		return () => {
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
		};
	}, [dragging]);

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={m.playhead()}
			aria-valuemin={0}
			aria-valuemax={Math.round(length * 1000) / 1000}
			aria-valuenow={Math.round(shown * 1000) / 1000}
			aria-valuetext={formatPreciseTime(shown)}
			data-dragging-seek={dragging || undefined}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerLeave={() => {
				setHover(null);
			}}
			onKeyDown={onKeyDown}
			className="group/seek relative flex h-6 min-w-16 cursor-pointer touch-none items-center rounded-full"
		>
			<div
				ref={trackRef}
				className="ease-out-soft relative h-1.5 bg-[var(--track-base)] w-full rounded-full transition-[height] duration-150 group-hover/seek:h-2 group-data-dragging-seek/seek:h-2"
			>
				{hover !== null && length > 0 && (
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_srgb,var(--ink)_22%,transparent)]"
						style={{ width: `${(hover / length) * 100}%` }}
					/>
				)}
				<div className="bg-ed absolute inset-y-0 left-0 rounded-full" style={{ width: `${ratio * 100}%` }} />
				<div
					className="ease-spring absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-75 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.15),0_2px_6px_rgb(0_0_0/0.3)] transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 group-data-dragging-seek/seek:scale-110"
					style={{ left: `${ratio * 100}%` }}
				/>
			</div>
			{hover !== null && length > 0 && (
				<span
					className="bg-ink text-bg tabular pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-xs px-1.5 py-0.5 text-caption font-medium whitespace-nowrap"
					style={{ left: `${(hover / length) * 100}%` }}
				>
					{formatPreciseTime(hover)}
				</span>
			)}
		</div>
	);
}

/** Goes one frame back or forward, paused, as editors do with the comma and period keys. */
function StepButton({ direction, frameRate }: { direction: -1 | 1; frameRate: number }) {
	const label = direction < 0 ? m.frame_back() : m.frame_forward();
	return (
		<button
			type="button"
			aria-label={label}
			data-tip={label}
			onClick={() => {
				const playback = usePlayback.getState();
				playback.pause();
				playback.seek(Math.max(0, playback.time + direction / frameRate));
			}}
			className="text-ink-2 hover:bg-surface hover:text-ink grid size-9 place-items-center rounded-full transition-colors max-sm:size-8"
		>
			{direction < 0 ? (
				<ChevronFirst className="size-[1.15rem]" aria-hidden="true" />
			) : (
				<ChevronLast className="size-[1.15rem]" aria-hidden="true" />
			)}
		</button>
	);
}

/**
 * The transport bar under a picture: the time on the left, frame back, play and frame forward in
 * the middle, and what the editor adds on the right (track choices, capture, zoom). A position
 * bar joins it where no timeline below does that job.
 */
export function PlayerControls({
	children,
	seek = true,
	frameRate = 30,
}: {
	children?: ReactNode;
	/** Shows the position bar; left out under a timeline, whose playhead already does it. */
	seek?: boolean;
	frameRate?: number;
}) {
	const playing = usePlayback((state) => state.playing);
	const toggle = usePlayback((state) => state.toggle);
	const time = usePlayback((state) => state.time);
	const length = usePlaybackLength();
	return (
		<div className="grid min-w-0 gap-1 max-md:px-3">
			{seek && <SeekBar />}
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-sm:gap-1.5">
				<div className="-ml-1.5 flex min-w-0 items-center gap-1.5">
					<VolumeControl />
					<span
						role="timer"
						aria-label={m.playhead()}
						className="tabular text-small min-w-0 truncate font-medium whitespace-nowrap"
					>
						{formatPreciseTime(time)}
						<span className="text-muted max-sm:hidden"> / {formatPreciseTime(length)}</span>
					</span>
				</div>
				<div className="flex items-center gap-1.5 max-sm:gap-0.5">
					<StepButton direction={-1} frameRate={frameRate} />
					<PlayButton playing={playing} onToggle={toggle} />
					<StepButton direction={1} frameRate={frameRate} />
				</div>
				<div className="-mr-1.5 flex min-w-0 items-center justify-end gap-0.5">{children}</div>
			</div>
		</div>
	);
}

/**
 * The picture of the playing file, contained in `size` and drawn by the shared player, with
 * whatever the editor lays on top (subtitles). Shows black while nothing plays.
 */
export function PlayerPicture({ width, height, children }: { width: number; height: number; children?: ReactNode }) {
	const player = usePlayback((state) => state.player);
	const video = usePlayback((state) => state.details?.video ?? null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !player || !video || width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		return player.attach(canvas);
	}, [player, video, width, height]);

	return (
		<div
			className="stage-picture absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black"
			style={{ width, height }}
		>
			{video && <canvas ref={canvasRef} className="absolute inset-0 size-full" />}
			{children}
		</div>
	);
}
