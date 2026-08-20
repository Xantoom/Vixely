import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode } from "~/i18n/format.ts";
import { cn } from "~/ui/cn.ts";
import { IconButton } from "~/ui/primitives/icon-button.tsx";
import { SegmentedControl } from "~/ui/primitives/segmented-control.tsx";
import { Select } from "~/ui/primitives/select.tsx";
import { Slider } from "~/ui/primitives/slider.tsx";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export type SeekPrecision = "time" | "keyframe" | "frame";

export type TransportTrack = {
	readonly id: number;
	readonly label: string;
};

export type PlayerTransportProps = {
	playing: boolean;
	onTogglePlay: () => void;
	positionSec: number;
	durationSec: number;
	onSeek: (seconds: number) => void;
	volume: number;
	muted: boolean;
	onVolumeChange: (volume: number) => void;
	onToggleMute: () => void;
	speed: number;
	onSpeedChange: (speed: number) => void;
	/** Track picker, shown only when the media actually has several. */
	tracks?: readonly TransportTrack[];
	selectedTrackId?: number;
	onTrackChange?: (id: number) => void;
	/** Video only: the three navigation precisions. */
	precision?: SeekPrecision;
	onPrecisionChange?: (precision: SeekPrecision) => void;
	onStep?: (direction: -1 | 1) => void;
	onToggleFullscreen?: () => void;
	fullscreen?: boolean;
	/** Milliseconds shown in the timecode; frames need them, music does not. */
	showMilliseconds?: boolean;
	className?: string;
};

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

/**
 * The transport shared by the audio and video players.
 *
 * Nothing native is used: `<video controls>` and `<audio controls>` are both
 * ruled out, and this covers what the brief asks of them — play/pause, seeking,
 * volume with mute, speed, track selection, full screen, and for video the
 * three seek precisions.
 */
export function PlayerTransport({
	playing,
	onTogglePlay,
	positionSec,
	durationSec,
	onSeek,
	volume,
	muted,
	onVolumeChange,
	onToggleMute,
	speed,
	onSpeedChange,
	tracks,
	selectedTrackId,
	onTrackChange,
	precision,
	onPrecisionChange,
	onStep,
	onToggleFullscreen,
	fullscreen = false,
	showMilliseconds = false,
	className,
}: PlayerTransportProps) {
	const t = useTranslate();

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-sunken)] px-2 py-1.5",
				className,
			)}
		>
			<IconButton
				label={playing ? t("player.pause") : t("player.play")}
				onPress={onTogglePlay}
				variant="solid"
			>
				{playing ? (
					<svg aria-hidden width="14" height="14" viewBox="0 0 16 16" className="fill-current">
						<rect x="3.5" y="2.5" width="3.5" height="11" rx="0.5" />
						<rect x="9" y="2.5" width="3.5" height="11" rx="0.5" />
					</svg>
				) : (
					<svg aria-hidden width="14" height="14" viewBox="0 0 16 16" className="fill-current">
						<path d="M4 2.6a.5.5 0 0 1 .77-.42l8 5.4a.5.5 0 0 1 0 .84l-8 5.4A.5.5 0 0 1 4 13.4Z" />
					</svg>
				)}
			</IconButton>

			{onStep !== undefined && (
				<>
					<IconButton label={t("player.previousFrame")} onPress={() => onStep(-1)} size="sm">
						<svg aria-hidden width="12" height="12" viewBox="0 0 16 16" className="fill-current">
							<path d="M11.5 3v10L5 8Z" />
							<rect x="3.5" y="3" width="1.4" height="10" />
						</svg>
					</IconButton>
					<IconButton label={t("player.nextFrame")} onPress={() => onStep(1)} size="sm">
						<svg aria-hidden width="12" height="12" viewBox="0 0 16 16" className="fill-current">
							<path d="M4.5 3v10L11 8Z" />
							<rect x="11.1" y="3" width="1.4" height="10" />
						</svg>
					</IconButton>
				</>
			)}

			<span className="tabular shrink-0 text-xs text-[var(--text-muted)]">
				{formatTimecode(positionSec, showMilliseconds)} /{" "}
				{formatTimecode(durationSec, showMilliseconds)}
			</span>

			<div className="min-w-32 flex-1">
				<Slider
					label={t("player.play")}
					value={positionSec}
					onChange={onSeek}
					min={0}
					max={Math.max(durationSec, 0.001)}
					step={showMilliseconds ? 0.001 : 0.01}
					defaultValue={0}
					showInput={false}
				/>
			</div>

			<VolumeControl
				volume={volume}
				muted={muted}
				onVolumeChange={onVolumeChange}
				onToggleMute={onToggleMute}
			/>

			<Select<number>
				label={t("player.speed")}
				hideLabel
				value={speed}
				onChange={onSpeedChange}
				options={SPEEDS.map((value) => ({ id: value, label: `${value}×` }))}
				className="w-20"
			/>

			{tracks !== undefined && tracks.length > 1 && onTrackChange !== undefined && (
				<Select<number>
					label={t("player.trackSelection")}
					hideLabel
					value={selectedTrackId ?? tracks[0]?.id ?? 0}
					onChange={onTrackChange}
					options={tracks.map((track) => ({ id: track.id, label: track.label }))}
					className="w-36"
				/>
			)}

			{precision !== undefined && onPrecisionChange !== undefined && (
				<SegmentedControl<SeekPrecision>
					label={t("player.precision")}
					value={precision}
					onChange={onPrecisionChange}
					size="sm"
					options={[
						{ id: "time", label: t("player.precision.time") },
						{ id: "keyframe", label: t("player.precision.keyframe") },
						{ id: "frame", label: t("player.precision.frame") },
					]}
				/>
			)}

			{onToggleFullscreen !== undefined && (
				<IconButton
					label={fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")}
					onPress={onToggleFullscreen}
				>
					<svg
						aria-hidden
						width="14"
						height="14"
						viewBox="0 0 16 16"
						className="fill-none stroke-current stroke-[1.4]"
					>
						{fullscreen ? (
							<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" strokeLinecap="round" />
						) : (
							<path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" />
						)}
					</svg>
				</IconButton>
			)}
		</div>
	);
}

