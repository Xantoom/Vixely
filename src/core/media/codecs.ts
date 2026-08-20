import type { AudioCodec, VideoCodec } from "../document/types.ts";

/**
 * Codec → extension registry.
 *
 * Extensions are dynamic imports so a user cropping an image never downloads
 * the DTS encoder, and each one exports a `register*` function that has to be
 * *called*: importing the module alone leaves the codec unavailable, and the
 * failure surfaces as a cryptic "configuration not supported".
 */
export type CodecExtension = {
	readonly package: string;
	readonly register: () => Promise<void>;
};

/** Only encoders need an extension; decoding is built in, bar AC-3 and DTS. */
const AUDIO_ENCODER_EXTENSIONS: Partial<Record<AudioCodec, CodecExtension>> = {
	aac: {
		package: "@mediabunny/aac-encoder",
		register: async () => {
			const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
			registerAacEncoder();
		},
	},
	mp3: {
		package: "@mediabunny/mp3-encoder",
		register: async () => {
			const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
			registerMp3Encoder();
		},
	},
	flac: {
		package: "@mediabunny/flac-encoder",
		register: async () => {
			const { registerFlacEncoder } = await import("@mediabunny/flac-encoder");
			registerFlacEncoder();
		},
	},
	ac3: {
		package: "@mediabunny/ac3",
		register: async () => {
			const { registerAc3Decoder, registerAc3Encoder } = await import("@mediabunny/ac3");
			registerAc3Decoder();
			registerAc3Encoder();
		},
	},
	eac3: {
		package: "@mediabunny/ac3",
		register: async () => {
			const { registerAc3Decoder, registerAc3Encoder } = await import("@mediabunny/ac3");
			registerAc3Decoder();
			registerAc3Encoder();
		},
	},
	dts: {
		package: "@mediabunny/dts",
		register: async () => {
			const { registerDtsDecoder, registerDtsEncoder } = await import("@mediabunny/dts");
			registerDtsDecoder();
			registerDtsEncoder();
		},
	},
};

const VIDEO_ENCODER_EXTENSIONS: Partial<Record<VideoCodec, CodecExtension>> = {
	prores: {
		package: "@mediabunny/prores",
		register: async () => {
			const { registerProresDecoder } = await import("@mediabunny/prores");
			registerProresDecoder();
		},
	},
};

export function audioExtensionFor(codec: AudioCodec): CodecExtension | undefined {
	return AUDIO_ENCODER_EXTENSIONS[codec];
}

export function videoExtensionFor(codec: VideoCodec): CodecExtension | undefined {
	return VIDEO_ENCODER_EXTENSIONS[codec];
}

const loaded = new Set<string>();

/** Idempotent: a codec used twice registers its extension once. */
export async function ensureExtension(extension: CodecExtension | undefined): Promise<void> {
	if (extension === undefined || loaded.has(extension.package)) return;
	await extension.register();
	loaded.add(extension.package);
}

export function extensionIsLoaded(name: string): boolean {
	return loaded.has(name);
}

/** Containers, and what each of them can legally carry. */
export type ContainerFormat =
	| "mp4"
	| "mkv"
	| "webm"
	| "mov"
	| "ogg"
	| "mp3"
	| "wav"
	| "flac"
	| "aac";

export const CONTAINER_VIDEO_CODECS: Record<ContainerFormat, readonly VideoCodec[]> = {
	mp4: ["avc", "hevc", "vp9", "av1"],
	mov: ["avc", "hevc", "prores"],
	mkv: ["avc", "hevc", "vp8", "vp9", "av1"],
	webm: ["vp8", "vp9", "av1"],
	ogg: [],
	mp3: [],
	wav: [],
	flac: [],
	aac: [],
};

export const CONTAINER_AUDIO_CODECS: Record<ContainerFormat, readonly AudioCodec[]> = {
	mp4: ["aac", "opus", "mp3", "flac", "ac3", "eac3", "dts", "pcm-s16", "pcm-s24"],
	mov: ["aac", "pcm-s16", "pcm-s24"],
	mkv: ["aac", "opus", "mp3", "vorbis", "flac", "ac3", "eac3", "dts", "pcm-s16", "pcm-s24"],
	webm: ["opus", "vorbis"],
	ogg: ["opus", "vorbis", "flac"],
	mp3: ["mp3"],
	wav: ["pcm-s16", "pcm-s24", "pcm-f32"],
	flac: ["flac"],
	aac: ["aac"],
};

/**
 * Subtitle carriage is the one place the container genuinely limits us: MP4
 * standardises neither ASS nor PGS, which is why MKV is the reference container
 * for embedded subtitles (ADR 004d).
 */
export const CONTAINER_SUBTITLE_SUPPORT: Record<
	ContainerFormat,
	{ readonly text: boolean; readonly ass: boolean; readonly pgs: boolean }
> = {
	mkv: { text: true, ass: true, pgs: true },
	mp4: { text: true, ass: false, pgs: false },
	mov: { text: true, ass: false, pgs: false },
	webm: { text: true, ass: false, pgs: false },
	ogg: { text: false, ass: false, pgs: false },
	mp3: { text: false, ass: false, pgs: false },
	wav: { text: false, ass: false, pgs: false },
	flac: { text: false, ass: false, pgs: false },
	aac: { text: false, ass: false, pgs: false },
};

export function containerAccepts(
	container: ContainerFormat,
	codec: VideoCodec | AudioCodec,
): boolean {
	return (
		(CONTAINER_VIDEO_CODECS[container] as readonly string[]).includes(codec) ||
		(CONTAINER_AUDIO_CODECS[container] as readonly string[]).includes(codec)
	);
}

export const CONTAINER_EXTENSIONS: Record<ContainerFormat, string> = {
	mp4: "mp4",
	mov: "mov",
	mkv: "mkv",
	webm: "webm",
	ogg: "ogg",
	mp3: "mp3",
	wav: "wav",
	flac: "flac",
	aac: "aac",
};
