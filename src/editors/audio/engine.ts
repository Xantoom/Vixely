import { useEffect, useMemo, useState } from 'react';
import { AudioPlayer } from '@/media/audio-player';
import type { Loudness, LoudnessReading } from '@/media/loudness';
import { type Peaks, readPeaks } from '@/media/peaks';
import { type AudioDoc, envelope, keptRanges, resolveGain } from './document';
import { useAudioDoc, useAudioEditor } from './store';

export interface WaveformState {
	peaks: Peaks | null;
	loudness: Loudness | null;
	/** Changes every time peaks arrive, so views redraw. */
	version: number;
	failed: boolean;
}

export interface AudioEngine {
	player: AudioPlayer | null;
	waveform: WaveformState;
	/** Loudness of the kept audio with its fades but no gain, once the whole file is read. */
	reading: LoudnessReading | null;
	/** The document as it sounds, normalization applied. Playback and export use this one. */
	resolved: AudioDoc;
	togglePlay: () => void;
	/** Moves the playhead, and playback with it. */
	seek: (time: number) => void;
}

/**
 * Opens a file for playback and reads its waveform. Playback always follows the current
 * document: a gain change is heard at once, a cut restarts from the same moment without it.
 * `track` picks one audio track of a video with several; null is the file's main one.
 */
export function useAudioEngine(file: File | null, duration: number, track: number | null = null): AudioEngine {
	const doc = useAudioDoc();
	const setPlayhead = useAudioEditor((state) => state.setPlayhead);
	const setPlaying = useAudioEditor((state) => state.setPlaying);
	const [player, setPlayer] = useState<AudioPlayer | null>(null);
	const [waveform, setWaveform] = useState<WaveformState>({ peaks: null, loudness: null, version: 0, failed: false });

	useEffect(() => {
		if (!file) return;
		const next = new AudioPlayer(file, track);
		next.onTime = setPlayhead;
		next.onStateChange = setPlaying;
		setPlayer(next);
		return () => {
			next.dispose();
			setPlaying(false);
			setPlayer(null);
		};
	}, [file, track, setPlayhead, setPlaying]);

	useEffect(() => {
		if (!file || duration <= 0) return;
		const reader = readPeaks(
			file,
			duration,
			() => {
				setWaveform((state) => ({ ...state, version: state.version + 1 }));
			},
			track,
		);
		setWaveform({ peaks: reader.peaks, loudness: reader.loudness, version: 0, failed: false });
		reader.done.catch(() => {
			setWaveform((state) => ({ ...state, failed: true }));
		});
		return () => {
			reader.cancel();
			setWaveform({ peaks: null, loudness: null, version: 0, failed: false });
		};
	}, [file, duration, track]);

	const complete = waveform.peaks?.complete ?? false;
	const { loudness } = waveform;
	const { trim, cuts, fadeIn, fadeOut, duration: length } = doc;
	const reading = useMemo(() => {
		if (!complete || !loudness) return null;
		const unity = { ...doc, gain: 0 };
		return loudness.measure(keptRanges(unity), envelope(unity));
		// Only what changes the measured audio: gain is applied afterwards, as an offset.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [complete, loudness, trim, cuts, fadeIn, fadeOut, length]);
	const resolved = useMemo(() => resolveGain(doc, reading), [doc, reading]);

	const plan = useMemo(() => ({ ranges: keptRanges(resolved), envelope: envelope(resolved) }), [resolved]);
	useEffect(() => {
		player?.setPlan(plan);
	}, [player, plan]);

	return useMemo(
		() => ({
			player,
			waveform,
			reading,
			resolved,
			togglePlay: () => {
				if (!player) return;
				if (player.playing) {
					player.pause();
				} else {
					player.seek(useAudioEditor.getState().playhead);
					void player.play();
				}
			},
			seek: (time: number) => {
				setPlayhead(time);
				player?.seek(time);
			},
		}),
		[player, waveform, reading, resolved, setPlayhead],
	);
}
