export type VideoCodec = 'avc1' | 'vp09' | 'av01';

export interface EncoderConfig {
	codec: VideoCodec;
	width: number;
	height: number;
	bitrate?: number;
	framerate?: number;
	onChunk: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
	onError?: (error: Error) => void;
}

const CODEC_STRINGS: Record<VideoCodec, string> = {
	avc1: 'avc1.640028', // H.264 High Profile Level 4.0
	vp09: 'vp09.00.31.08', // VP9 Profile 0
	av01: 'av01.0.08M.08', // AV1 Main Profile Level 4.0
};

export class WebCodecsVideoEncoder {
	private encoder: VideoEncoder | null = null;
	private frameCount = 0;

	get isConfigured(): boolean {
		return this.encoder?.state === 'configured';
	}

	get encodeQueueSize(): number {
		return this.encoder?.encodeQueueSize ?? 0;
	}

	configure(config: EncoderConfig): void {
		this.encoder = new VideoEncoder({
			output: (chunk, metadata) => {
				config.onChunk(chunk, metadata ?? undefined);
			},
			error: (e) => {
				config.onError?.(e instanceof Error ? e : new Error(String(e)));
			},
		});

		this.encoder.configure({
			codec: CODEC_STRINGS[config.codec] ?? config.codec,
			width: config.width,
			height: config.height,
			bitrate: config.bitrate ?? 2_500_000,
			framerate: config.framerate ?? 30,
			latencyMode: 'quality',
		});

		this.frameCount = 0;
	}

	encode(frame: VideoFrame, keyFrame = false): void {
		if (!this.encoder || this.encoder.state !== 'configured') return;
		this.encoder.encode(frame, { keyFrame: keyFrame || this.frameCount % 60 === 0 });
		this.frameCount++;
	}

	async flush(): Promise<void> {
		if (!this.encoder || this.encoder.state !== 'configured') return;
		await this.encoder.flush();
	}

	destroy(): void {
		if (this.encoder) {
			if (this.encoder.state !== 'closed') {
				this.encoder.close();
			}
			this.encoder = null;
		}
		this.frameCount = 0;
	}
}

/**
 * Check if a codec is supported by WebCodecs VideoEncoder.
 */
export async function isCodecSupported(codec: VideoCodec, width: number, height: number): Promise<boolean> {
	try {
		const support = await VideoEncoder.isConfigSupported({
			codec: CODEC_STRINGS[codec] ?? codec,
			width,
			height,
			bitrate: 2_500_000,
		});
		return support.supported ?? false;
	} catch {
		return false;
	}
}
