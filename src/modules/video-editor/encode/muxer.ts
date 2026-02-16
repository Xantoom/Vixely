export type ContainerFormat = 'mp4' | 'webm' | 'mkv';

export interface MuxerConfig {
	container: ContainerFormat;
	video: { codec: 'avc' | 'vp9' | 'av1' | 'hevc'; width: number; height: number };
	audio?: { codec: 'aac' | 'opus'; sampleRate: number; channels: number };
}

export interface ContainerMuxer {
	addVideoChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void;
	addAudioChunk?(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata): void;
	finalize(): Blob;
}

function unsupported(): never {
	throw new Error(
		'Muxer API has been superseded by Mediabunny Conversion/Output. Use exportWithWebCodecs() from this module set.',
	);
}

export function createContainerMuxer(_config: MuxerConfig): ContainerMuxer {
	return {
		addVideoChunk() {
			unsupported();
		},
		addAudioChunk() {
			unsupported();
		},
		finalize() {
			unsupported();
		},
	};
}
