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
import { useAudioBitrates } from './use-audio-bitrates';

/**
 * The play button of every player: round, in the editor's colours, the icon swapping with a
 * short turn.
 */
function PlayButton({
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
		<Menu
			label={label}
			title={label}
			value={value}
			items={items}
			onChange={onChange}
			rows={4}
			buttonClassName="text-muted"
		>
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

/** `AAC, 5.1, 192 kb/s`: the bitrate once measured. */
export function audioTrackDetail(track: AudioTrackInfo, bitrate?: number): string {
	return [
		track.codec ? codecName(track.codec) : null,
		channelLayout(track.channels),
		bitrate ? `${bitrate} kb/s` : null,
	]
		.filter(Boolean)
		.join(', ');
}

/** Which audio track plays. Always offered, even for one track, so the user sees what they hear. */
export function AudioTrackMenu() {
	const own = usePlayback((state) => state.details?.audioTracks ?? null);
	const added = usePlayback((state) => state.addedAudio);
	const hidden = usePlayback((state) => state.hiddenAudio);
	const file = usePlayback((state) => state.file);
	const addedFiles = usePlayback((state) => state.addedFiles);
	const current = usePlayback((state) => state.audioTrack);
	const setAudioTrack = usePlayback((state) => state.setAudioTrack);
	const tracks = own ? [...own, ...added].filter((track) => !hidden.has(track.id)) : [];
	// Sound added from another file is that file's main track.
	const bitrates = useAudioBitrates(
		tracks.flatMap((track) => {
			const from = track.id < 0 ? addedFiles.get(track.id) : file;
			return from ? [{ key: track.id, file: from, id: track.id < 0 ? null : track.id }] : [];
		}),
	);
	if (tracks.length === 0) return null;
	return (
		<PlayerMenu
			icon={AudioLines}
			label={m.player_audio_track()}
			value={current === null ? null : String(current)}
			items={tracks.map((track) => ({
				value: String(track.id),
				label: audioTrackLabel(track),
				description: audioTrackDetail(track, bitrates.get(track.id)),
				disabled: !track.playable,
			}))}
			onChange={(value) => {
				setAudioTrack(Number(value));
			}}
		/>
	);
}

/** Where playback is, over how long the result lasts. */
export function PlayTime({
	time,
	length,
	short = false,
}: {
	time: number;
	length: number;
	/** The time alone, without the length: for a bar too narrow for both. */
	short?: boolean;
}) {
	return (
		<span
			role="timer"
			aria-label={m.playhead()}
			className="text-small tabular whitespace-nowrap [text-box:trim-both_cap_alphabetic]"
		>
			<span className="text-ink font-medium">{formatPreciseTime(Math.min(time, length), length)}</span>
			{/* On a phone the bar has room for the time alone. */}
			{!short && <span className="text-muted max-sm:hidden"> / {formatPreciseTime(length)}</span>}
		</span>
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
					className="bg-tip text-tip-ink tabular pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-xs px-1.5 py-0.5 text-caption shadow-[0_0_0_1px_var(--tip-line)] font-medium whitespace-nowrap"
					style={{ left: `${(hover / length) * 100}%` }}
				>
					{formatPreciseTime(hover)}
				</span>
			)}
		</div>
	);
}

/** Goes one frame back or forward, paused, as editors do with the comma and period keys. */
function StepButton({ direction, onStep, disabled }: { direction: -1 | 1; onStep: () => void; disabled: boolean }) {
	const label = direction < 0 ? m.frame_back() : m.frame_forward();
	return (
		<button
			type="button"
			aria-label={label}
			data-tip={label}
			disabled={disabled}
			onClick={onStep}
			className="text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink grid size-9 place-items-center rounded-full transition-colors disabled:opacity-45 max-sm:size-8"
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
 * The bar of every player, the same in each editor: where playback is on the left, frame
 * back, play and frame forward in the middle, and what the editor adds on the right (volume, tracks,
 * capture, comparison, zoom). Its icons line up with the edges of the timeline under it.
 */
export function PlayerBar({
	time,
	fit,
	playing,
	onToggle,
	onStep,
	disabled = false,
	children,
}: {
	/** Where playback is over the final length, on the left. */
	time?: ReactNode;
	/** Back to the timeline's default zoom, beside the time while zoomed. */
	fit?: ReactNode;
	playing: boolean;
	onToggle: () => void;
	/** One frame back or forward; left out where there are no frames (sound). */
	onStep?: (direction: -1 | 1) => void;
	disabled?: boolean;
	children?: ReactNode;
}) {
	return (
		<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-sm:gap-1.5">
			{/* All on one line above the timeline, the time lined up with its start. */}
			<div className="flex min-w-0 items-center gap-1.5">
				{time && <div className="flex min-w-0 items-center gap-2 overflow-hidden">{time}</div>}
				{fit}
			</div>
			<div className="flex items-center gap-1.5 max-sm:gap-0.5">
				{onStep && (
					<StepButton
						direction={-1}
						disabled={disabled}
						onStep={() => {
							onStep(-1);
						}}
					/>
				)}
				<PlayButton playing={playing} onToggle={onToggle} disabled={disabled} />
				{onStep && (
					<StepButton
						direction={1}
						disabled={disabled}
						onStep={() => {
							onStep(1);
						}}
					/>
				)}
			</div>
			<div className="-mr-2 flex min-w-0 items-center justify-end gap-0.5">{children}</div>
		</div>
	);
}

/**
 * The player's bar bound to the shared player, with the volume on the left. A position bar joins
 * it where no timeline below does that job.
 */
export function PlayerControls({
	children,
	time,
	fit,
	seek = true,
	frameRate = 30,
}: {
	children?: ReactNode;
	time?: ReactNode;
	fit?: ReactNode;
	/** Shows the position bar; left out over a timeline, whose playhead already does it. */
	seek?: boolean;
	frameRate?: number;
}) {
	const playing = usePlayback((state) => state.playing);
	const toggle = usePlayback((state) => state.toggle);
	return (
		<div className="grid min-w-0 gap-1">
			{seek && <SeekBar />}
			<PlayerBar
				time={time}
				fit={fit}
				playing={playing}
				onToggle={toggle}
				onStep={(direction) => {
					const playback = usePlayback.getState();
					playback.pause();
					playback.seek(Math.max(0, playback.time + direction / frameRate));
				}}
			>
				{children}
			</PlayerBar>
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
