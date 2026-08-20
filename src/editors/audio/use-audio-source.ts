import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WaveformPeaks } from "~/core/audio";
import {
	computeTrackPeaks,
	createAudioWindowReader,
	decodeAudioTrack,
	estimateDecodedBytes,
	FULL_DECODE_CEILING_BYTES,
	openMedia,
	type AudioWindowReader,
	type MediaProbe,
	type OpenedInput,
} from "~/core/media";

export type AudioSourceState = {
	readonly probe: MediaProbe | null;
	readonly opened: OpenedInput | null;
	/**
	 * The whole track, decoded. Null for material too long to hold in memory —
	 * one hour of stereo 48 kHz float32 is about 1.4 GB — in which case
	 * `reader` serves playback a window at a time.
	 */
	readonly buffer: AudioBuffer | null;
	readonly reader: AudioWindowReader | null;
	readonly peaks: WaveformPeaks | null;
	readonly loading: boolean;
	readonly progress: number;
	readonly error: string | null;
	/** True when the file was too long to decode whole. */
	readonly windowed: boolean;
};

const PEAK_BUCKETS = 2000;

/** How much audio is decoded ahead when the file is too long to hold whole. */
const WINDOW_SECONDS = 10;

/**
 * Decodes a file and produces both the playable buffer and the waveform peaks.
 *
 * Decoding goes through Mediabunny rather than `AudioContext.decodeAudioData`
 * so that a file the browser cannot natively play — AC-3, DTS — still opens,
 * and so that preview and export read the same samples (I1 applied to audio).
 */
