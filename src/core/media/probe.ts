import {
	canEncodeAudio,
	canEncodeVideo,
	getEncodableAudioCodecs,
	getEncodableVideoCodecs,
	type AudioCodec as MbAudioCodec,
	type VideoCodec as MbVideoCodec,
} from "mediabunny";
import type { AudioCodec, VideoCodec } from "../document/types.ts";
import { audioExtensionFor, ensureExtension, videoExtensionFor } from "./codecs.ts";

/**
 * What this machine can actually encode.
 *
 * WebCodecs support varies by browser, OS and hardware, so a codec is never
 * assumed. An unavailable one is shown disabled *with its reason* rather than
 * hidden: an advanced user must understand why HEVC is missing instead of
 * suspecting an oversight.
 */
export type CodecAvailability = {
	readonly codec: string;
	readonly available: boolean;
	/** i18n-free technical reason, shown next to the disabled entry. */
	readonly reason: string | null;
};

const AUDIO_CODEC_MAP: Record<AudioCodec, MbAudioCodec> = {
	aac: "aac",
	opus: "opus",
	mp3: "mp3",
	vorbis: "vorbis",
	flac: "flac",
	ac3: "ac3",
	eac3: "eac3",
	dts: "dts",
	"pcm-s16": "pcm-s16",
	"pcm-s24": "pcm-s24",
	"pcm-f32": "pcm-f32",
};

const VIDEO_CODEC_MAP: Record<VideoCodec, MbVideoCodec> = {
	avc: "avc",
	hevc: "hevc",
	vp8: "vp8",
	vp9: "vp9",
	av1: "av1",
	prores: "prores",
};

export async function probeVideoEncoder(
	codec: VideoCodec,
	width: number,
	height: number,
): Promise<CodecAvailability> {
	try {
		// The extension has to be registered before the probe, or a codec it
		// provides reports as unavailable.
		await ensureExtension(videoExtensionFor(codec));
		const available = await canEncodeVideo(VIDEO_CODEC_MAP[codec], { width, height });
		return {
			codec,
			available,
			reason: available ? null : "no encoder for this codec on this device",
		};
	} catch (cause) {
		return { codec, available: false, reason: describe(cause) };
	}
}

export async function probeAudioEncoder(
	codec: AudioCodec,
	sampleRate: number,
	channels: number,
): Promise<CodecAvailability> {
	try {
		await ensureExtension(audioExtensionFor(codec));
		const available = await canEncodeAudio(AUDIO_CODEC_MAP[codec], {
			numberOfChannels: channels,
			sampleRate,
		});
		return {
			codec,
			available,
			reason: available ? null : "no encoder for this codec on this device",
		};
	} catch (cause) {
		return { codec, available: false, reason: describe(cause) };
	}
}

/** Probes a whole list at once, for populating a codec picker. */
export async function probeVideoEncoders(
	codecs: readonly VideoCodec[],
	width: number,
	height: number,
): Promise<readonly CodecAvailability[]> {
	return Promise.all(codecs.map((codec) => probeVideoEncoder(codec, width, height)));
}

export async function probeAudioEncoders(
	codecs: readonly AudioCodec[],
	sampleRate: number,
	channels: number,
): Promise<readonly CodecAvailability[]> {
	return Promise.all(codecs.map((codec) => probeAudioEncoder(codec, sampleRate, channels)));
}

export async function encodableVideoCodecs(): Promise<readonly string[]> {
	return getEncodableVideoCodecs();
}

export async function encodableAudioCodecs(): Promise<readonly string[]> {
	return getEncodableAudioCodecs();
}

export function toMediabunnyVideoCodec(codec: VideoCodec): MbVideoCodec {
	return VIDEO_CODEC_MAP[codec];
}

export function toMediabunnyAudioCodec(codec: AudioCodec): MbAudioCodec {
	return AUDIO_CODEC_MAP[codec];
}

function describe(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
