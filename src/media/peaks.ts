import type { Range } from '@/document/timemap';
import { Loudness } from './loudness';
import { PEAK_FRAMES, type PeaksLimit, type PeaksMessage, type PeaksOrigin, type PeaksRequest } from './peaks-protocol';

/** Each summary level groups this many peaks of the level below. */
const LEVEL_FACTOR = 16;

interface Level {
	/** Base peaks per value of this level. */
	factor: number;
	data: Int8Array;
}

/** A part of the track read by one worker, in peak indices. `read` grows as peaks arrive. */
interface Segment {
	from: number;
	to: number;
	read: number;
}

/**
 * The waveform of an audio track: the minimum and maximum of every few milliseconds, as signed
 * bytes. Three hours of audio take about 7 MB. Summary levels, updated as peaks arrive, keep
 * drawing a zoomed-out view as fast as drawing a few seconds.
 */
export class Peaks {
	/** Source time of the first peak, in seconds. */
	start = 0;
	/** Duration of one peak, in seconds. Zero until decoding starts. */
	bucketDuration = 0;
	complete = false;
	private data: Int8Array = new Int8Array(0);
	private levels: Level[] = [];
	private segments: Segment[] = [];

	/** Sets where peaks start and reserves room for the whole track at once. */
	setOrigin(origin: PeaksOrigin, duration: number) {
		this.start = origin.start;
		this.bucketDuration = PEAK_FRAMES / origin.rate;
		this.resize(Math.ceil(((duration - origin.start) / this.bucketDuration) * 1.01) + 1);
	}

	/** Peaks the track holds, as far as known. */
	get capacity(): number {
		return this.data.length / 2;
	}

	/** Declares a part of the track as being read, so progress and gaps can be told apart. */
	addSegment(from: number, to: number): Segment {
		const segment = { from, to, read: from };
		this.segments.push(segment);
		return segment;
	}

	/** Share of the track already read, from 0 to 1. */
	progress(): number {
		if (this.complete) return 1;
		const total = this.capacity;
		if (total === 0) return 0;
		const read = this.segments.reduce((sum, segment) => sum + (segment.read - segment.from), 0);
		return Math.min(1, read / total);
	}

	private resize(peaks: number) {
		if (peaks * 2 <= this.data.length) return;
		const grown = new Int8Array(peaks * 2);
		grown.set(this.data);
		this.data = grown;
		let size = peaks;
		for (let k = 0; ; k++) {
			size = Math.ceil(size / LEVEL_FACTOR);
			if (size < 2) {
				this.levels.length = k;
				break;
			}
			const level = this.levels[k];
			const data = new Int8Array(size * 2);
			if (level) data.set(level.data.subarray(0, Math.min(level.data.length, data.length)));
			this.levels[k] = { factor: LEVEL_FACTOR ** (k + 1), data };
		}
	}

	append(segment: Segment, offset: number, chunk: Int8Array) {
		const end = offset + chunk.length / 2;
		if (end > this.capacity) this.resize(Math.ceil(end * 1.2));
		this.data.set(chunk, offset * 2);
		segment.read = Math.max(segment.read, end);
		this.updateLevels(offset, end);
	}

	/** Recomputes the summary values that cover peaks `from` to `to`. */
	private updateLevels(from: number, to: number) {
		let below: Int8Array = this.data;
		let first = from;
		let last = to;
		for (const level of this.levels) {
			first = Math.floor(first / LEVEL_FACTOR);
			last = Math.ceil(last / LEVEL_FACTOR);
			for (let g = first; g < last && g * 2 < level.data.length; g++) {
				let min = 127;
				let max = -127;
				for (let i = g * LEVEL_FACTOR; i < (g + 1) * LEVEL_FACTOR && i * 2 < below.length; i++) {
					min = Math.min(min, below[i * 2] ?? 0);
					max = Math.max(max, below[i * 2 + 1] ?? 0);
				}
				level.data[g * 2] = min;
				level.data[g * 2 + 1] = max;
			}
			below = level.data;
		}
	}

	private isRead(index: number): boolean {
		return this.segments.some((segment) => index >= segment.from && index < segment.read);
	}

	/**
	 * Minimum and maximum between two source times, from −1 to 1, written into `out`. Returns false
	 * when that part hasn't been read yet. Reads the coarsest level that still has several values
	 * in the span, so the cost doesn't grow with the length of the file.
	 */
	range(from: number, to: number, out: { min: number; max: number }): boolean {
		if (this.bucketDuration === 0) return false;
		const first = Math.max(0, Math.floor((from - this.start) / this.bucketDuration));
		const last = Math.min(this.capacity, Math.ceil((to - this.start) / this.bucketDuration));
		if (last <= first || !this.isRead(Math.floor((first + last) / 2))) return false;
		let data: Int8Array = this.data;
		let factor = 1;
		for (const level of this.levels) {
			if (level.factor * 4 > last - first) break;
			data = level.data;
			factor = level.factor;
		}
		let min = 127;
		let max = -127;
		const end = Math.min(data.length / 2, Math.ceil(last / factor));
		for (let i = Math.floor(first / factor); i < end; i++) {
			min = Math.min(min, data[i * 2] ?? 0);
			max = Math.max(max, data[i * 2 + 1] ?? 0);
		}
		out.min = min / 127;
		out.max = max / 127;
		return true;
	}

