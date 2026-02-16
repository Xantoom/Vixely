import type { DemuxedTrack, DemuxedSample } from '../demux/demuxer.ts';

export interface DecoderConfig {
	track: DemuxedTrack;
	onFrame: (frame: VideoFrame) => void;
	onError?: (error: Error) => void;
}

export class WebCodecsVideoDecoder {
	private decoder: VideoDecoder | null = null;
	private frameCallback: ((frame: VideoFrame) => void) | null = null;
	private pendingFlush: (() => void) | null = null;

	get isConfigured(): boolean {
		return this.decoder?.state === 'configured';
	}

	get decodeQueueSize(): number {
		return this.decoder?.decodeQueueSize ?? 0;
	}

	configure(config: DecoderConfig): void {
		this.frameCallback = config.onFrame;

		this.decoder = new VideoDecoder({
			output: (frame) => {
				this.frameCallback?.(frame);
			},
			error: (e) => {
				config.onError?.(e instanceof Error ? e : new Error(String(e)));
			},
		});

		this.decoder.configure({
			codec: config.track.codec,
			codedWidth: config.track.width,
			codedHeight: config.track.height,
			description: config.track.codecDescription.length > 0 ? config.track.codecDescription : undefined,
		});
	}

	setOnFrame(callback: (frame: VideoFrame) => void): void {
		this.frameCallback = callback;
	}

	decode(sample: DemuxedSample): void {
		if (!this.decoder || this.decoder.state !== 'configured') return;

		const chunk = new EncodedVideoChunk({
			type: sample.isKeyframe ? 'key' : 'delta',
			timestamp: sample.timestamp,
			duration: sample.duration,
			data: sample.data,
		});

		this.decoder.decode(chunk);
	}

	async flush(): Promise<void> {
		if (!this.decoder || this.decoder.state !== 'configured') return;
		await this.decoder.flush();
	}

	async reset(): Promise<void> {
		if (!this.decoder) {
			await Promise.resolve();
			return;
		}
		if (this.decoder.state === 'configured') {
			this.decoder.reset();
		}
		await Promise.resolve();
	}

	destroy(): void {
		if (this.decoder) {
			if (this.decoder.state !== 'closed') {
				this.decoder.close();
			}
			this.decoder = null;
		}
		this.frameCallback = null;
	}
}

export class WebCodecsAudioDecoder {
	private decoder: AudioDecoder | null = null;
	private dataCallback: ((data: AudioData) => void) | null = null;

	configure(track: DemuxedTrack, onData: (data: AudioData) => void): void {
		this.dataCallback = onData;

		this.decoder = new AudioDecoder({
			output: (data) => {
				this.dataCallback?.(data);
			},
			error: (e) => {
				console.error('AudioDecoder error:', e);
			},
		});

		this.decoder.configure({
			codec: track.codec,
			sampleRate: track.sampleRate ?? 44100,
			numberOfChannels: track.channels ?? 2,
			description: track.codecDescription.length > 0 ? track.codecDescription : undefined,
		});
	}

	decode(sample: DemuxedSample): void {
		if (!this.decoder || this.decoder.state !== 'configured') return;

		const chunk = new EncodedAudioChunk({
			type: sample.isKeyframe ? 'key' : 'delta',
			timestamp: sample.timestamp,
			duration: sample.duration,
			data: sample.data,
		});

		this.decoder.decode(chunk);
	}

	async flush(): Promise<void> {
		if (!this.decoder || this.decoder.state !== 'configured') return;
		await this.decoder.flush();
	}

	destroy(): void {
		if (this.decoder) {
			if (this.decoder.state !== 'closed') {
				this.decoder.close();
			}
			this.decoder = null;
		}
		this.dataCallback = null;
	}
}
