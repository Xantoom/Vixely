import { create } from 'zustand';
import type { Range } from '@/document/timemap';
import type { MediaDetails, MediaPlayer } from './media-player';

/** Plays nothing, keeps time: the preview of subtitles without a video. */
class Clock {
	onTime: (time: number) => void = () => {};
	onStateChange: (playing: boolean) => void = () => {};
	length = 0;
	private anchor = { page: 0, time: 0 };
	private position = 0;
	private frame = 0;

	get playing(): boolean {
		return this.frame !== 0;
	}

	time(): number {
		if (!this.playing) return this.position;
		return Math.min(this.length, this.anchor.time + (performance.now() - this.anchor.page) / 1000);
	}

	play() {
		if (this.playing) return;
		const from = this.position >= this.length - 0.01 ? 0 : this.position;
		this.anchor = { page: performance.now(), time: from };
		this.frame = requestAnimationFrame(this.tick);
		this.onStateChange(true);
	}

	pause() {
		if (!this.playing) return;
		this.position = this.time();
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.onStateChange(false);
	}

	seek(time: number) {
		this.position = Math.max(0, time);
		if (this.playing) this.anchor = { page: performance.now(), time: this.position };
	}

	private tick = () => {
		const time = this.time();
		this.onTime(time);
		if (time >= this.length) {
			this.position = this.length;
			this.frame = 0;
			this.onStateChange(false);
			return;
		}
		this.frame = requestAnimationFrame(this.tick);
	};
}

interface PlaybackState {
	/** The video or audio file played, null for the silent clock. */
	file: File | null;
	player: MediaPlayer | null;
	details: MediaDetails | null;
	/** The file couldn't be played. */
	failed: boolean;
	/** Seconds. */
	time: number;
	playing: boolean;
	/** ID of the audio track heard. */
	audioTrack: number | null;
	/** Length of the silent clock, in seconds, when no file plays. */
	clockLength: number;
	/** Parts of the file played, in order, when an editor removed passages; null plays it all. */
	ranges: Range[] | null;

	/**
	 * Plays another file, or none. The same file keeps its player, its position and its audio
	 * track, so editors showing one video share them.
	 */
	load: (file: File | null) => void;
	play: () => void;
	pause: () => void;
	toggle: () => void;
	seek: (time: number) => void;
	/** Plays from `from` and stops at `to`, such as one subtitle line. */
	playRange: (from: number, to: number) => void;
	setAudioTrack: (id: number | null) => void;
	setClockLength: (length: number) => void;
	/** Plays only these parts of the file: the video editor's trim and cuts. Null plays it all. */
	setRanges: (ranges: Range[] | null) => void;
}

const clock = new Clock();
/** Where a range played with `playRange` stops. */
let stopAt: number | null = null;

/**
 * What plays in the editors: one video or audio file at a time, or a silent clock. The video and
 * subtitle editors share it, so going from one to the other keeps the same moment and track.
 */
export const usePlayback = create<PlaybackState>((set, get) => {
	const onTime = (time: number) => {
		if (stopAt !== null && time >= stopAt) {
			const end = stopAt;
			stopAt = null;
			source().pause();
			source().seek(end);
			set({ time: end });
			return;
		}
		set({ time });
	};
	const onStateChange = (playing: boolean) => {
		if (!playing) stopAt = null;
		set({ playing });
	};
	clock.onTime = onTime;
	clock.onStateChange = onStateChange;
	const source = () => {
		const { player, failed } = get();
		return player && !failed ? player : clock;
	};

	return {
		file: null,
		player: null,
		details: null,
		failed: false,
		time: 0,
		playing: false,
		audioTrack: null,
		clockLength: 0,
		ranges: null,

		load(file) {
			if (file === get().file) return;
			clock.pause();
			stopAt = null;
			get().player?.dispose();
			if (!file) {
				set({ file: null, player: null, details: null, failed: false, playing: false, audioTrack: null });
				return;
			}
			void import('./media-player').then(({ MediaPlayer }) => {
				if (get().file !== file || get().player) return;
				const player = new MediaPlayer(file);
				player.onTime = onTime;
				player.onStateChange = onStateChange;
				player.onAudioTrack = (audioTrack) => {
					if (get().player === player) set({ audioTrack });
				};
				set({ player });
				player.ready.then(
					(details) => {
						if (get().player !== player) return;
						set({ details });
						player.setRanges(get().ranges);
						player.seek(get().time);
					},
					() => {
						if (get().player === player) set({ failed: true });
					},
				);
			});
			set({ file, player: null, details: null, failed: false, playing: false, audioTrack: null });
		},

		play() {
			const player = source();
			player.seek(get().time);
			void player.play();
		},

		pause() {
			source().pause();
		},

		toggle() {
			if (source().playing) get().pause();
			else get().play();
		},

		seek(time) {
			stopAt = null;
			set({ time });
			source().seek(time);
		},

		playRange(from, to) {
			const player = source();
			player.pause();
			set({ time: from });
			player.seek(from);
			stopAt = to;
			void player.play();
		},

		setAudioTrack(id) {
			void get().player?.setAudioTrack(id);
		},

		setRanges(ranges) {
			set({ ranges });
			get().player?.setRanges(ranges);
		},

		setClockLength(length) {
			clock.length = length;
			set({ clockLength: length });
		},
	};
});

/** Length of what plays: the file, or the silent clock. */
export function usePlaybackLength(): number {
	return usePlayback((state) => state.details?.duration ?? state.clockLength);
}
