import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computePeaks, type WaveformPeaks } from "~/core/audio";
import {
	channelsOf,
	decodeAudioTrack,
	openMedia,
	type MediaProbe,
	type OpenedInput,
} from "~/core/media";

export type AudioSourceState = {
	readonly probe: MediaProbe | null;
	readonly opened: OpenedInput | null;
	readonly buffer: AudioBuffer | null;
	readonly peaks: WaveformPeaks | null;
	readonly loading: boolean;
	readonly progress: number;
	readonly error: string | null;
};

const PEAK_BUCKETS = 2000;

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
		peaks: null,
		loading: false,
		progress: 0,
		error: null,
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

				const decoded = await decodeAudioTrack(input, {
					onProgress: (ratio) => {
						if (!cancelled) setState((current) => ({ ...current, progress: ratio }));
					},
				});
				if (cancelled) return;

				setState((current) => ({
					...current,
					buffer: decoded.buffer,
					peaks: computePeaks(channelsOf(decoded.buffer), PEAK_BUCKETS, decoded.durationSec),
					loading: false,
					progress: 1,
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
export function useAudioPlayback(buffer: AudioBuffer | null): AudioPlayback {
	const contextRef = useRef<AudioContext | null>(null);
	const sourceRef = useRef<AudioBufferSourceNode | null>(null);
	const gainRef = useRef<GainNode | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const startedAtRef = useRef(0);
	const offsetRef = useRef(0);
	const frameRef = useRef<number | null>(null);

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
		sourceRef.current?.stop();
		sourceRef.current?.disconnect();
		sourceRef.current = null;
	}, []);

	const start = useCallback(
		(fromSec: number) => {
			if (buffer === null) return;
			const context = ensureContext();
			stop();

			const source = context.createBufferSource();
			source.buffer = buffer;
			source.playbackRate.value = speed;
			const gain = gainRef.current;
			if (gain === null) return;
			source.connect(gain);
			source.addEventListener("ended", () => setPlaying(false), { once: true });
			source.start(0, fromSec);

			sourceRef.current = source;
			startedAtRef.current = context.currentTime;
			offsetRef.current = fromSec;
		},
		[buffer, ensureContext, speed, stop],
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
				setPositionSec(Math.min(buffer?.duration ?? 0, offsetRef.current + elapsed));
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
	}, [playing, speed, buffer]);

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
				setSpeedState(next);
				if (sourceRef.current !== null) sourceRef.current.playbackRate.value = next;
			},
		}),
		[playing, positionSec, volume, muted, speed, spectrum, start, stop],
	);
}
