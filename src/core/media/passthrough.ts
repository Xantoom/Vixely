import { EncodedPacketSink } from "mediabunny";
import type { MuxPacket, MuxTrack } from "../container/index.ts";
import { MediaError } from "./types.ts";
import type { OpenedInput } from "./input.ts";

/**
 * Reads a track's already-encoded packets, without decoding them.
 *
 * This is the brick the whole subtitle design rests on: `EncodedPacketSink`
 * hands over the packets as they are, and `EncodedPacket` carries `data`,
 * `type`, `timestamp` and `duration` — exactly what a muxer needs. Video and
 * audio therefore travel through our writer untouched, so adding a subtitle
 * track to a film re-encodes nothing.
 */

export type PassthroughTracks = {
	readonly tracks: readonly MuxTrack[];
	readonly packets: readonly MuxPacket[];
	readonly durationMs: number;
};

/**
 * Extracts every video and audio track as muxer input.
 *
 * `trackNumberOffset` leaves room for the subtitle tracks that will be added
 * alongside; Matroska track numbers must be unique within a file.
 */
export async function extractPassthroughTracks(
	opened: OpenedInput,
	options: { readonly signal?: AbortSignal } = {},
): Promise<PassthroughTracks> {
	const tracks: MuxTrack[] = [];
	const packets: MuxPacket[] = [];

	const [videoTracks, audioTracks] = await Promise.all([
		opened.input.getVideoTracks(),
		opened.input.getAudioTracks(),
	]);

	let number = 1;

	for (const track of videoTracks) {
		const codecId = matroskaVideoCodecId(track.codec);
		const codecPrivate = await decoderDescription(track);
		if (codecId === null) {
			throw new MediaError(
				`cannot pass ${track.codec ?? "this codec"} through a Matroska container`,
				"mux",
				track.codec ?? undefined,
			);
		}

		tracks.push({
			number,
			kind: "video",
			codecId,
			// Without the decoder description a remuxed track parses but will
			// not decode: this is the codec's own header, and dropping it is
			// what turns a passthrough into a broken file.
			...(codecPrivate === null ? {} : { codecPrivate }),
			width: track.codedWidth,
			height: track.codedHeight,
			...(track.languageCode === null ? {} : { language: track.languageCode }),
			...(track.name === null ? {} : { name: track.name }),
		});

		await collect(track, number, packets, options.signal);
		number += 1;
	}

	for (const track of audioTracks) {
		const codecId = matroskaAudioCodecId(track.codec);
		const codecPrivate = await decoderDescription(track);
		if (codecId === null) {
			throw new MediaError(
				`cannot pass ${track.codec ?? "this codec"} through a Matroska container`,
				"mux",
				track.codec ?? undefined,
			);
		}

		tracks.push({
			number,
			kind: "audio",
			codecId,
			...(codecPrivate === null ? {} : { codecPrivate }),
			sampleRate: track.sampleRate,
			channels: track.numberOfChannels,
			...(track.languageCode === null ? {} : { language: track.languageCode }),
			...(track.name === null ? {} : { name: track.name }),
		});

		await collect(track, number, packets, options.signal);
		number += 1;
	}

	return { tracks, packets, durationMs: opened.probe.durationSec * 1000 };
}

async function collect(
	track: ConstructorParameters<typeof EncodedPacketSink>[0],
	trackNumber: number,
	packets: MuxPacket[],
	signal: AbortSignal | undefined,
): Promise<void> {
	const sink = new EncodedPacketSink(track);
	for await (const packet of sink.packets()) {
		if (signal?.aborted === true) return;
		packets.push({
			trackNumber,
			timestampMs: packet.timestamp * 1000,
			isKeyframe: packet.type === "key",
			// The bytes are copied, not referenced: the input is disposed before
			// the muxer runs.
			data: Uint8Array.from(packet.data),
			...(packet.duration > 0 ? { durationMs: packet.duration * 1000 } : {}),
		});
	}
}

/**
 * The codec's own initialisation data, as Matroska CodecPrivate.
 *
 * FLAC keeps its STREAMINFO here, AVC its SPS/PPS, AAC its AudioSpecificConfig.
 * A file remuxed without it opens and lists its tracks, then fails to decode —
 * which is a worse failure than not opening at all.
 */
async function decoderDescription(track: {
	getDecoderConfig: () => Promise<{ description?: AllowSharedBufferSource } | null>;
}): Promise<Uint8Array | null> {
	try {
		const config = await track.getDecoderConfig();
		const description = config?.description;
		if (description === undefined || description === null) return null;

		const view = ArrayBuffer.isView(description)
			? new Uint8Array(
					description.buffer as ArrayBuffer,
					description.byteOffset,
					description.byteLength,
				)
			: new Uint8Array(description as ArrayBuffer);
		// Copied: the source input is disposed before the muxer runs.
		return Uint8Array.from(view);
	} catch {
		return null;
	}
}

/** Mediabunny codec names to Matroska CodecIDs. */
export function matroskaVideoCodecId(codec: string | null): string | null {
	switch (codec) {
		case "avc":
			return "V_MPEG4/ISO/AVC";
		case "hevc":
			return "V_MPEGH/ISO/HEVC";
		case "vp8":
			return "V_VP8";
		case "vp9":
			return "V_VP9";
		case "av1":
			return "V_AV1";
		default:
			return null;
	}
}

export function matroskaAudioCodecId(codec: string | null): string | null {
	switch (codec) {
		case "aac":
			return "A_AAC";
		case "opus":
			return "A_OPUS";
		case "vorbis":
			return "A_VORBIS";
		case "mp3":
			return "A_MPEG/L3";
		case "flac":
			return "A_FLAC";
		case "ac3":
			return "A_AC3";
		case "eac3":
			return "A_EAC3";
		case "dts":
			return "A_DTS";
		case "pcm-s16":
			return "A_PCM/INT/LIT";
		case "pcm-s24":
			return "A_PCM/INT/LIT";
		case "pcm-f32":
			return "A_PCM/FLOAT/IEEE";
		default:
			return null;
	}
}
