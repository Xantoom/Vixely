/**
 * Reads the waveform of part of an audio track off the main thread. See `readPeaks`.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { DECODER_PREROLL } from '@/media/decoder';
import { PEAK_CHUNK, PEAK_FRAMES, type PeaksLimit, type PeaksMessage, type PeaksRequest } from '@/media/peaks-protocol';
import { loadAudio } from '@/wasm/audio';

function post(message: PeaksMessage) {
	const transfer =
		message.type === 'chunk'
			? [message.data.buffer]
			: message.type === 'loudness'
				? [message.momentary.buffer, message.peak.buffer]
				: [];
	self.postMessage(message, { transfer });
}

function toByte(value: number): number {
	return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

/** Frame at which to stop. The page can bring it forward while decoding runs. */
let limit = Number.POSITIVE_INFINITY;

/** Collects peaks into chunks of consecutive indices and sends each chunk when it is full. */
class ChunkWriter {
	private data = new Int8Array(PEAK_CHUNK * 2);
	private offset = -1;
	private length = 0;

	write(index: number, min: number, max: number) {
		if (this.offset < 0 || index < this.offset || index >= this.offset + PEAK_CHUNK) {
			this.flush();
			this.offset = index;
		}
		const at = index - this.offset;
		this.data[at * 2] = toByte(min);
		this.data[at * 2 + 1] = toByte(max);
		this.length = Math.max(this.length, at + 1);
	}

	flush() {
		if (this.offset < 0 || this.length === 0) return;
		post({ type: 'chunk', offset: this.offset, data: this.data.slice(0, this.length * 2) });
		this.data.fill(0);
		this.offset = -1;
		this.length = 0;
	}
}

type Meter = InstanceType<Awaited<ReturnType<typeof loadAudio>>['LoudnessMeter']>;

/** Blocks sent back to the page at once, at most. */
const LOUDNESS_CHUNK = 600;

/**
 * Feeds the loudness meter and reads it at the end of every 100 ms block. The meter keeps its own
 * history, so each block's reading covers the 400 ms before it, as EBU R128 requires.
 */
class LoudnessWriter {
	private block = -1;
	private scratch = new Float32Array(0);
	private index = -1;
	private momentary: number[] = [];
	private peak: number[] = [];

	constructor(
		private meter: Meter,
		private rate: number,
		/** First frame of this worker's part: blocks starting before it belong to another worker. */
		private from: number,
	) {}

	/** First frame of block `k`. */
	boundary(block: number): number {
		return Math.round((block * this.rate) / 10);
	}

	blockOf(frame: number): number {
		let block = Math.floor((frame * 10) / this.rate);
		while (this.boundary(block + 1) <= frame) block += 1;
		while (block > 0 && this.boundary(block) > frame) block -= 1;
		return block;
	}

	/** Adds frames `start` to `end` of the given planes, whose first frame is `origin` in the track. */
	feed(planes: Float32Array[], origin: number, start: number, end: number, to: number) {
		if (this.block < 0) this.block = this.blockOf(origin + start);
		let i = start;
		while (i < end) {
			const boundary = this.boundary(this.block + 1);
			const pieceEnd = Math.min(end, boundary - origin);
			const length = pieceEnd - i;
			if (length > 0) {
				if (this.scratch.length < length * planes.length)
					this.scratch = new Float32Array(length * planes.length);
				const planar = this.scratch.subarray(0, length * planes.length);
				planes.forEach((plane, c) => {
					planar.set(plane.subarray(i, pieceEnd), c * length);
				});
				this.meter.add(planar, length);
			}
			i = pieceEnd;
			if (origin + i >= boundary) {
				this.finish(to);
				this.block += 1;
			}
		}
	}

