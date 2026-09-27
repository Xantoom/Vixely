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

export const SPEED_RANGE = { min: 0.25, max: 4 } as const;

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
