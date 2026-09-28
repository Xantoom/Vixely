/**
 * Changes the speed of sound without changing its pitch, as a stream: waveform similarity
 * overlap-add (WSOLA). Short windows of the input are laid one after the other at the output's
 * pace, each taken where it best continues the one before, so voices and music keep their pitch
 * and stay free of the echo a plain overlap would leave.
 */

import type { Planar } from './sound';

/** Window length, in seconds: long enough for low voices, short enough to stay sharp. */
const WINDOW = 0.042;
/** How far a window may shift to line up with the previous one, in seconds. */
const TOLERANCE = 0.012;
/** Every how many samples the similarity is measured: much faster, as good by ear. */
const STRIDE = 4;

export class TimeStretcher {
	private readonly size: number;
	private readonly hop: number;
	private readonly tolerance: number;
	private readonly window: Float32Array;
	/** Input not yet used, per channel, starting at `base` in the whole input. */
	private input: Float32Array[];
	private base = 0;
	private length = 0;
	/** Output being built, per channel, starting at `outBase` in the whole output. */
	private output: Float32Array[];
	private outBase = 0;
	/** Windows laid so far. */
	private laid = 0;
	/** Where the last window was taken from in the input, or -1 before the first. */
	private previous = -1;

	constructor(
		private readonly channels: number,
		sampleRate: number,
		private readonly speed: number,
	) {
		this.size = Math.max(64, Math.round(WINDOW * sampleRate) & ~1);
		this.hop = this.size / 2;
		this.tolerance = Math.round(TOLERANCE * sampleRate);
		// A periodic Hann window: halves overlapping by half add up to exactly one.
		this.window = Float32Array.from(
			{ length: this.size },
			(_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / this.size),
		);
		this.input = Array.from({ length: channels }, () => new Float32Array(this.size * 8));
		this.output = Array.from({ length: channels }, () => new Float32Array(this.size * 8));
	}

	/** Adds planar input and returns the output that is final, planar too. */
	push(chunk: Planar): Planar {
		this.append(chunk);
		this.lay(false);
		return this.take(false);
	}

	/** The rest of the output, once the input has ended. */
	flush(): Planar {
		this.lay(true);
		return this.take(true);
	}

	private append({ data, frames }: Planar) {
		if (this.length + frames > (this.input[0]?.length ?? 0)) {
			const grown = Math.max((this.input[0]?.length ?? 0) * 2, this.length + frames);
			this.input = this.input.map((channel) => {
				const next = new Float32Array(grown);
				next.set(channel.subarray(0, this.length));
				return next;
			});
		}
		for (let c = 0; c < this.channels; c++) {
			this.input[c]?.set(data.subarray(c * frames, (c + 1) * frames), this.length);
		}
		this.length += frames;
	}

	/** Where, around `ideal`, a window best continues the previous one, in the whole input. */
	private bestStart(ideal: number, ending: boolean): number {
		if (this.previous < 0) return ideal;
		const natural = this.previous + this.hop;
		const low = Math.max(this.base, ideal - this.tolerance);
		const high = Math.min(ideal + this.tolerance, this.base + this.length - this.size);
		if (high <= low || ending) return Math.max(this.base, Math.min(ideal, this.base + this.length - this.size));
		let best = ideal;
		let bestScore = Number.NEGATIVE_INFINITY;
		for (let start = low; start <= high; start += STRIDE) {
			let score = 0;
			let energy = 1e-9;
			for (let n = 0; n < this.size; n += STRIDE * 2) {
				let a = 0;
				let b = 0;
				for (let c = 0; c < this.channels; c++) {
					const channel = this.input[c];
					a += channel?.[natural + n - this.base] ?? 0;
					b += channel?.[start + n - this.base] ?? 0;
				}
				score += a * b;
				energy += b * b;
			}
			const normalised = score / Math.sqrt(energy);
			if (normalised > bestScore) {
				bestScore = normalised;
				best = start;
			}
		}
		return best;
	}

	/** Lays every window the input allows; at the end, the last ones with what is left. */
	private lay(ending: boolean) {
		for (;;) {
			const ideal = Math.round(this.laid * this.hop * this.speed);
			const needed = ideal + this.tolerance + this.size;
			const available = this.base + this.length;
			if (!ending && needed > available) break;
			if (ending && ideal >= available) break;
			const start = this.bestStart(ideal, ending || needed > available);
			const at = this.laid * this.hop - this.outBase;
			this.ensureOutput(at + this.size);
			for (let c = 0; c < this.channels; c++) {
				const from = this.input[c];
				const to = this.output[c];
				if (!from || !to) continue;
				for (let n = 0; n < this.size; n++) {
					to[at + n] = (to[at + n] ?? 0) + (from[start + n - this.base] ?? 0) * (this.window[n] ?? 0);
				}
			}
			this.previous = start;
			this.laid += 1;
			this.dropInput();
		}
	}

	private ensureOutput(frames: number) {
		if (frames <= (this.output[0]?.length ?? 0)) return;
		const grown = Math.max((this.output[0]?.length ?? 0) * 2, frames);
		this.output = this.output.map((channel) => {
			const next = new Float32Array(grown);
			next.set(channel);
			return next;
		});
	}

	/** Forgets the input no window can reach any more. */
	private dropInput() {
		const nextIdeal = Math.round(this.laid * this.hop * this.speed);
		const keepFrom = Math.min(nextIdeal - this.tolerance, this.previous + this.hop) - 1;
		const drop = keepFrom - this.base;
		if (drop < this.size * 4) return;
		for (const channel of this.input) channel.copyWithin(0, drop, this.length);
		this.base += drop;
		this.length -= drop;
	}