	private finish(to: number) {
		const start = this.boundary(this.block);
		const peak = this.meter.true_peak();
		// The first blocks of the track have less than 400 ms behind them: EBU R128 skips them.
		if (start < this.from || start >= to || this.block < 3) return;
		if (this.index + this.momentary.length !== this.block) this.flush();
		if (this.momentary.length === 0) this.index = this.block;
		this.momentary.push(this.meter.momentary());
		this.peak.push(peak);
		if (this.momentary.length >= LOUDNESS_CHUNK) this.flush();
	}

	flush() {
		if (this.momentary.length === 0) return;
		post({
			type: 'loudness',
			index: this.index,
			momentary: Float32Array.from(this.momentary),
			peak: Float32Array.from(this.peak),
		});
		this.momentary = [];
		this.peak = [];
	}
}

/**
 * Decodes a part of the track in order and keeps only the loudest and quietest value of every
 * peak. Frames are placed by their timestamp, so parts read by different workers line up exactly.
 * Samples are released as soon as they are read: memory stays flat whatever the file length.
 */
async function read(request: PeaksRequest) {
	const input = new Input({ source: new BlobSource(request.file), formats: ALL_FORMATS });
	limit = request.toFrame ?? Number.POSITIVE_INFINITY;
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track || !(await track.canDecode())) {
			post({ type: 'error' });
			return;
		}
		let origin = request.origin;
		const from = origin
			? Math.max(origin.start, origin.start + request.fromFrame / origin.rate - DECODER_PREROLL)
			: undefined;
		const writer = new ChunkWriter();
		// Loudness is measured when the analysis module loads; the waveform doesn't depend on it.
		const audio = await loadAudio().catch(() => null);
		let loudness: LoudnessWriter | null = null;
		let peak = -1;
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		let plane = new Float32Array(0);
		const planes: Float32Array[] = [];

		for await (const sample of new AudioSampleSink(track).samples(from)) {
			if (!origin) {
				origin = { start: sample.timestamp, rate: sample.sampleRate };
				post({ type: 'start', ...origin });
			}
			const first = Math.round((sample.timestamp - origin.start) * origin.rate);
			if (audio && !loudness) {
				loudness = new LoudnessWriter(
					new audio.LoudnessMeter(sample.numberOfChannels, origin.rate),
					origin.rate,
					request.fromFrame,
				);
			}
			// The block in progress at the end of the part is finished here: the next worker skips it.
			const meterEnd =
				loudness && Number.isFinite(limit) ? loudness.boundary(loudness.blockOf(limit - 1) + 1) : limit;
			if (first >= Math.max(limit, meterEnd)) {
				sample.close();
				break;
			}
			const length = sample.numberOfFrames;
			const channels = sample.numberOfChannels;
			if (plane.length < length * channels) plane = new Float32Array(length * channels);
			planes.length = 0;
			for (let c = 0; c < channels; c++) {
				const view = plane.subarray(c * length, (c + 1) * length);
				sample.copyTo(view, { planeIndex: c, format: 'f32-planar' });
				planes.push(view);
			}
			sample.close();
			loudness?.feed(planes, first, Math.max(0, -first), Math.min(length, meterEnd - first), limit);

			const start = Math.max(0, request.fromFrame - first);
			const end = Math.min(length, limit - first);
			for (let i = start; i < end; i++) {
				const index = Math.floor((first + i) / PEAK_FRAMES);
				if (index !== peak) {
					if (peak >= 0) writer.write(peak, min, max);
					peak = index;
					min = Number.POSITIVE_INFINITY;
					max = Number.NEGATIVE_INFINITY;
				}
				for (const channel of planes) {
					const value = channel[i] ?? 0;
					if (value < min) min = value;
					if (value > max) max = value;
				}
			}
		}
		if (peak >= 0) writer.write(peak, min, max);
		writer.flush();
		loudness?.flush();
		post({ type: 'done' });
	} catch {
		post({ type: 'error' });
	} finally {
		input.dispose();
	}
}

self.onmessage = (event: MessageEvent<PeaksRequest | PeaksLimit>) => {
	const message = event.data;
	if ('file' in message) void read(message);
	else limit = message.toFrame;
};
