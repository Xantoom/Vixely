import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';

export type ContainerFormat = 'mp4' | 'webm';

export interface MuxerConfig {
	container: ContainerFormat;
	video: { codec: 'avc' | 'vp9' | 'av1'; width: number; height: number };
	audio?: { codec: 'aac' | 'opus'; sampleRate: number; channels: number };
}

export interface ContainerMuxer {
	addVideoChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void;
	addAudioChunk?(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata): void;
	finalize(): Blob;
}

function createMp4Muxer(config: MuxerConfig): ContainerMuxer {
	const target = new Mp4Target();
	const muxer = new Mp4Muxer({
		target,
		video: { codec: config.video.codec, width: config.video.width, height: config.video.height },
		audio: config.audio
			? {
					codec: config.audio.codec,
					sampleRate: config.audio.sampleRate,
					numberOfChannels: config.audio.channels,
				}
			: undefined,
		fastStart: 'in-memory',
	});

	return {
		addVideoChunk(chunk, metadata) {
			muxer.addVideoChunk(chunk, metadata);
		},
		addAudioChunk: config.audio
			? (chunk, metadata) => {
					muxer.addAudioChunk(chunk, metadata);
				}
			: undefined,
		finalize() {
			muxer.finalize();
			return new Blob([target.buffer], { type: 'video/mp4' });
		},
	};
}

function createWebmMuxer(config: MuxerConfig): ContainerMuxer {
	const target = new WebmTarget();
	const muxer = new WebmMuxer({
		target,
		video: {
			codec: config.video.codec === 'vp9' ? 'V_VP9' : 'V_AV1',
			width: config.video.width,
			height: config.video.height,
		},
		audio: config.audio
			? {
					codec: config.audio.codec === 'opus' ? 'A_OPUS' : 'A_AAC/MPEG4/LC',
					sampleRate: config.audio.sampleRate,
					numberOfChannels: config.audio.channels,
				}
			: undefined,
	});

	return {
		addVideoChunk(chunk, metadata) {
			muxer.addVideoChunk(chunk, metadata);
		},
		addAudioChunk: config.audio
			? (chunk, metadata) => {
					muxer.addAudioChunk(chunk, metadata);
				}
			: undefined,
		finalize() {
			muxer.finalize();
			return new Blob([target.buffer], { type: 'video/webm' });
		},
	};
}

export function createContainerMuxer(config: MuxerConfig): ContainerMuxer {
	switch (config.container) {
		case 'mp4':
			return createMp4Muxer(config);
		case 'webm':
			return createWebmMuxer(config);
		default:
			throw new Error(`Unsupported container: ${config.container}`);
	}
}
