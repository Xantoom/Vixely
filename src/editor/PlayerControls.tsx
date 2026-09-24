import { AudioLines, type LucideIcon, Pause, Play } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { codecName, formatPreciseTime } from '@/lib/format';
import { channelLayout, languageName } from '@/lib/language';
import type { AudioTrackInfo } from '@/media/audio-tracks';
import { usePlayback, usePlaybackLength } from '@/media/playback';
import { m } from '@/paraglide/messages.js';

/** A compact menu of the player: an icon, then the choice. */
export function PlayerMenu<T extends string>({
	icon: Icon,
	label,
	value,
	options,
	onChange,
}: {
	icon: LucideIcon;
	label: string;
	value: T;
	options: { value: T; label: string; disabled?: boolean }[];
	onChange: (value: T) => void;
}) {
	return (
		<label
			title={label}
			className="text-ink-2 hover:text-ink hover:bg-surface relative flex h-8 max-w-56 min-w-0 cursor-pointer items-center gap-1.5 rounded-sm pr-6 pl-2 shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
		>
			<Icon size={15} aria-hidden="true" className="flex-none" />
			<span className="text-ui truncate">{options.find((option) => option.value === value)?.label}</span>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => {
					const next = options.find((option) => option.value === event.target.value);
					if (next) onChange(next.value);
				}}
				className="absolute inset-0 cursor-pointer opacity-0"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} disabled={option.disabled}>
						{option.label}
					</option>
				))}
			</select>
			<span
				className="border-muted pointer-events-none absolute top-1/2 right-2.5 size-1.5 -translate-y-[70%] rotate-45 border-r-[1.5px] border-b-[1.5px]"
				aria-hidden="true"
			/>
		</label>
	);
}

/** `English, Director's commentary (AAC 5.1)`. */
export function audioTrackLabel(track: AudioTrackInfo): string {
	const name = [languageName(track.language), track.name].filter(Boolean).join(', ');
	const details = [track.codec ? codecName(track.codec) : null, channelLayout(track.channels)].filter(Boolean);
	return `${name} (${details.join(' ')})`;
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
			value={current === null ? '' : String(current)}
			options={[
				...(current === null ? [{ value: '', label: m.player_no_audio(), disabled: true }] : []),
				...tracks.map((track) => ({
					value: String(track.id),
					label: audioTrackLabel(track),
					disabled: !track.playable,
				})),
			]}
			onChange={(value) => {
				setAudioTrack(Number(value));
			}}
		/>
	);
}

/** Position bar: click or drag to go anywhere. */
function SeekBar() {
	const time = usePlayback((state) => state.time);
	const seek = usePlayback((state) => state.seek);
	const length = usePlaybackLength();
	return (
		<input
			type="range"
			aria-label={m.playhead()}
			min={0}
			max={Math.max(length, 0.001)}
			step={0.001}
			value={Math.min(time, length)}
			onChange={(event) => {
				seek(Number(event.target.value));
			}}
			className="accent-ed h-8 min-w-16 flex-1 cursor-pointer"
		/>
	);
}

/**
 * The controls under a video: play, time, position, audio track, and what the editor adds
 * (such as the subtitle track). Space plays and pauses where the editor listens for it.
 */
export function PlayerControls({ children }: { children?: ReactNode }) {
	const playing = usePlayback((state) => state.playing);
	const toggle = usePlayback((state) => state.toggle);
	const time = usePlayback((state) => state.time);
	const length = usePlaybackLength();
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
			<button
				type="button"
				aria-label={playing ? m.pause() : m.play()}
				title={playing ? m.pause() : m.play()}
				onClick={toggle}
				className="bg-ed text-ed-ink grid size-9 flex-none place-items-center rounded-full transition-[filter] hover:brightness-[1.07]"
			>
				{playing ? (
					<Pause size={16} fill="currentColor" strokeWidth={0} />
				) : (
					<Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
				)}
			</button>
			<span className="tabular font-mono text-[13px] font-medium whitespace-nowrap">
				{formatPreciseTime(time)}
				<span className="text-muted"> / {formatPreciseTime(length)}</span>
			</span>
			<SeekBar />
			<div className="flex min-w-0 items-center gap-1.5">
				<AudioTrackMenu />
				{children}
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
