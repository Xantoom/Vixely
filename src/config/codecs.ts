export interface CodecDef {
	name: string;
	ffmpegLib: string;
	containers: string[];
}

export interface ContainerDef {
	name: string;
	ext: string;
}

export interface AudioCodecDef {
	name: string;
	ffmpegLib: string;
	containers: string[];
}

export const VIDEO_CODECS: CodecDef[] = [
	{ name: "H.264 (AVC)", ffmpegLib: "libx264", containers: ["mp4", "mkv"] },
	{ name: "H.265 (HEVC)", ffmpegLib: "libx265", containers: ["mp4", "mkv"] },
	{ name: "VP9", ffmpegLib: "libvpx-vp9", containers: ["webm", "mkv"] },
	{ name: "AV1", ffmpegLib: "libaom-av1", containers: ["webm", "mp4", "mkv"] },
];

export const CONTAINERS: ContainerDef[] = [
	{ name: "MP4", ext: "mp4" },
	{ name: "MKV", ext: "mkv" },
	{ name: "WebM", ext: "webm" },
];

export const AUDIO_CODECS: AudioCodecDef[] = [
	{ name: "AAC", ffmpegLib: "aac", containers: ["mp4", "mkv"] },
	{ name: "Opus", ffmpegLib: "libopus", containers: ["webm", "mkv"] },
	{ name: "No Audio", ffmpegLib: "none", containers: ["mp4", "mkv", "webm"] },
];

export const ENCODING_PRESETS = [
	{ name: "Ultrafast", value: "ultrafast" },
	{ name: "Superfast", value: "superfast" },
	{ name: "Veryfast", value: "veryfast" },
	{ name: "Fast", value: "fast" },
	{ name: "Medium", value: "medium" },
	{ name: "Slow", value: "slow" },
	{ name: "Veryslow", value: "veryslow" },
];

export const AUDIO_BITRATES = [
	{ label: "64k", value: "64k" },
	{ label: "96k", value: "96k" },
	{ label: "128k", value: "128k" },
	{ label: "192k", value: "192k" },
	{ label: "256k", value: "256k" },
	{ label: "320k", value: "320k" },
];

/** Check if a codec+container combo is valid */
export function isValidCombo(codecLib: string, container: string): boolean {
	const codec = VIDEO_CODECS.find((c) => c.ffmpegLib === codecLib);
	return codec?.containers.includes(container) ?? false;
}

/** Check if an audio codec+container combo is valid */
export function isValidAudioCombo(audioLib: string, container: string): boolean {
	if (audioLib === "none") return true;
	const codec = AUDIO_CODECS.find((c) => c.ffmpegLib === audioLib);
	return codec?.containers.includes(container) ?? false;
}
