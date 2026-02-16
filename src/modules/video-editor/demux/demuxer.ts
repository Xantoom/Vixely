export interface DemuxedTrack {
	id: number;
	type: 'video' | 'audio';
	codec: string;
	codecDescription: Uint8Array;
	width?: number;
	height?: number;
	sampleRate?: number;
	channels?: number;
	timescale: number;
	duration: number;
}

export interface DemuxedSample {
	trackId: number;
	timestamp: number;
	duration: number;
	data: Uint8Array;
	isKeyframe: boolean;
}

export interface Demuxer {
	open(file: File): Promise<DemuxedTrack[]>;
	setExtractionTrack(trackId: number, onSample: (sample: DemuxedSample) => void): void;
	start(): void;
	seek(timeS: number): { keyframeTimestamp: number };
	flush(): void;
	destroy(): void;
}