	/** Highest absolute level within the given source ranges, from 0 to 1. */
	peak(ranges: readonly Range[]): number {
		let peak = 0;
		for (const range of ranges) {
			const first = Math.max(0, Math.floor((range.start - this.start) / this.bucketDuration));
			const last = Math.min(this.capacity, Math.ceil((range.end - this.start) / this.bucketDuration));
			for (let i = first; i < last; i++) {
				peak = Math.max(peak, -(this.data[i * 2] ?? 0), this.data[i * 2 + 1] ?? 0);
			}
		}
		return peak / 127;
	}
}

export interface PeaksReader {
	peaks: Peaks;
	/** Measured during the same pass, block by block. */
	loudness: Loudness;
	/** Resolves once the whole track is read, or rejects when it can't be decoded. */
	done: Promise<void>;
	cancel: () => void;
}

/** Below this length, one worker reads the track faster than several would start. */
const PARALLEL_FROM = 60;

/** Workers sharing a long track: half the cores, at most four. */
function workerCount(duration: number): number {
	if (duration < PARALLEL_FROM) return 1;
	return Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
}

/**
 * Reads the waveform of a file in workers. The first worker finds where the track starts and at
 * which rate it decodes; a long track is then shared out between several workers, each decoding
 * its own part. `onUpdate` is called as peaks arrive, so the waveform draws while it is read.
 */
export function readPeaks(file: File, duration: number, onUpdate: () => void): PeaksReader {
	const peaks = new Peaks();
	const loudness = new Loudness();
	const workers: Worker[] = [];
	let running = 0;
	let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;
	const done = new Promise<void>((resolve, reject) => {
		settle = { resolve, reject };
	});

	const fail = () => {
		for (const worker of workers) worker.terminate();
		settle?.reject(new Error('The audio track could not be decoded.'));
	};

	const launch = (request: PeaksRequest, segment: Segment | null, onStart?: (origin: PeaksOrigin) => Segment) => {
		const worker = new Worker(new URL('../workers/peaks.worker.ts', import.meta.url), { type: 'module' });
		workers.push(worker);
		running += 1;
		let part = segment;
		worker.onmessage = (event: MessageEvent<PeaksMessage>) => {
			const message = event.data;
			if (message.type === 'start') {
				part = onStart?.(message) ?? part;
			} else if (message.type === 'chunk') {
				if (part) peaks.append(part, message.offset, message.data);
			} else if (message.type === 'loudness') {
				loudness.append(message.index, message.momentary, message.peak);
			} else if (message.type === 'done') {
				if (part) part.read = Math.max(part.read, Math.min(part.to, peaks.capacity));
				worker.terminate();
				running -= 1;
				if (running === 0) {
					peaks.complete = true;
					settle?.resolve();
				}
			} else {
				fail();
			}
			onUpdate();
		};
		worker.onerror = fail;
		worker.postMessage(request);
		return worker;
	};

	const first = launch({ file, origin: null, fromFrame: 0, toFrame: null }, null, (origin) => {
		peaks.setOrigin(origin, duration);
		loudness.reserve(origin.start, duration);
		const frames = Math.ceil((duration - origin.start) * origin.rate);
		const parts = workerCount(duration);
		// Boundaries fall on whole peaks, so no peak is shared by two workers.
		const bounds = Array.from(
			{ length: parts + 1 },
			(_, k) => Math.round((k * frames) / parts / PEAK_FRAMES) * PEAK_FRAMES,
		);
		const lastPeak = Number.MAX_SAFE_INTEGER;
		for (let k = 1; k < parts; k++) {
			const from = bounds[k] ?? 0;
			const to = k === parts - 1 ? null : (bounds[k + 1] ?? null);
			const segment = peaks.addSegment(from / PEAK_FRAMES, to === null ? lastPeak : to / PEAK_FRAMES);
			launch({ file, origin, fromFrame: from, toFrame: to }, segment);
		}
		const firstEnd = parts > 1 ? (bounds[1] ?? frames) : null;
		if (firstEnd !== null) {
			const limit: PeaksLimit = { type: 'limit', toFrame: firstEnd };
			first.postMessage(limit);
		}
		return peaks.addSegment(0, firstEnd === null ? lastPeak : firstEnd / PEAK_FRAMES);
	});

	return {
		peaks,
		loudness,
		done,
		cancel: () => {
			for (const worker of workers) worker.terminate();
		},
	};
}
