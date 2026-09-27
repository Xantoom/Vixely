/**
 * The sound of a video played faster or slower, pitch kept, and faded in and out: the last step
 * before encoding, after the passages removed and the level changed.
 */
import { AudioSample } from 'mediabunny';
import { TimeStretcher } from '@/media/stretch';
import { fadeLevel, type VideoFade } from './document';

function planarOf(sample: AudioSample): Float32Array {
	const frames = sample.numberOfFrames;
	const data = new Float32Array(frames * sample.numberOfChannels);
	for (let plane = 0; plane < sample.numberOfChannels; plane++) {
		sample.copyTo(data.subarray(plane * frames, (plane + 1) * frames), { planeIndex: plane, format: 'f32-planar' });
	}
	return data;
}

export class AudioShaper {
	private stretcher: TimeStretcher | null = null;
	/** Frames given out so far, when the speed changes: they set the output's times. */
	private emitted = 0;

	/** `length` is the output's length in seconds, for the fade out. */
	constructor(
		private readonly speed: number,
		private readonly fade: VideoFade,
		private readonly length: number,
	) {}

	/**
	 * The pieces of sound, timed on the output before the speed change, as they will be heard.
	 * Pieces other than `input` itself were made for this and are closed.
	 */
	shape(pieces: AudioSample[], input: AudioSample): AudioSample[] {
		const shaped: AudioSample[] = [];
		for (const piece of pieces) {
			const channels = piece.numberOfChannels;
			const rate = piece.sampleRate;
			let data = planarOf(piece);
			let frames = piece.numberOfFrames;
			let start = piece.timestamp;
			if (piece !== input) piece.close();
			if (this.speed !== 1) {
				this.stretcher ??= new TimeStretcher(channels, rate, this.speed);
				({ data, frames } = this.stretcher.push({ data, frames }));
				start = this.emitted / rate;
				this.emitted += frames;
			}
			if (frames === 0) continue;
			this.applyFade(data, frames, channels, rate, start);
			shaped.push(
				new AudioSample({
					data,
					format: 'f32-planar',
					numberOfChannels: channels,
					sampleRate: rate,
					timestamp: start,
				}),
			);
		}
		return shaped;
	}

	private applyFade(data: Float32Array, frames: number, channels: number, rate: number, start: number) {
		const { fade, length } = this;
		if (fade.in <= 0 && fade.out <= 0) return;
		// Only the frames within a fade change.
		const end = start + frames / rate;
		if (start >= fade.in && end <= length - fade.out) return;
		for (let frame = 0; frame < frames; frame++) {
			const level = fadeLevel(fade, start + frame / rate, length);
			if (level === 1) continue;
			for (let channel = 0; channel < channels; channel++) {
				const index = channel * frames + frame;
				data[index] = (data[index] ?? 0) * level;
			}
		}
	}
}
