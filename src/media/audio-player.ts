import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { type GainPoint, gainAt } from '@/document/gain-curve';
import { type Range, sameRanges, toOutput, toSource, totalLength } from '@/document/timemap';
import { findAudioTrack } from './audio-tracks';
import { DECODER_PREROLL } from './decoder';
import { canDecodeAudio } from './decoders';
import { EQ_BANDS, EQ_Q, type Planar, type SoundChanges, SoundProcessor } from './sound';
import { TimeStretcher } from './stretch';

/** What to play: the source ranges in order, the volume curve over output time, and the sound changes. */
export interface PlaybackPlan {
	ranges: readonly Range[];
	envelope: readonly GainPoint[];
	/** Equalizer gains and noise reduction; absent plays the sound as it is. */
	sound?: SoundChanges;
	/** How fast it plays, pitch kept; absent plays at normal speed. */
	speed?: number;
}

const NO_CHANGES: SoundChanges = { eq: [], denoise: 0 };

/** Audio decoded ahead of the playhead. Enough to never starve, small enough to react quickly. */
const LOOKAHEAD = 1;
/** Delay before the first sound, so the first buffers are ready when playback starts. */
const START_DELAY = 0.05;

async function sleep(ms: number) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Plays an audio track as edited, without decoding it all first. Buffers are decoded about a
 * second ahead and scheduled on the Web Audio clock, which is also the clock the playhead reads,
 * so what is heard and what is shown stay in step. Removed passages are skipped; the volume curve
 * runs on a gain node.
 */
/** How long the sound output may take to start before playing goes on without it, in ms. */
const OUTPUT_WAIT = 1500;

export class AudioPlayer {
	/** Called on every animation frame while playing, and when playback stops by itself. */
	onTime: (source: number) => void = () => {};
	onStateChange: (playing: boolean) => void = () => {};

	private input: Input;
	private sink: Promise<AudioBufferSink | null>;
	private context: AudioContext | null = null;
	private gain: GainNode | null = null;
	/** The equalizer's filters, one per band, before the gain. */
	private filters: BiquadFilterNode[] = [];
	private plan: PlaybackPlan = { ranges: [], envelope: [] };
	private nodes = new Set<AudioBufferSourceNode>();
	/** Incremented on every start and stop: a scheduling loop from an older run ends itself. */
	private run = 0;
	/** Web Audio time at which the given output time plays. */
	private anchor = { context: 0, output: 0 };
	private position = 0;
	private frame = 0;
	private disposed = false;

	/** `track` is the ID of the audio track to play; null plays the file's main one. */
	constructor(file: File, track: number | null = null) {
		this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		this.sink = findAudioTrack(this.input, track)
			.then(async (track) => (track && (await canDecodeAudio(track)) ? new AudioBufferSink(track) : null))
			.catch(() => null);
	}

	/** Whether this browser can decode the track. */
	async playable(): Promise<boolean> {
		return (await this.sink) !== null;
	}

	get playing(): boolean {
		return this.frame !== 0;
	}

	private get speed(): number {
		return this.plan.speed ?? 1;
	}

	/** Output time, on the kept ranges before the speed change, at a time of the sound clock. */
	private outputAt(contextTime: number): number {
		return this.anchor.output + Math.max(0, contextTime - this.anchor.context) * this.speed;
	}

	/** Current source time. */
	time(): number {
		if (!this.playing || !this.context) return this.position;
		return toSource(this.plan.ranges, this.outputAt(this.context.currentTime));
	}

	/**
	 * Updates what is played. A new volume curve applies at once; new ranges restart playback from
	 * the same moment, so a cut made while listening is heard right away.
	 */
	setPlan(plan: PlaybackPlan) {
		// Noise reduction works on the decoded buffers: a change is heard from a fresh start.
		const restart =
			!sameRanges(plan.ranges, this.plan.ranges) ||
			(plan.speed ?? 1) !== this.speed ||
			(plan.sound ?? NO_CHANGES).denoise !== (this.plan.sound ?? NO_CHANGES).denoise;
		const time = this.time();
		this.plan = plan;
		this.setFilters();
		if (!this.playing) return;
		if (restart) void this.start(time);
		else this.scheduleEnvelope();
	}