	/** The output no later window will add to, removed from the buffer. */
	private take(ending: boolean): Planar {
		// The next window starts at `laid * hop`: everything before it is final.
		const final = (ending ? (this.laid + 1) * this.hop : this.laid * this.hop) - this.outBase;
		const frames = Math.max(0, final);
		const data = new Float32Array(frames * this.channels);
		for (let c = 0; c < this.channels; c++) {
			const channel = this.output[c];
			if (!channel) continue;
			data.set(channel.subarray(0, frames), c * frames);
			channel.copyWithin(0, frames);
			channel.fill(0, channel.length - frames);
		}
		this.outBase += frames;
		return { data, frames };
	}
}

/**
 * Plays audio `factor` times faster by reading it at another pace, as a stream: pitch and speed
 * move together, as with a tape. Four-point cubic interpolation between the samples.
 */
export class Resampler {
	/** The last three input frames of each channel, then the new ones. */
	private tail: Float32Array[];
	/** Where the next output frame reads, in input frames from the start of `tail`: the first real one. */
	private position = 3;

	constructor(
		private readonly channels: number,
		private readonly factor: number,
	) {
		this.tail = Array.from({ length: channels }, () => new Float32Array(3));
	}

	push({ data, frames }: Planar): Planar {
		const kept = this.tail[0]?.length ?? 0;
		const length = kept + frames;
		const joined = this.tail.map((tail, c) => {
			const channel = new Float32Array(length);
			channel.set(tail);
			channel.set(data.subarray(c * frames, (c + 1) * frames), kept);
			return channel;
		});
		// Output frames whose four neighbours are all in: reading at most three frames from the end.
		const count = this.position <= length - 3 ? Math.floor((length - 3 - this.position) / this.factor) + 1 : 0;
		const output = new Float32Array(count * this.channels);
		for (let c = 0; c < this.channels; c++) {
			const channel = joined[c];
			if (!channel) continue;
			for (let i = 0; i < count; i++) {
				const at = this.position + i * this.factor;
				const k = Math.floor(at);
				const t = at - k;
				const p0 = channel[k - 1] ?? 0;
				const p1 = channel[k] ?? 0;
				const p2 = channel[k + 1] ?? 0;
				const p3 = channel[k + 2] ?? 0;
				// Catmull-Rom: smooth, and exact on the samples themselves.
				output[c * count + i] =
					p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
			}
		}
		const next = this.position + count * this.factor;
		// Keeps what the next reads need: from one frame before where they start.
		const keepFrom = Math.max(0, Math.min(length, Math.floor(next) - 1));
		this.tail = joined.map((channel) => channel.slice(keepFrom));
		this.position = next - keepFrom;
		return { data: output, frames: count };
	}

	/** The last frames, once the input has ended. */
	flush(): Planar {
		return this.push({ data: new Float32Array(this.channels * 2), frames: 2 });
	}
}

/** Semitones a pitch may move, down or up. */
export const PITCH_RANGE = { min: -12, max: 12 } as const;

/**
 * Speed and pitch changed apart, as a stream: `speed` sets how long the audio lasts, `semitones`
 * how high it sounds. The time stretch makes the length right for a tape-like change of pace,
 * which then moves the pitch and the length together.
 */
export class SpeedPitch {
	private readonly stretcher: TimeStretcher | null;
	private readonly resampler: Resampler | null;
	/** Frames taken in and given out: the output ends at the length the speed asks for. */
	private received = 0;
	private emitted = 0;

	constructor(
		channels: number,
		sampleRate: number,
		private readonly speed: number,
		semitones: number,
	) {
		const factor = 2 ** (semitones / 12);
		const tempo = speed / factor;
		this.stretcher = Math.abs(tempo - 1) > 1e-6 ? new TimeStretcher(channels, sampleRate, tempo) : null;
		this.resampler = Math.abs(factor - 1) > 1e-6 ? new Resampler(channels, factor) : null;
	}

	push(chunk: Planar): Planar {
		this.received += chunk.frames;
		const stretched = this.stretcher ? this.stretcher.push(chunk) : chunk;
		const out = this.resampler ? this.resampler.push(stretched) : stretched;
		this.emitted += out.frames;
		return out;
	}

	/** The rest of the output, once the input has ended, up to the length the speed asks for. */
	flush(): Planar {
		const rest = this.drain();
		const wanted = Math.max(0, Math.round(this.received / this.speed) - this.emitted);
		if (rest.frames <= wanted) return rest;
		const channels = rest.frames > 0 ? rest.data.length / rest.frames : 0;
		const data = new Float32Array(wanted * channels);
		for (let c = 0; c < channels; c++)
			data.set(rest.data.subarray(c * rest.frames, c * rest.frames + wanted), c * wanted);
		return { data, frames: wanted };
	}

	private drain(): Planar {
		if (!this.stretcher) return this.resampler ? this.resampler.flush() : { data: new Float32Array(0), frames: 0 };
		const rest = this.stretcher.flush();
		if (!this.resampler) return rest;
		const last = this.resampler.push(rest);
		const end = this.resampler.flush();
		const frames = last.frames + end.frames;
		const channels = frames > 0 ? (last.data.length + end.data.length) / frames : 0;
		const data = new Float32Array(frames * channels);
		for (let c = 0; c < channels; c++) {
			data.set(last.data.subarray(c * last.frames, (c + 1) * last.frames), c * frames);
			data.set(end.data.subarray(c * end.frames, (c + 1) * end.frames), c * frames + last.frames);
		}
		return { data, frames };
	}
}
