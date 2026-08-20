import { EBML_IDS, writeFloat64, writeId, writeUint, writeVint } from "./ebml.ts";

/**
 * Matroska writer.
 *
 * Video and audio pass through **untouched**, byte for byte, taken from
 * Mediabunny's `EncodedPacketSink`. That is the whole point: adding a subtitle
 * track to a film re-encodes nothing and degrades nothing.
 *
 * The writer knows nothing about subtitle formats. To it, a cue and a PGS
 * display set are both timestamped bytes — which is what keeps `core/subtitles`
 * intact the day this module is deleted (ADR 004e).
 */

export type MuxTrackKind = "video" | "audio" | "subtitle";

export type MuxTrack = {
	readonly number: number;
	readonly kind: MuxTrackKind;
	readonly codecId: string;
	readonly codecPrivate?: Uint8Array | undefined;
	readonly language?: string | undefined;
	readonly name?: string | undefined;
	readonly isDefault?: boolean | undefined;
	readonly isForced?: boolean | undefined;
	/** Video only. */
	readonly width?: number | undefined;
	readonly height?: number | undefined;
	/** Audio only. */
	readonly sampleRate?: number | undefined;
	readonly channels?: number | undefined;
};

export type MuxPacket = {
	readonly trackNumber: number;
	readonly timestampMs: number;
	readonly durationMs?: number | undefined;
	readonly isKeyframe: boolean;
	readonly data: Uint8Array;
};

export type MuxSpec = {
	readonly tracks: readonly MuxTrack[];
	readonly packets: readonly MuxPacket[];
	readonly durationMs: number;
	readonly writingApp?: string;
};

const TIMESTAMP_SCALE_NS = 1_000_000;
/** Clusters are capped so seeking stays cheap; 5 s is the usual choice. */
const CLUSTER_DURATION_MS = 5000;

const IDS = {
	...EBML_IDS,
	EBMLHeader: 0x1a_45_df_a3,
	EBMLVersion: 0x42_86,
	EBMLReadVersion: 0x42_f7,
	EBMLMaxIDLength: 0x42_f2,
	EBMLMaxSizeLength: 0x42_f3,
	DocType: 0x42_82,
	DocTypeVersion: 0x42_87,
	DocTypeReadVersion: 0x42_85,
	MuxingApp: 0x4d_80,
	WritingApp: 0x57_41,
	Video: 0xe0,
	PixelWidth: 0xb0,
	PixelHeight: 0xba,
	Audio: 0xe1,
	SamplingFrequency: 0xb5,
	Channels: 0x9f,
	CodecDelay: 0x56_aa,
	SeekPreRoll: 0x56_bb,
} as const;

const TRACK_TYPES: Record<MuxTrackKind, number> = { video: 1, audio: 2, subtitle: 0x11 };

/** Builds a complete `.mkv`. */
export function muxMatroska(spec: MuxSpec): Uint8Array {
	const header = element(IDS.EBMLHeader, [
		element(IDS.EBMLVersion, writeUint(1)),
		element(IDS.EBMLReadVersion, writeUint(1)),
		element(IDS.EBMLMaxIDLength, writeUint(4)),
		element(IDS.EBMLMaxSizeLength, writeUint(8)),
		element(IDS.DocType, encodeText("matroska")),
		element(IDS.DocTypeVersion, writeUint(4)),
		element(IDS.DocTypeReadVersion, writeUint(2)),
	]);

	const info = element(IDS.Info, [
		element(IDS.TimestampScale, writeUint(TIMESTAMP_SCALE_NS)),
		element(IDS.Duration, writeFloat64(spec.durationMs)),
		element(IDS.MuxingApp, encodeText("Vixely")),
		element(IDS.WritingApp, encodeText(spec.writingApp ?? "Vixely")),
	]);

	const tracks = element(
		IDS.Tracks,
		spec.tracks.map((track) => trackEntry(track)),
	);

	const clusters = buildClusters(spec.packets);
	const segment = element(IDS.Segment, [info, tracks, ...clusters]);

	return concat([header, segment]);
}