	seek(source: number) {
		if (this.playing) void this.start(source);
		else this.position = source;
	}

	/** Starts playing; false when the sound can't be heard, as on a device without any output. */
	async play(): Promise<boolean> {
		const end = totalLength(this.plan.ranges);
		// At the end, play starts again from the beginning, like any player.
		const output = toOutput(this.plan.ranges, this.position);
		return this.start(output >= end - 0.01 ? (this.plan.ranges[0]?.start ?? 0) : this.position);
	}

	pause() {
		if (!this.playing) return;
		this.position = this.time();
		this.stop();
		this.onStateChange(false);
	}

	dispose() {
		this.disposed = true;
		this.stop();
		void this.context?.close();
		this.input.dispose();
	}

	private stop() {
		this.run += 1;
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		for (const node of this.nodes) {
			node.onended = null;
			node.stop();
			node.disconnect();
		}
		this.nodes.clear();
	}

	private ensureContext(): { context: AudioContext; gain: GainNode } {
		if (!this.context || !this.gain) {
			const context = new AudioContext({ latencyHint: 'playback' });
			this.context = context;
			this.gain = context.createGain();
			this.filters = EQ_BANDS.map((band) => {
				const filter = context.createBiquadFilter();
				filter.type = band.kind;
				filter.frequency.value = band.frequency;
				filter.Q.value = EQ_Q;
				return filter;
			});
			// Sources → equalizer → volume → speakers.
			[...this.filters, this.gain].reduce((from, to) => {
				from.connect(to);
				return to;
			});
			this.gain.connect(context.destination);
			this.setFilters();
		}
		return { context: this.context, gain: this.gain };
	}

	/** The first node sources play into. */
	private get inlet(): AudioNode | null {
		return this.filters[0] ?? this.gain;
	}

	private setFilters() {
		const eq = this.plan.sound?.eq ?? [];
		this.filters.forEach((filter, index) => {
			filter.gain.value = eq[index] ?? 0;
		});
	}

	private async start(source: number): Promise<boolean> {
		const sink = await this.sink;
		if (!sink || this.disposed) return false;
		const wasPlaying = this.playing;
		this.stop();
		const run = this.run;
		const { context } = this.ensureContext();
		// Browsers keep audio suspended until a user gesture; play is always called from one. Without
		// any sound output the context never starts: playing goes on without it.
		if (context.state !== 'running') {
			const started = await Promise.race([
				context.resume().then(() => true),
				new Promise<false>((resolve) => {
					setTimeout(() => {
						resolve(false);
					}, OUTPUT_WAIT);
				}),
			]);
			if (!started) return false;
		}
		if (run !== this.run) return true;

		const ranges = this.plan.ranges;
		const output = toOutput(ranges, source);
		this.position = toSource(ranges, output);
		this.anchor = { context: context.currentTime + START_DELAY, output };
		this.scheduleEnvelope();
		this.frame = requestAnimationFrame(this.tick);
		if (!wasPlaying) this.onStateChange(true);
		this.schedule(sink, run, this.position).catch(() => {
			// The player was closed while decoding (another track, another file): nothing to play.
		});
		return true;
	}

	private tick = () => {
		if (!this.context) return;
		const output = this.outputAt(this.context.currentTime);
		const end = totalLength(this.plan.ranges);
		if (output >= end) {
			this.position = this.plan.ranges.at(-1)?.end ?? 0;
			this.stop();
			this.onTime(this.position);
			this.onStateChange(false);
			return;
		}
		this.onTime(toSource(this.plan.ranges, output));
		this.frame = requestAnimationFrame(this.tick);
	};

