import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type MediaDetails, MediaPlayer } from '@/media/media-player';
import { type Peaks, readPeaks } from '@/media/peaks';
import type { OpenedFile } from '@/media/session';
import { lastEnd } from './document';
import { parseSubtitles } from './formats';
import { decodeText, detectEncoding, type EncodingId } from './formats/encoding';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Room after the last cue when there is no video, so it can be moved later. */
const TAIL = 10;

/** Plays nothing, keeps time: the timeline and preview of subtitles without a video. */
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

	dispose() {
		cancelAnimationFrame(this.frame);
		this.frame = 0;
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

export interface PreviewMedia {
	file: File;
	player: MediaPlayer;
	details: MediaDetails | null;
	failed: boolean;
}

export interface SubtitleEngine {
	/** The subtitle file could not be read as subtitles. */
	unreadable: boolean;
	/** Video or audio played under the subtitles, chosen by the user. */
	media: PreviewMedia | null;
	waveform: { peaks: Peaks | null; version: number };
	attachMedia: (file: File | null) => void;
	/** Reads the file again with another character set. */
	setEncoding: (encoding: EncodingId) => void;
	togglePlay: () => void;
	/** Seconds. */
	seek: (time: number) => void;
}

/**
 * Reads the subtitle file into the document, keeps time for the preview (the chosen video, or a
 * silent clock), and reads the waveform of the video's sound, which shows where lines are spoken.
 */
export function useSubtitleEngine(opened: OpenedFile | null): SubtitleEngine {
	const doc = useSubtitleDoc();
	const load = useSubtitleEditor((state) => state.load);
	const reload = useSubtitleEditor((state) => state.reload);
	const setPlayhead = useSubtitleEditor((state) => state.setPlayhead);
	const setPlaying = useSubtitleEditor((state) => state.setPlaying);
	const setLength = useSubtitleEditor((state) => state.setLength);
	const [bytes, setBytes] = useState<Uint8Array | null>(null);
	const [unreadable, setUnreadable] = useState(false);
	const [media, setMedia] = useState<PreviewMedia | null>(null);
	const [clock] = useState(() => new Clock());
	const [waveform, setWaveform] = useState<{ peaks: Peaks | null; version: number }>({ peaks: null, version: 0 });

	useEffect(() => {
		if (!opened) return;
		let current = true;
		setUnreadable(false);
		void opened.file.arrayBuffer().then((buffer) => {
			if (!current) return;
			const data = new Uint8Array(buffer);
			const encoding = detectEncoding(data);
			const parsed = parseSubtitles(decodeText(data, encoding));
			setBytes(data);
			if (parsed) load(opened, parsed, encoding);
			else setUnreadable(true);
		});
		return () => {
			current = false;
		};
	}, [opened, load]);

	const setEncoding = useCallback(
		(encoding: EncodingId) => {
			if (!bytes) return;
			const parsed = parseSubtitles(decodeText(bytes, encoding));
			if (parsed) reload(parsed, encoding);
		},
		[bytes, reload],
	);

	// The timeline spans the video, or the subtitles and a little more.
	const subtitlesEnd = lastEnd(doc) / 1000;
	const mediaDuration = media?.details?.duration ?? null;
	const length = Math.max(mediaDuration ?? 0, mediaDuration === null ? subtitlesEnd + TAIL : 0, 1);
	useEffect(() => {
		setLength(length);
		clock.length = length;
	}, [length, clock, setLength]);

	useEffect(() => {
		clock.onTime = setPlayhead;
		clock.onStateChange = setPlaying;
		return () => {
			clock.dispose();
		};
	}, [clock, setPlayhead, setPlaying]);

	// The player lives in a ref: creating it inside a state updater would run twice in development.
	const mediaRef = useRef<PreviewMedia | null>(null);
	const attachMedia = useCallback(
		(file: File | null) => {
			clock.pause();
			mediaRef.current?.player.dispose();
			if (!file) {
				mediaRef.current = null;
				setMedia(null);
				return;
			}
			const player = new MediaPlayer(file);
			player.onTime = setPlayhead;
			player.onStateChange = setPlaying;
			const update = (change: Partial<PreviewMedia>) => {
				if (mediaRef.current?.player !== player) return;
				mediaRef.current = { ...mediaRef.current, ...change };
				setMedia(mediaRef.current);
			};
			mediaRef.current = { file, player, details: null, failed: false };
			setMedia(mediaRef.current);
			player.ready.then(
				(details) => {
					update({ details });
					player.seek(useSubtitleEditor.getState().playhead);
				},
				() => {
					update({ failed: true });
				},
			);
		},
		[clock, setPlayhead, setPlaying],
	);

	useEffect(
		() => () => {
			mediaRef.current?.player.dispose();
			mediaRef.current = null;
		},
		[],
	);

	const withAudio = media?.details?.audio ? media : null;
	useEffect(() => {
		if (!withAudio?.details) return;
		const reader = readPeaks(withAudio.file, withAudio.details.duration, () => {
			setWaveform((state) => ({ ...state, version: state.version + 1 }));
		});
		setWaveform({ peaks: reader.peaks, version: 0 });
		reader.done.catch(() => undefined);
		return () => {
			reader.cancel();
			setWaveform({ peaks: null, version: 0 });
		};
	}, [withAudio]);

	const player = media && !media.failed ? media.player : clock;

	return useMemo(
		() => ({
			unreadable,
			media,
			waveform,
			attachMedia,
			setEncoding,
			togglePlay: () => {
				if (player.playing) {
					player.pause();
				} else {
					player.seek(useSubtitleEditor.getState().playhead);
					void player.play();
				}
			},
			seek: (time: number) => {
				setPlayhead(time);
				player.seek(time);
			},
		}),
		[unreadable, media, waveform, attachMedia, setEncoding, player, setPlayhead],
	);
}