function VolumeControl({
	volume,
	muted,
	onVolumeChange,
	onToggleMute,
}: {
	volume: number;
	muted: boolean;
	onVolumeChange: (volume: number) => void;
	onToggleMute: () => void;
}) {
	const t = useTranslate();

	return (
		<div className="flex items-center gap-1">
			<IconButton
				label={muted ? t("player.unmute") : t("player.mute")}
				onPress={onToggleMute}
				size="sm"
			>
				<svg
					aria-hidden
					width="14"
					height="14"
					viewBox="0 0 16 16"
					className="fill-none stroke-current stroke-[1.4]"
				>
					<path d="M3 6h2.5L9 3v10L5.5 10H3Z" strokeLinejoin="round" />
					{muted || volume === 0 ? (
						<path d="M11.5 6.5 14 9M14 6.5 11.5 9" strokeLinecap="round" />
					) : (
						<path d="M11.3 5.8a3.2 3.2 0 0 1 0 4.4" strokeLinecap="round" />
					)}
				</svg>
			</IconButton>
			<div className="w-20">
				<Slider
					label={t("player.volume")}
					value={muted ? 0 : volume}
					onChange={onVolumeChange}
					min={0}
					max={1}
					step={0.01}
					defaultValue={1}
					showInput={false}
				/>
			</div>
		</div>
	);
}

/**
 * Hides the chrome after inactivity in full screen, and brings it back on the
 * slightest movement or key press.
 *
 * The timer is armed from the activity listeners rather than from an effect
 * body, so entering full screen costs one render rather than two.
 */
export function useAutoHideControls(active: boolean, delayMs = 2500): boolean {
	const [visible, setVisible] = useState(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const arm = useCallback(() => {
		setVisible(true);
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setVisible(false), delayMs);
	}, [delayMs]);

	useEffect(() => {
		if (!active) return;

		const events = ["pointermove", "keydown", "pointerdown"] as const;
		for (const event of events) globalThis.addEventListener(event, arm);
		// Armed asynchronously: a synchronous set here would be a second render
		// for something no user can perceive.
		const initial = setTimeout(arm, 0);

		return () => {
			clearTimeout(initial);
			for (const event of events) globalThis.removeEventListener(event, arm);
			if (timerRef.current !== null) clearTimeout(timerRef.current);
		};
	}, [active, arm]);

	return active ? visible : true;
}
