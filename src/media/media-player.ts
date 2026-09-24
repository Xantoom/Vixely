import { ALL_FORMATS, BlobSource, Input, type VideoSample, VideoSampleSink } from 'mediabunny';
import { AudioPlayer } from './audio-player';
import { type AudioTrackInfo, listAudioTracks } from './audio-tracks';

export interface MediaDetails {
	/** Seconds. */
	duration: number;
	/** Displayed size of the picture, rotation applied; null for audio files. */
	video: { width: number; height: number } | null;
	/** Every audio track of the file, playable or not. */
	audioTracks: AudioTrackInfo[];
}

async function nextFrame(): Promise<void> {
	await new Promise((resolve) => requestAnimationFrame(resolve));
}

/** The track players start with: the default one this browser can play, else the first it can. */
function firstAudioTrack(tracks: AudioTrackInfo[]): AudioTrackInfo | null {
	const playable = tracks.filter((track) => track.playable);
	return playable.find((track) => track.default && !track.commentary) ?? playable[0] ?? null;
}

/**
 * Plays a video file into a canvas, with one of its audio tracks. The audio player is the clock
 * when there is sound; pictures are decoded just ahead and drawn when their time comes. Without
 * sound, the page clock drives playback. Paused, the frame at the playhead is shown, so scrubbing
 * shows pictures.
 */
export class MediaPlayer {
	/** Called on every animation frame while playing, and when playback stops by itself. */
	onTime: (time: number) => void = () => {};
	onStateChange: (playing: boolean) => void = () => {};
	/** Called when another audio track starts playing. */
	onAudioTrack: (track: number | null) => void = () => {};
	readonly ready: Promise<MediaDetails>;

	private file: File;
	private input: Input;
	private sink: VideoSampleSink | null = null;
	/** Time of the first picture: it may come a little after zero. */
	private firstPicture = 0;
	private audio: AudioPlayer | null = null;
	private audioTrackId: number | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private duration = 0;
	/** Page clock, for files without sound. */
	private anchor = { page: 0, time: 0 };
	private position = 0;
	private clockPlaying = false;
	/** Incremented on every start and stop: a loop from an older run ends itself. */
	private run = 0;
	/** Paused frame requests: one at a time, the latest one wins. */
	private stillRequest: number | null = null;
	private stillBusy = false;
	private disposed = false;

	constructor(file: File) {
		this.file = file;
		this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		this.ready = this.open();
	}

	private async open(): Promise<MediaDetails> {
		const [video, audioTracks, duration] = await Promise.all([
			this.input.getPrimaryVideoTrack(),
			listAudioTracks(this.input),
			this.input.computeDuration(),
		]);
		this.duration = duration;
		let size: MediaDetails['video'] = null;
		if (video && (await video.canDecode())) {
			this.sink = new VideoSampleSink(video);
			const [width, height, first] = await Promise.all([
				video.getDisplayWidth(),
				video.getDisplayHeight(),
				video.getFirstTimestamp(),
			]);
			size = { width, height };
			this.firstPicture = Math.max(0, first);
		}
		const first = firstAudioTrack(audioTracks);
		if (first) await this.useAudio(first.id);
		return { duration, video: size, audioTracks };
	}

	get playing(): boolean {
		return this.audio ? this.audio.playing : this.clockPlaying;
	}

	/** ID of the audio track heard, null when none plays. */
	get audioTrack(): number | null {
		return this.audioTrackId;
	}

	time(): number {
		if (this.audio) return this.audio.time();
		if (!this.clockPlaying) return this.position;
		return Math.min(this.duration, this.anchor.time + (performance.now() - this.anchor.page) / 1000);
	}

	/** Plays another audio track from the same moment, or none (null). */
	async setAudioTrack(id: number | null) {
		await this.ready;
		if (this.disposed || id === this.audioTrackId) return;
		const wasPlaying = this.playing;
		const time = this.time();
		if (wasPlaying) this.pause();
		this.position = time;
		await this.useAudio(id);
		this.audio?.seek(time);
		if (wasPlaying) await this.play();
	}

	private async useAudio(id: number | null) {
		this.audio?.dispose();
		this.audio = null;
		this.audioTrackId = null;
		if (id !== null) {
			const audio = new AudioPlayer(this.file, id);
			if (await audio.playable()) {
				audio.setPlan({ ranges: [{ start: 0, end: this.duration }], envelope: [] });
				audio.onTime = (time) => {
					this.onTime(time);
				};
				audio.onStateChange = (playing) => {
					if (!playing) this.stopPictures();
					this.onStateChange(playing);
				};
				audio.seek(this.position);
				this.audio = audio;
				this.audioTrackId = id;
			} else {
				audio.dispose();
			}
		}
		this.onAudioTrack(this.audioTrackId);
	}

