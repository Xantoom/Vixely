/**
 * Dolby TrueHD, the lossless sound of Blu-ray films, decoded by vixely-truehd. An access unit
 * holds 1/1200 s of sound: they are gathered into samples of a fiftieth of a second.
 */
import { type AudioCodec, AudioSample, CustomAudioDecoder, type EncodedPacket, registerDecoder } from 'mediabunny';
import { loadTrueHd } from '@/wasm/truehd';
import type { TrueHdDecoder as Decoder } from '@/wasm/vixely-truehd/vixely_truehd.js';

/**
 * Packets gathered into a sample. Mediabunny stops sending packets while 40 wait with no sample
 * out, so a sample has to come out before.
 */
const SAMPLE_PACKETS = 24;
/** Sound further than this from where the gathered sound ends starts a sample of its own. */
const GAP = 1 / 400;

class TrueHdDecoder extends CustomAudioDecoder {
	static override supports(codec: AudioCodec): boolean {
		return codec === 'truehd';
	}

	private decoder: Decoder | null = null;
	private pieces: Float32Array[] = [];
	private frames = 0;
	private packets = 0;
	/** Packets without sound since the last sample, when no sound came since either. */
	private silence: { start: number; end: number } | null = null;
	private start = 0;
	private channels = 0;
	private rate = 0;

	override async init() {
		this.decoder = new (await loadTrueHd()).TrueHdDecoder();
	}

	override decode(packet: EncodedPacket) {
		const { decoder } = this;
		if (!decoder) return;
		const samples = decoder.decode(packet.data);
		this.packets++;
		if (samples.length === 0) {
			// Damaged sound is left silent, still handed on: packets keep coming.
			this.silence ??= { start: packet.timestamp, end: packet.timestamp };
			this.silence.end = packet.timestamp + packet.duration;
			if (this.packets >= SAMPLE_PACKETS) this.emit();
			return;
		}
		const channels = decoder.channels();
		const rate = decoder.rate();
		const follows =
			channels === this.channels &&
			rate === this.rate &&
			Math.abs(packet.timestamp - (this.start + this.frames / this.rate)) < GAP;
		if (this.frames > 0 && !follows) this.emit();
		this.silence = null;
		if (this.frames === 0) {
			this.start = packet.timestamp;
			this.channels = channels;
			this.rate = rate;
		}
		this.pieces.push(samples);
		this.frames += samples.length / channels;
		if (this.packets >= SAMPLE_PACKETS) this.emit();
	}

	override async flush() {
		this.emit();
		// What comes next may start anywhere in the stream: a new decoder waits for a major sync.
		this.decoder?.free();
		await this.init();
	}

	override close() {
		this.pieces = [];
		this.frames = 0;
		this.packets = 0;
		this.silence = null;
		this.decoder?.free();
		this.decoder = null;
	}

	private emit() {
		this.packets = 0;
		if (this.frames === 0) {
			this.emitSilence();
			return;
		}
		const data = new Float32Array(this.frames * this.channels);
		let at = 0;
		for (const piece of this.pieces) {
			data.set(piece, at);
			at += piece.length;
		}
		this.pieces = [];
		this.frames = 0;
		this.onSample(
			new AudioSample({
				data,
				format: 'f32',
				numberOfChannels: this.channels,
				sampleRate: this.rate,
				timestamp: this.start,
			}),
		);
	}

	private emitSilence() {
		const { silence } = this;
		this.silence = null;
		if (!silence) return;
		const channels = this.channels || this.config.numberOfChannels;
		const rate = this.rate || this.config.sampleRate;
		const frames = Math.round((silence.end - silence.start) * rate);
		if (frames <= 0) return;
		this.onSample(
			new AudioSample({
				data: new Float32Array(frames * channels),
				format: 'f32',
				numberOfChannels: channels,
				sampleRate: rate,
				timestamp: silence.start,
			}),
		);
	}
}

let registered = false;

export function registerTrueHdDecoder() {
	if (registered) return;
	registered = true;
	registerDecoder(TrueHdDecoder);
}
