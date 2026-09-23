import { useEffect, useMemo, useState } from 'react';
import { AudioPlayer } from '@/media/audio-player';
import { type Peaks, readPeaks } from '@/media/peaks';
import { envelope, keptRanges } from './document';
import { useAudioDoc, useAudioEditor } from './store';

export interface WaveformState {
	peaks: Peaks | null;
	/** Changes every time peaks arrive, so views redraw. */
	version: number;
	failed: boolean;
}

export interface AudioEngine {
	player: AudioPlayer | null;
	waveform: WaveformState;
	togglePlay: () => void;
	/** Moves the playhead, and playback with it. */
	seek: (time: number) => void;
}

/**
 * Opens a file for playback and reads its waveform. Playback always follows the current
 * document: a gain change is heard at once, a cut restarts from the same moment without it.
 */
export function useAudioEngine(file: File | null, duration: number): AudioEngine {
	const doc = useAudioDoc();
	const setPlayhead = useAudioEditor((state) => state.setPlayhead);
	const setPlaying = useAudioEditor((state) => state.setPlaying);
	const [player, setPlayer] = useState<AudioPlayer | null>(null);
	const [waveform, setWaveform] = useState<WaveformState>({ peaks: null, version: 0, failed: false });

	useEffect(() => {
		if (!file) return;
		const next = new AudioPlayer(file);
		next.onTime = setPlayhead;
		next.onStateChange = setPlaying;
		setPlayer(next);
		return () => {
			next.dispose();
			setPlaying(false);
			setPlayer(null);
		};
	}, [file, setPlayhead, setPlaying]);

	useEffect(() => {
		if (!file || duration <= 0) return;
		const reader = readPeaks(file, duration, () => {
			setWaveform((state) => ({ ...state, version: state.version + 1 }));
		});
		setWaveform({ peaks: reader.peaks, version: 0, failed: false });
		reader.done.catch(() => {
			setWaveform((state) => ({ ...state, failed: true }));
		});
		return () => {
			reader.cancel();
			setWaveform({ peaks: null, version: 0, failed: false });
		};
	}, [file, duration]);

	const plan = useMemo(() => ({ ranges: keptRanges(doc), envelope: envelope(doc) }), [doc]);
	useEffect(() => {
		player?.setPlan(plan);
	}, [player, plan]);

	return useMemo(
		() => ({
			player,
			waveform,
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
		[player, waveform, setPlayhead],
	);
}
