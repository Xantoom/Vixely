import { AudioLines, type LucideIcon, Pause, Play } from 'lucide-react';
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
			className={`bg-ed-gradient text-ed-ink ease-spring relative grid ${box} flex-none place-items-center rounded-full shadow-[0_6px_16px_-8px_var(--ed)] transition-[transform,filter,box-shadow] duration-200 enabled:hover:scale-[1.06] enabled:hover:brightness-[1.06] enabled:hover:shadow-[0_8px_22px_-8px_var(--ed)] enabled:active:scale-[0.94] disabled:opacity-45`}
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

/** A button on the picture, over whatever it shows: dark glass that stays readable on any frame. */
const ON_PICTURE =
	'size-9 min-w-9 rounded-full bg-black/50 text-white backdrop-blur-md shadow-[0_2px_10px_rgb(0_0_0/0.25)] hover:bg-black/70 hover:text-white aria-expanded:bg-black/75 aria-expanded:text-white';

/** A player's menu, as an icon: on the picture, or in a bar under a sound with no picture. */
export function PlayerMenu<T extends string>({
	icon: Icon,
	label,
	value,
	items,
	onChange,
	onPicture = true,
	active = false,
}: {
	icon: LucideIcon;
	label: string;
	value: T | null;
	items: MenuItem<T>[];
	onChange: (value: T) => void;
	onPicture?: boolean;
	/** Something is on (subtitles shown): a mark under the icon, as players do. */
	active?: boolean;
}) {
	return (
		<Menu
			label={label}
			title={label}
			value={value}
			items={items}
			onChange={onChange}
			buttonClassName={onPicture ? ON_PICTURE : 'shadow-[inset_0_0_0_1px_var(--line-2)]'}
		>
			<span className="relative grid place-items-center">
				<Icon size={18} aria-hidden="true" />
				{active && (
					<span
						className="bg-ed-line absolute -bottom-[5px] h-[2.5px] w-3.5 rounded-full"
						aria-hidden="true"
					/>
				)}
			</span>
		</Menu>
	);
}

/** Buttons laid on the picture's lower right corner, above the video itself. */
export function PictureButtons({ children }: { children: ReactNode }) {
	return <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5">{children}</div>;
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
export function AudioTrackMenu({ onPicture = true }: { onPicture?: boolean }) {
	const tracks = usePlayback((state) => state.details?.audioTracks ?? null);
	const current = usePlayback((state) => state.audioTrack);
	const setAudioTrack = usePlayback((state) => state.setAudioTrack);
	if (!tracks || tracks.length === 0) return null;
	return (
		<PlayerMenu
			icon={AudioLines}
			label={m.player_audio_track()}
			onPicture={onPicture}
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
			className="group/seek relative flex h-8 min-w-16 flex-1 cursor-pointer touch-none items-center rounded-full"
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
				<div
					className="bg-ed-line absolute inset-y-0 left-0 rounded-full"
					style={{ width: `${ratio * 100}%` }}
				/>
				<div
					className="ease-spring absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-75 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.15),0_2px_6px_rgb(0_0_0/0.3)] transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 group-data-dragging-seek/seek:scale-110"
					style={{ left: `${ratio * 100}%` }}
				/>
			</div>
			{hover !== null && length > 0 && (
				<span
					className="bg-ink text-bg tabular pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-xs px-1.5 py-0.5 font-mono text-[12px] font-medium whitespace-nowrap"
					style={{ left: `${(hover / length) * 100}%` }}
				>
					{formatPreciseTime(hover)}
				</span>
			)}
		</div>
	);
}

/**
 * The controls under a video: play, time and position, and what the editor adds (the capture
 * button). Track choices sit on the picture. Space plays and pauses where the editor listens for it.
 */
export function PlayerControls({ children }: { children?: ReactNode }) {
	const playing = usePlayback((state) => state.playing);
	const toggle = usePlayback((state) => state.toggle);
	const time = usePlayback((state) => state.time);
	const length = usePlaybackLength();
	return (
		<div className="flex min-w-0 items-center gap-3">
			<PlayButton playing={playing} onToggle={toggle} />
			<span className="tabular font-mono text-[13px] font-medium whitespace-nowrap">
				{formatPreciseTime(time)}
				<span className="text-muted"> / {formatPreciseTime(length)}</span>
			</span>
			<SeekBar />
			{children && <div className="flex min-w-0 items-center gap-1.5">{children}</div>}
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
		player.attach(canvas);
		return () => {
			player.attach(null);
		};
	}, [player, video, width, height]);

	return (
		<div
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] bg-black shadow-[0_0_0_1px_var(--line)]"
			style={{ width, height }}
		>
			{video && <canvas ref={canvasRef} className="absolute inset-0 size-full" />}
			{children}
		</div>
	);
}