function trackEntry(track: MuxTrack): Uint8Array {
	const parts: Uint8Array[] = [
		element(IDS.TrackNumber, writeUint(track.number)),
		// TrackUID is required; the number is unique within a file and serves.
		element(0x73_c5, writeUint(track.number)),
		element(IDS.TrackType, writeUint(TRACK_TYPES[track.kind])),
		element(IDS.CodecID, encodeText(track.codecId)),
		element(IDS.FlagDefault, writeUint(track.isDefault === false ? 0 : 1)),
		element(IDS.FlagForced, writeUint(track.isForced === true ? 1 : 0)),
	];

	if (track.codecPrivate !== undefined && track.codecPrivate.length > 0) {
		// Where an ASS track keeps its entire script header.
		parts.push(element(IDS.CodecPrivate, track.codecPrivate));
	}
	if (track.language !== undefined) {
		parts.push(element(IDS.Language, encodeText(track.language)));
	}
	if (track.name !== undefined) {
		parts.push(element(IDS.Name, encodeText(track.name)));
	}

	if (track.kind === "video" && track.width !== undefined && track.height !== undefined) {
		parts.push(
			element(IDS.Video, [
				element(IDS.PixelWidth, writeUint(track.width)),
				element(IDS.PixelHeight, writeUint(track.height)),
			]),
		);
	}

	if (track.kind === "audio" && track.sampleRate !== undefined) {
		parts.push(
			element(IDS.Audio, [
				element(IDS.SamplingFrequency, writeFloat64(track.sampleRate)),
				element(IDS.Channels, writeUint(track.channels ?? 2)),
			]),
		);
	}

	return element(IDS.TrackEntry, parts);
}

/**
 * Groups packets into clusters.
 *
 * A cluster starts on a video keyframe where there is one, because a cluster
 * that begins mid-GOP makes seeking to it produce garbage.
 */
function buildClusters(packets: readonly MuxPacket[]): Uint8Array[] {
	if (packets.length === 0) return [];

	const ordered = packets.toSorted((a, b) => a.timestampMs - b.timestampMs);
	const clusters: Uint8Array[] = [];

	let current: MuxPacket[] = [];
	let clusterStart = ordered[0]?.timestampMs ?? 0;

	const flush = () => {
		if (current.length === 0) return;
		clusters.push(buildCluster(clusterStart, current));
		current = [];
	};

	for (const packet of ordered) {
		const wouldOverflow = packet.timestampMs - clusterStart >= CLUSTER_DURATION_MS;
		if (wouldOverflow && packet.isKeyframe && current.length > 0) {
			flush();
			clusterStart = packet.timestampMs;
		}
		current.push(packet);
	}

	flush();
	return clusters;
}

function buildCluster(startMs: number, packets: readonly MuxPacket[]): Uint8Array {
	const parts: Uint8Array[] = [element(IDS.Timestamp, writeUint(Math.round(startMs)))];

	for (const packet of packets) {
		const relative = Math.round(packet.timestampMs - startMs);
		const body = concat([
			writeVint(packet.trackNumber),
			int16(relative),
			// Flags: bit 7 marks a keyframe on a SimpleBlock.
			Uint8Array.from([packet.isKeyframe ? 0x80 : 0x00]),
			packet.data,
		]);

		if (packet.durationMs === undefined) {
			parts.push(element(IDS.SimpleBlock, body));
		} else {
			// A subtitle needs an explicit duration, which SimpleBlock cannot
			// carry, so it goes inside a BlockGroup.
			const blockBody = concat([
				writeVint(packet.trackNumber),
				int16(relative),
				Uint8Array.from([0x00]),
				packet.data,
			]);
			parts.push(
				element(IDS.BlockGroup, [
					element(IDS.Block, blockBody),
					element(IDS.BlockDuration, writeUint(Math.max(1, Math.round(packet.durationMs)))),
				]),
			);
		}
	}

	return element(IDS.Cluster, parts);
}

function element(id: number, content: Uint8Array | readonly Uint8Array[]): Uint8Array {
	const body = Array.isArray(content) ? concat(content) : (content as Uint8Array);
	return concat([writeId(id), writeVint(body.length), body]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const output = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function encodeText(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function int16(value: number): Uint8Array {
	const bytes = new Uint8Array(2);
	new DataView(bytes.buffer).setInt16(0, value);
	return bytes;
}

export { TIMESTAMP_SCALE_NS, CLUSTER_DURATION_MS };