	/** Decodes and schedules every kept range from `from` on, staying about a second ahead. */
	private async schedule(sink: AudioBufferSink, run: number, from: number) {
		const context = this.context;
		const inlet = this.inlet;
		if (!context || !inlet) return;
		const ranges = this.plan.ranges;
		const denoise = this.plan.sound?.denoise ?? 0;
		const speed = this.speed;
		// With noise reduction or another speed, the kept audio goes through them end to end and
		// plays from where the run starts, a little behind the decoding.
		let reducer: Promise<SoundProcessor> | null = null;
		let stretcher: TimeStretcher | null = null;
		let emitted = 0;
		// A buffer that arrives late plays from where the clock already is.
		const play = (buffer: AudioBuffer, when: number, offset: number, length: number) => {
			const late = Math.max(0, context.currentTime - when);
			if (length <= late) return;
			const node = context.createBufferSource();
			node.buffer = buffer;
			node.connect(inlet);
			node.onended = () => {
				node.disconnect();
				this.nodes.delete(node);
			};
			node.start(when + late, offset + late, length - late);
			this.nodes.add(node);
		};
		const process = async (buffer: AudioBuffer, _when: number, offset: number, length: number) => {
			const { sampleRate, numberOfChannels: channels } = buffer;
			const first = Math.round(offset * sampleRate);
			const frames = Math.min(buffer.length - first, Math.round(length * sampleRate));
			if (frames <= 0) return;
			const decoded = new Float32Array(frames * channels);
			for (let c = 0; c < channels; c++)
				buffer.copyFromChannel(decoded.subarray(c * frames, (c + 1) * frames), c, first);
			let chunk: Planar = { data: decoded, frames };
			if (denoise > 0) {
				reducer ??= SoundProcessor.create({ eq: [], denoise }, channels, sampleRate);
				chunk = (await reducer).push(chunk);
			}
			if (speed !== 1) {
				stretcher ??= new TimeStretcher(channels, sampleRate, speed);
				chunk = stretcher.push(chunk);
			}
			if (chunk.frames === 0 || run !== this.run) return;
			const shaped = context.createBuffer(channels, chunk.frames, sampleRate);
			for (let c = 0; c < channels; c++)
				shaped.getChannelData(c).set(chunk.data.subarray(c * chunk.frames, (c + 1) * chunk.frames));
			play(shaped, this.anchor.context + emitted / sampleRate, 0, shaped.duration);
			emitted += chunk.frames;
		};
		try {
			await this.scheduleRanges(sink, run, from, ranges, denoise > 0 || speed !== 1 ? process : play);
		} finally {
			void (reducer as Promise<SoundProcessor> | null)?.then((done) => {
				done.dispose();
			});
		}
	}

	private async scheduleRanges(
		sink: AudioBufferSink,
		run: number,
		from: number,
		ranges: readonly Range[],
		send: (buffer: AudioBuffer, when: number, offset: number, length: number) => void | Promise<void>,
	) {
		const context = this.context;
		if (!context) return;
		for (const range of ranges) {
			if (range.end <= from) continue;
			const start = Math.max(range.start, from);
			const rangeOutput = toOutput(ranges, start);
			// Ranges play one after the other: each waits for the previous one to be scheduled.
			// oxlint-disable-next-line no-await-in-loop
			for await (const { buffer, timestamp, duration } of sink.buffers(
				Math.max(0, start - DECODER_PREROLL),
				range.end,
			)) {
				if (run !== this.run) return;
				const clipStart = Math.max(timestamp, start);
				const clipEnd = Math.min(timestamp + duration, range.end);
				if (clipEnd <= clipStart) continue;
				const when =
					this.anchor.context + (rangeOutput + (clipStart - start) - this.anchor.output) / this.speed;
				// oxlint-disable-next-line no-await-in-loop -- buffers go through in order
				await send(buffer, when, clipStart - timestamp, clipEnd - clipStart);
				while (when - context.currentTime > LOOKAHEAD && run === this.run) {
					// oxlint-disable-next-line no-await-in-loop
					await sleep(100);
				}
			}
		}
	}

	/** Schedules the volume curve from now on, on the output timeline of the current run. */
	private scheduleEnvelope() {
		const context = this.context;
		const param = this.gain?.gain;
		if (!context || !param) return;
		const points = this.plan.envelope;
		const now = Math.max(context.currentTime, this.anchor.context);
		const output = this.outputAt(now);
		param.cancelScheduledValues(0);
		param.setValueAtTime(gainAt(points, output), now);
		for (const point of points) {
			if (point.time <= output) continue;
			param.linearRampToValueAtTime(
				point.gain,
				this.anchor.context + (point.time - this.anchor.output) / this.speed,
			);
		}
	}
}
