import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { type GainPoint, gainAt } from '@/document/gain-curve';
import { type Range, sameRanges, toOutput, toSource, totalLength } from '@/document/timemap';
import { findAudioTrack } from './audio-tracks';
import { DECODER_PREROLL } from './decoder';
import { canDecodeAudio } from './decoders';

/** What to play: the source ranges in order, and the volume curve over output time. */
export interface PlaybackPlan {
	ranges: readonly Range[];
	envelope: readonly GainPoint[];
}

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
export class AudioPlayer {
	/** Called on every animation frame while playing, and when playback stops by itself. */
	onTime: (source: number) => void = () => {};
	onStateChange: (playing: boolean) => void = () => {};

	private input: Input;
	private sink: Promise<AudioBufferSink | null>;
	private context: AudioContext | null = null;
	private gain: GainNode | null = null;
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

	/** Current source time. */
	time(): number {
		if (!this.playing || !this.context) return this.position;
		const output = this.anchor.output + Math.max(0, this.context.currentTime - this.anchor.context);
		return toSource(this.plan.ranges, output);
	}

	/**
	 * Updates what is played. A new volume curve applies at once; new ranges restart playback from
	 * the same moment, so a cut made while listening is heard right away.
	 */
	setPlan(plan: PlaybackPlan) {
		const rangesChanged = !sameRanges(plan.ranges, this.plan.ranges);
		const time = this.time();
		this.plan = plan;
		if (!this.playing) return;
		if (rangesChanged) void this.start(time);
		else this.scheduleEnvelope();
	}

	seek(source: number) {
		if (this.playing) void this.start(source);
		else this.position = source;
	}

	async play() {
		const end = totalLength(this.plan.ranges);
		// At the end, play starts again from the beginning, like any player.
		const output = toOutput(this.plan.ranges, this.position);
		await this.start(output >= end - 0.01 ? (this.plan.ranges[0]?.start ?? 0) : this.position);
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
			this.context = new AudioContext({ latencyHint: 'playback' });
			this.gain = this.context.createGain();
			this.gain.connect(this.context.destination);
		}
		return { context: this.context, gain: this.gain };
	}

	private async start(source: number) {
		const sink = await this.sink;
		if (!sink || this.disposed) return;
		const wasPlaying = this.playing;
		this.stop();
		const run = this.run;
		const { context } = this.ensureContext();
		// Browsers keep audio suspended until a user gesture; play is always called from one.
		if (context.state !== 'running') await context.resume();
		if (run !== this.run) return;

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
	}

	private tick = () => {
		if (!this.context) return;
		const output = this.anchor.output + Math.max(0, this.context.currentTime - this.anchor.context);
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
		const gain = this.gain;
		if (!context || !gain) return;
		const ranges = this.plan.ranges;
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
				const when = this.anchor.context + (rangeOutput + (clipStart - start) - this.anchor.output);
				// A buffer that arrives late plays from where the clock already is.
				const late = Math.max(0, context.currentTime - when);
				if (clipEnd - clipStart > late) {
					const node = context.createBufferSource();
					node.buffer = buffer;
					node.connect(gain);
					node.onended = () => {
						node.disconnect();
						this.nodes.delete(node);
					};
					node.start(when + late, clipStart - timestamp + late, clipEnd - clipStart - late);
					this.nodes.add(node);
				}
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
		const output = this.anchor.output + (now - this.anchor.context);
		param.cancelScheduledValues(0);
		param.setValueAtTime(gainAt(points, output), now);
		for (const point of points) {
			if (point.time <= output) continue;
			param.linearRampToValueAtTime(point.gain, this.anchor.context + (point.time - this.anchor.output));
		}
	}
}
