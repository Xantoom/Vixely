/**
 * Reads the waveform of part of an audio track off the main thread. See `readPeaks`.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { DECODER_PREROLL } from '@/media/decoder';
import { PEAK_CHUNK, PEAK_FRAMES, type PeaksLimit, type PeaksMessage, type PeaksRequest } from '@/media/peaks-protocol';

function post(message: PeaksMessage) {
	self.postMessage(message, { transfer: message.type === 'chunk' ? [message.data.buffer] : [] });
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
			if (first >= limit) {
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
