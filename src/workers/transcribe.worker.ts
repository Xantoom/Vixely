/**
 * Speech to text with Whisper, run by transformers.js on the graphics card (WebGPU) or the
 * processor (WebAssembly), off the main thread. The model is downloaded from Hugging Face the first
 * time and kept in the browser's cache; the sound never leaves the device. A long file is heard
 * five minutes at a time, so memory stays low whatever its length.
 */
import { env, pipeline } from '@huggingface/transformers';
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { findAudioTrack } from '@/media/audio-tracks';
import { canDecodeAudio } from '@/media/decoders';
import type { SpokenLine, TranscribeMessage, TranscribeRequest, WhisperModel } from '@/media/transcribe-protocol';
import ortMjs from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url';

// The engine comes with the app rather than from a CDN. Its package doesn't export these files:
// they are taken from where it is installed.
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
env.allowLocalModels = false;

const MODELS: Record<WhisperModel, string> = {
	tiny: 'onnx-community/whisper-tiny',
	base: 'onnx-community/whisper-base',
	small: 'onnx-community/whisper-small',
};

/** Whisper hears 16 kHz mono. */
const RATE = 16_000;
/** Sound heard at once, in seconds. */
const SEGMENT = 300;

function post(message: TranscribeMessage) {
	self.postMessage(message);
}

/** Mixes planar audio down to one channel and brings it to 16 kHz, as a stream. */
class ToWhisper {
	private readonly step: number;
	private position = 0;
	private carry: number[] = [];
	out: number[] = [];

	constructor(rate: number) {
		this.step = rate / RATE;
	}

	push(planar: Float32Array, frames: number, channels: number) {
		const mono = new Float32Array(frames);
		for (let c = 0; c < channels; c++) {
			for (let i = 0; i < frames; i++) mono[i] = (mono[i] ?? 0) + (planar[c * frames + i] ?? 0) / channels;
		}
		const samples = [...this.carry, ...mono];
		// Averaging over one step before picking removes what 16 kHz can't hold.
		const width = Math.max(1, Math.round(this.step));
		while (this.position + width < samples.length) {
			const at = Math.floor(this.position);
			let sum = 0;
			for (let k = 0; k < width; k++) sum += samples[at + k] ?? 0;
			this.out.push(sum / width);
			this.position += this.step;
		}
		const keep = Math.floor(this.position);
		this.carry = samples.slice(keep);
		this.position -= keep;
	}
}

/** Reading ends here for a subtitle line: longer ones are cut at word breaks. */
const LONGEST_LINE = 84;

/** Whisper's sentences, cut into lines that fit on screen and last in step with their words. */
function toLines(start: number, end: number, text: string): SpokenLine[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0 || end <= start) return [];
	const pieces: string[][] = [[]];
	for (const word of words) {
		const piece = pieces.at(-1) ?? [];
		if (piece.length > 0 && [...piece, word].join(' ').length > LONGEST_LINE) pieces.push([word]);
		else piece.push(word);
	}
	const total = words.join(' ').length;
	let at = start;
	return pieces.map((piece) => {
		const line = piece.join(' ');
		const length = ((end - start) * line.length) / total;
		const made = { start: at, end: at + length, text: wrap(line) };
		at += length;
		return made;
	});
}

/** Two lines of about equal length when a line is long, as subtitles are laid out. */
function wrap(line: string): string {
	if (line.length <= 42) return line;
	const middle = line.length / 2;
	let best = -1;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
	}
	return best < 0 ? line : `${line.slice(0, best)}\n${line.slice(best + 1)}`;
}

async function hasGpu(): Promise<boolean> {
	const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
	return Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
}

async function transcribe(request: TranscribeRequest) {
	const gpu = await hasGpu();
	const files = new Map<string, { loaded: number; total: number }>();
	const recognize = await pipeline('automatic-speech-recognition', MODELS[request.model], {
		device: gpu ? 'webgpu' : 'wasm',
		dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
		progress_callback: (event: { status: string; file?: string; loaded?: number; total?: number }) => {
			if (event.status !== 'progress' || !event.file) return;
			files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
			const all = [...files.values()];
			const total = all.reduce((sum, file) => sum + file.total, 0);
			post({ type: 'loading', share: total > 0 ? all.reduce((sum, file) => sum + file.loaded, 0) / total : 0 });
		},
	});
	post({ type: 'loading', share: 1 });

	const input = new Input({ source: new BlobSource(request.file), formats: ALL_FORMATS });
	try {
		const track = await findAudioTrack(input, request.track);
		if (!track || !(await canDecodeAudio(track))) throw new Error('No sound to hear');
		const duration = await track.computeDuration();
		const sink = new AudioSampleSink(track);
		const segments = Math.max(1, Math.ceil(duration / SEGMENT));
		for (let index = 0; index < segments; index++) {
			const from = index * SEGMENT;
			const to = Math.min(duration, from + SEGMENT);
			const sound = new ToWhisper(track.sampleRate);
			// oxlint-disable-next-line no-await-in-loop -- segments are heard in order
			for await (const sample of sink.samples(from, to)) {
				const skip = Math.max(0, Math.round((from - sample.timestamp) * sample.sampleRate));
				const frames =
					Math.min(sample.numberOfFrames, Math.round((to - sample.timestamp) * sample.sampleRate)) - skip;
				if (frames > 0) {
					const planar = new Float32Array(frames * sample.numberOfChannels);
					for (let c = 0; c < sample.numberOfChannels; c++) {
						sample.copyTo(planar.subarray(c * frames, (c + 1) * frames), {
							planeIndex: c,
							format: 'f32-planar',
							frameOffset: skip,
							frameCount: frames,
						});
					}
					sound.push(planar, frames, sample.numberOfChannels);
				}
				sample.close();
			}
			// oxlint-disable-next-line no-await-in-loop -- segments are heard in order
			const heard = (await recognize(Float32Array.from(sound.out), {
				return_timestamps: true,
				chunk_length_s: 30,
				stride_length_s: 5,
				language: request.language ?? undefined,
				task: 'transcribe',
			})) as { chunks?: { timestamp: [number, number | null]; text: string }[] };
			const lines = (heard.chunks ?? []).flatMap((chunk) => {
				const start = from + chunk.timestamp[0];
				const end = from + (chunk.timestamp[1] ?? Math.min(to - from, chunk.timestamp[0] + 5));
				return toLines(start, Math.min(end, to), chunk.text);
			});
			post({ type: 'progress', done: index + 1, total: segments, lines });
		}
		post({ type: 'done' });
	} finally {
		input.dispose();
		await recognize.dispose();
	}
}

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
	transcribe(event.data).catch((error: unknown) => {
		post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
	});
};