export function useAudioSource(file: File | null): AudioSourceState {
	const [state, setState] = useState<AudioSourceState>({
		probe: null,
		opened: null,
		buffer: null,
		reader: null,
		peaks: null,
		loading: false,
		progress: 0,
		error: null,
		windowed: false,
	});

	useEffect(() => {
		if (file === null) return;
		let cancelled = false;
		let opened: OpenedInput | null = null;

		const load = async () => {
			setState((current) => ({ ...current, loading: true, progress: 0, error: null }));
			try {
				const input = await openMedia(file, file.name);
				opened = input;
				if (cancelled) return;
				setState((current) => ({ ...current, probe: input.probe, opened: input }));

				const track = input.probe.audioTracks[0];
				const decodedBytes = estimateDecodedBytes(
					input.probe.durationSec,
					track?.sampleRate ?? 48_000,
					track?.channels ?? 2,
				);
				const windowed = decodedBytes > FULL_DECODE_CEILING_BYTES;

				// Peaks are folded in as chunks arrive and the chunks dropped, so the
				// waveform costs the same whether the file lasts a minute or an hour.
				const peaks = await computeTrackPeaks(input, PEAK_BUCKETS, {
					onProgress: (ratio) => {
						if (!cancelled) setState((current) => ({ ...current, progress: ratio }));
					},
				});
				if (cancelled) return;

				if (windowed) {
					const reader = await createAudioWindowReader(input);
					if (cancelled) return;
					setState((current) => ({
						...current,
						reader,
						peaks,
						loading: false,
						progress: 1,
						windowed: true,
					}));
					return;
				}

				const decoded = await decodeAudioTrack(input);
				if (cancelled) return;
				setState((current) => ({
					...current,
					buffer: decoded.buffer,
					peaks,
					loading: false,
					progress: 1,
					windowed: false,
				}));
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

export type AudioPlayback = {
	readonly playing: boolean;
	readonly positionSec: number;
	readonly volume: number;
	readonly muted: boolean;
	readonly speed: number;
	readonly spectrum: Float32Array | null;
	readonly togglePlay: () => void;
	readonly seek: (seconds: number) => void;
	readonly setVolume: (volume: number) => void;
	readonly toggleMute: () => void;
	readonly setSpeed: (speed: number) => void;
};

/**
 * Playback over Web Audio, driven by the decoded buffer.
 *
 * No `<audio>` element anywhere: it would be a second source of truth, and the
 * spectrum has to come from the same samples the export will use.
 */
export function useAudioPlayback(
	buffer: AudioBuffer | null,
	reader: AudioWindowReader | null = null,
	durationSec = 0,
): AudioPlayback {
	const contextRef = useRef<AudioContext | null>(null);
	const sourceRef = useRef<AudioBufferSourceNode | null>(null);
	const gainRef = useRef<GainNode | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const startedAtRef = useRef(0);
	const offsetRef = useRef(0);
	const frameRef = useRef<number | null>(null);
	/** Cancels the window chain when playback stops or seeks. */
	const windowStopRef = useRef<(() => void) | null>(null);

	const [playing, setPlaying] = useState(false);
	const [positionSec, setPositionSec] = useState(0);
	const [volume, setVolumeState] = useState(1);
	const [muted, setMuted] = useState(false);
	const [speed, setSpeedState] = useState(1);
	const [spectrum, setSpectrum] = useState<Float32Array | null>(null);

	const ensureContext = useCallback(() => {
		if (contextRef.current === null) {
			const context = new AudioContext();
			const gain = context.createGain();
			const analyser = context.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.8;
			gain.connect(analyser);
			analyser.connect(context.destination);
			contextRef.current = context;
			gainRef.current = gain;
			analyserRef.current = analyser;
		}
		return contextRef.current;
	}, []);

	const stop = useCallback(() => {
		windowStopRef.current?.();
		windowStopRef.current = null;
		sourceRef.current?.stop();
		sourceRef.current?.disconnect();
		sourceRef.current = null;
	}, []);

	/**
	 * Schedules playback from a position.
	 *
	 * With the whole track decoded this is one node. For material too long to
	 * hold in memory it decodes a window at a time and chains the windows, so
	 * seeking an hour-long file costs a few seconds of decode rather than the
	 * whole programme.
	 */
	const start = useCallback(
		(fromSec: number) => {
			const context = ensureContext();
			const gain = gainRef.current;
			if (gain === null) return;
			stop();

			startedAtRef.current = context.currentTime;
			offsetRef.current = fromSec;

			if (buffer !== null) {
				const source = context.createBufferSource();
				source.buffer = buffer;
				source.playbackRate.value = speed;
				source.connect(gain);
				source.addEventListener("ended", () => setPlaying(false), { once: true });
				source.start(0, fromSec);
				sourceRef.current = source;
				return;
			}

			if (reader === null) return;

			let windowStart = fromSec;
			let stopped = false;
			const scheduleNext = async () => {
				if (stopped) return;
				const windowEnd = Math.min(durationSec, windowStart + WINDOW_SECONDS);
				if (windowEnd <= windowStart) {
					setPlaying(false);
					return;
				}

				const chunk = await reader.read(windowStart, windowEnd);
				if (stopped || chunk === null) {
					setPlaying(false);
					return;
				}

				const source = context.createBufferSource();
				source.buffer = chunk;
				source.playbackRate.value = speed;
				source.connect(gain);
				source.addEventListener("ended", () => void scheduleNext(), { once: true });
				source.start();
				sourceRef.current = source;
				windowStart = windowEnd;
			};

			windowStopRef.current = () => {
				stopped = true;
			};
			void scheduleNext();
		},
		[buffer, reader, durationSec, ensureContext, speed, stop],
	);

	useEffect(() => {
		if (!playing) {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
			return;
		}

		const tick = () => {
			const context = contextRef.current;
			const analyser = analyserRef.current;
			if (context !== null) {
				const elapsed = (context.currentTime - startedAtRef.current) * speed;
				const total = buffer?.duration ?? durationSec;
				setPositionSec(Math.min(total, offsetRef.current + elapsed));
			}
			if (analyser !== null) {
				const data = new Float32Array(analyser.frequencyBinCount);
				analyser.getFloatFrequencyData(data);
				setSpectrum(data);
			}
			frameRef.current = requestAnimationFrame(tick);
		};

		frameRef.current = requestAnimationFrame(tick);
		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		};
	}, [playing, speed, buffer, durationSec]);

	useEffect(
		() => () => {
			stop();
			void contextRef.current?.close();
			contextRef.current = null;
		},
		[stop],
	);

	return useMemo<AudioPlayback>(
		() => ({
			playing,
			positionSec,
			volume,
			muted,
			speed,
			spectrum,
			togglePlay: () => {
				if (playing) {
					const context = contextRef.current;
					if (context !== null) {
						offsetRef.current += (context.currentTime - startedAtRef.current) * speed;
					}
					stop();
					setPlaying(false);
				} else {
					start(offsetRef.current);
					setPlaying(true);
				}
			},
			seek: (seconds) => {
				offsetRef.current = seconds;
				setPositionSec(seconds);
				if (playing) start(seconds);
			},
			setVolume: (next) => {
				setVolumeState(next);
				setMuted(next === 0);
				if (gainRef.current !== null) gainRef.current.gain.value = next;
			},
			toggleMute: () => {
				const next = !muted;
				setMuted(next);
				if (gainRef.current !== null) gainRef.current.gain.value = next ? 0 : volume;
			},
			setSpeed: (next) => {
				// Rebase first: the elapsed time so far ran at the old rate, and
				// applying the new one retroactively makes the playhead jump.
				const context = contextRef.current;
				if (context !== null && playing) {
					offsetRef.current += (context.currentTime - startedAtRef.current) * speed;
					startedAtRef.current = context.currentTime;
				}
				setSpeedState(next);
				if (sourceRef.current !== null) sourceRef.current.playbackRate.value = next;
			},
		}),
		[playing, positionSec, volume, muted, speed, spectrum, start, stop],
	);
}
