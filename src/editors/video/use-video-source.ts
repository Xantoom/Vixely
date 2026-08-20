import { useCallback, useEffect, useRef, useState } from "react";
import {
	createVideoReader,
	openMedia,
	type MediaProbe,
	type OpenedInput,
	type VideoReader,
} from "~/core/media";
import { createContainerBackend, type SubtitleTrackInfo } from "~/core/container";
import { closeFrame } from "~/core/media";

export type VideoSourceState = {
	readonly probe: MediaProbe | null;
	readonly opened: OpenedInput | null;
	readonly reader: VideoReader | null;
	/** Read by core/container, because Mediabunny reports none. */
	readonly subtitleTracks: readonly SubtitleTrackInfo[];
	readonly loading: boolean;
	readonly error: string | null;
};

export function useVideoSource(file: File | null): VideoSourceState {
	const [state, setState] = useState<VideoSourceState>({
		probe: null,
		opened: null,
		reader: null,
		subtitleTracks: [],
		loading: false,
		error: null,
	});

	useEffect(() => {
		if (file === null) return;
		let cancelled = false;
		let opened: OpenedInput | null = null;

		const load = async () => {
			setState((current) => ({ ...current, loading: true, error: null }));
			try {
				const input = await openMedia(file, file.name);
				opened = input;
				if (cancelled) return;

				const reader = await createVideoReader(input);
				if (cancelled) return;

				// Subtitle tracks come from our own reader: this is the one place
				// where the container layer is not optional.
				let subtitleTracks: readonly SubtitleTrackInfo[] = [];
				try {
					const bytes = new Uint8Array(await file.arrayBuffer());
					const backend = createContainerBackend();
					if (backend.canRead(bytes)) {
						subtitleTracks = await backend.readSubtitleTracks(bytes);
					}
				} catch {
					// A container we cannot read for subtitles is not a failure:
					// the video is still perfectly editable.
				}

				if (cancelled) return;
				setState({
					probe: input.probe,
					opened: input,
					reader,
					subtitleTracks,
					loading: false,
					error: null,
				});
			} catch (cause) {
				if (cancelled) return;
				setState((current) => ({
					...current,
					loading: false,
					error: cause instanceof Error ? cause.message : String(cause),
				}));
			}
		};

		void load();
		return () => {
			cancelled = true;
			opened?.dispose();
		};
	}, [file]);

	return state;
}

export type SeekPrecision = "time" | "keyframe" | "frame";

export type VideoPlayback = {
	readonly frame: VideoFrame | null;
	readonly positionSec: number;
	readonly playing: boolean;
	readonly precision: SeekPrecision;
	readonly seek: (timeSec: number) => void;
	readonly step: (direction: -1 | 1) => void;
	readonly togglePlay: () => void;
	readonly setPrecision: (precision: SeekPrecision) => void;
};

/**
 * Drives the preview from the decoder.
 *
 * Every frame handed out has exactly one owner — this hook — and is closed when
 * it is replaced or on unmount. A frame leaked during a scrub takes the tab's
 * memory down with it in seconds (I4).
 */
export function useVideoPlayback(reader: VideoReader | null, durationSec: number): VideoPlayback {
	const [frame, setFrame] = useState<VideoFrame | null>(null);
	const [positionSec, setPositionSec] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [precision, setPrecision] = useState<SeekPrecision>("time");

	const currentRef = useRef<VideoFrame | null>(null);
	const pendingRef = useRef(false);

	const show = useCallback((next: VideoFrame | null) => {
		// The previous frame is closed the moment it is replaced.
		closeFrame(currentRef.current);
		currentRef.current = next;
		setFrame(next);
	}, []);

	const seek = useCallback(
		(timeSec: number) => {
			if (reader === null) return;
			const clamped = Math.max(0, Math.min(durationSec, timeSec));
			setPositionSec(clamped);

			// One decode in flight at a time: a scrub otherwise queues hundreds.
			if (pendingRef.current) return;
			pendingRef.current = true;

			void (async () => {
				try {
					const target =
						precision === "keyframe"
							? ((await reader.keyframeBefore(clamped)) ?? clamped)
							: clamped;
					const next = await reader.frameAt(target);
					show(next);
					if (precision === "keyframe" && target !== clamped) setPositionSec(target);
				} finally {
					pendingRef.current = false;
				}
			})();
		},
		[reader, durationSec, precision, show],
	);

	const step = useCallback(
		(direction: -1 | 1) => {
			if (reader === null) return;
			void (async () => {
				if (precision === "keyframe") {
					const target =
						direction === 1
							? await reader.nextKeyframe(positionSec)
							: await reader.keyframeBefore(Math.max(0, positionSec - 0.001));
					if (target !== null) seek(target);
					return;
				}

				const next = await reader.stepFrom(positionSec, direction);
				if (next === null) return;
				show(next);
				setPositionSec(next.timestamp / 1e6);
			})();
		},
		[reader, positionSec, precision, seek, show],
	);

	// Playback advances frame by frame from the decoder, never from a <video>.
	useEffect(() => {
		if (!playing || reader === null) return;
		let stopped = false;
		let last = performance.now();
		let time = positionSec;

		const tick = async () => {
			if (stopped) return;
			const now = performance.now();
			const elapsed = (now - last) / 1000;
			last = now;
			time = Math.min(durationSec, time + elapsed);

			const next = await reader.frameAt(time);
			if (stopped) {
				closeFrame(next);
				return;
			}
			show(next);
			setPositionSec(time);

			if (time >= durationSec) {
				setPlaying(false);
				return;
			}
			requestAnimationFrame(() => void tick());
		};

		requestAnimationFrame(() => void tick());
		return () => {
			stopped = true;
		};
		// `positionSec` is read once at the start on purpose: including it would
		// restart playback on every frame.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [playing, reader, durationSec, show]);

	useEffect(
		() => () => {
			closeFrame(currentRef.current);
			currentRef.current = null;
		},
		[],
	);

	return {
		frame,
		positionSec,
		playing,
		precision,
		seek,
		step,
		togglePlay: () => setPlaying((value) => !value),
		setPrecision,
	};
}