	/** Where pictures are drawn. The caller sizes it; `redraw` shows the current frame again. */
	attach(canvas: HTMLCanvasElement | null) {
		this.canvas = canvas;
		this.redraw();
	}

	redraw() {
		if (!this.playing) this.showStill(this.time());
	}

	async play() {
		await this.ready;
		if (this.disposed || this.playing) return;
		if (this.audio) {
			await this.audio.play();
		} else {
			// At the end, play starts again from the beginning, like any player.
			const from = this.position >= this.duration - 0.01 ? 0 : this.position;
			this.anchor = { page: performance.now(), time: from };
			this.clockPlaying = true;
			this.onStateChange(true);
			void this.tick(this.run);
		}
		void this.playPictures(this.run, this.time());
	}

	pause() {
		if (!this.playing) return;
		this.position = this.time();
		this.stopPictures();
		if (this.audio) {
			this.audio.pause();
		} else {
			this.clockPlaying = false;
			this.onStateChange(false);
		}
		this.showStill(this.position);
	}

	seek(time: number) {
		const target = Math.min(this.duration || Infinity, Math.max(0, time));
		this.position = target;
		if (this.audio) this.audio.seek(target);
		if (!this.playing) {
			this.showStill(target);
			return;
		}
		this.stopPictures();
		if (!this.audio) this.anchor = { page: performance.now(), time: target };
		void this.playPictures(this.run, target);
	}

	dispose() {
		this.disposed = true;
		this.stopPictures();
		this.audio?.dispose();
		this.input.dispose();
	}

	private stopPictures() {
		this.run += 1;
	}

	/** The page clock of files without sound: reports time and stops at the end. */
	private async tick(run: number) {
		while (run === this.run && this.clockPlaying) {
			const time = this.time();
			this.onTime(time);
			if (time >= this.duration) {
				this.position = this.duration;
				this.clockPlaying = false;
				this.stopPictures();
				this.onStateChange(false);
				return;
			}
			// Frames follow the display: one update per repaint.
			// oxlint-disable-next-line no-await-in-loop
			await nextFrame();
		}
	}

	private draw(sample: VideoSample) {
		const context = this.canvas?.getContext('2d');
		if (!context || !this.canvas) return;
		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		sample.drawWithFit(context, { fit: 'contain' });
	}

	/** Decodes from `from` on and draws each picture when the clock reaches it. */
	private async playPictures(run: number, from: number) {
		const sink = this.sink;
		if (!sink) return;
		const samples = sink.samples(Math.max(from, this.firstPicture));
		let next: VideoSample | null = null;
		try {
			// Pictures come one after the other, each waiting for its time.
			// oxlint-disable-next-line no-await-in-loop
			while (run === this.run && (next = (await samples.next()).value ?? null)) {
				while (run === this.run && next.timestamp > this.time() + 0.004) {
					// oxlint-disable-next-line no-await-in-loop
					await nextFrame();
				}
				if (run !== this.run) break;
				// A picture already replaced by the next one is skipped rather than flashed.
				if (next.timestamp + next.duration >= this.time()) this.draw(next);
				next.close();
				next = null;
			}
		} catch {
			// A decoding error stops the pictures; sound and time carry on.
		} finally {
			next?.close();
			await samples.return();
		}
	}

	/** Shows the frame at a time while paused. Requests made while one is decoding collapse into the last. */
	private showStill(time: number) {
		this.stillRequest = time;
		if (this.stillBusy) return;
		void (async () => {
			this.stillBusy = true;
			try {
				await this.ready;
				while (this.stillRequest !== null && !this.disposed) {
					// Before the first picture, the first picture shows, as in any player.
					const at = Math.max(this.stillRequest, this.firstPicture);
					this.stillRequest = null;
					// oxlint-disable-next-line no-await-in-loop
					const sample = await this.sink?.getSample(at);
					if (sample) {
						if (!this.playing) this.draw(sample);
						sample.close();
					}
				}
			} catch {
				// Nothing to show for that moment.
			} finally {
				this.stillBusy = false;
			}
		})();
	}
}
