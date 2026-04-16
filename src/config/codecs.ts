export interface CodecDef {
	name: string;
	encoderId: string;
	containers: string[];
}

export interface ContainerDef {
	name: string;
	ext: string;
}

export interface AudioCodecDef {
	name: string;
	encoderId: string;
	containers: string[];
}

export const VIDEO_CODECS: CodecDef[] = [
	{ name: 'H.264 (AVC)', encoderId: 'libx264', containers: ['mp4', 'mkv'] },
	{ name: 'H.265 (HEVC)', encoderId: 'libx265', containers: ['mp4', 'mkv'] },
	{ name: 'VP9', encoderId: 'libvpx-vp9', containers: ['webm', 'mkv'] },
	{ name: 'AV1', encoderId: 'libaom-av1', containers: ['webm', 'mp4', 'mkv'] },
];

export const CONTAINERS: ContainerDef[] = [
	{ name: 'MP4', ext: 'mp4' },
	{ name: 'MKV', ext: 'mkv' },
	{ name: 'WebM', ext: 'webm' },
];

export const AUDIO_CODECS: AudioCodecDef[] = [
	{ name: 'AAC', encoderId: 'aac', containers: ['mp4', 'mkv'] },
	{ name: 'Opus', encoderId: 'libopus', containers: ['webm', 'mkv', 'mp4'] },
	{ name: 'No Audio', encoderId: 'none', containers: ['mp4', 'mkv', 'webm'] },
];

export const AUDIO_BITRATES = [
	{ label: '64k', value: '64k' },
	{ label: '96k', value: '96k' },
	{ label: '128k', value: '128k' },
	{ label: '192k', value: '192k' },
	{ label: '256k', value: '256k' },
	{ label: '320k', value: '320k' },
];

/** Check if a codec+container combo is valid */
export function isValidCombo(codecLib: string, container: string): boolean {
	const codec = VIDEO_CODECS.find((c) => c.encoderId === codecLib);
	return codec?.containers.includes(container) ?? false;
}

/** Check if an audio codec+container combo is valid */
export function isValidAudioCombo(audioLib: string, container: string): boolean {
	if (audioLib === 'none') return true;
	const codec = AUDIO_CODECS.find((c) => c.encoderId === audioLib);
	return codec?.containers.includes(container) ?? false;
}
