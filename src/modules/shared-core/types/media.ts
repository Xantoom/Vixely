export interface StreamInfo {
	index: number;
	type: 'video' | 'audio' | 'subtitle';
	codec: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	title?: string;
	bitrate?: number;
	isDefault?: boolean;
	isForced?: boolean;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface ProbeResult {
	duration: number;
	bitrate: number;
	format: string;
	streams: StreamInfo[];
}

export interface TrackSelection {
	audioEnabled: boolean;
	subtitleEnabled: boolean;
	audioTrackIndex: number;
	subtitleTrackIndex: number;
}

export const DEFAULT_TRACK_SELECTION: Readonly<TrackSelection> = {
	audioEnabled: true,
	subtitleEnabled: false,
	audioTrackIndex: 0,
	subtitleTrackIndex: 0,
};
