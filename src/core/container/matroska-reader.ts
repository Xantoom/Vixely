import type { SubtitleFormat } from "../document/types.ts";
import { EBML_IDS, EbmlReader, TRACK_TYPE_SUBTITLE } from "./ebml.ts";

/**
 * Reads subtitle tracks out of a Matroska file.
 *
 * This exists because Mediabunny reads none: `SUBTITLE_CODECS` is `["webvtt"]`,
 * there is no `getSubtitleTracks`, and its Matroska demuxer branches only on
 * video and audio. It deliberately ignores everything else in the file.
 */

export type RawSubtitleTrack = {
	readonly trackNumber: number;
	readonly codecId: string;
	/** ASS keeps its whole `[Script Info]` and `[V4+ Styles]` header here. */
	readonly codecPrivate: Uint8Array | null;
	readonly language: string | null;
	readonly name: string | null;
	readonly isDefault: boolean;
	readonly isForced: boolean;
};

export type RawSubtitleBlock = {
	readonly trackNumber: number;
	readonly timestampMs: number;
	readonly durationMs: number | null;
	readonly payload: Uint8Array;
};

export type MatroskaSubtitles = {
	readonly tracks: readonly RawSubtitleTrack[];
	readonly blocks: readonly RawSubtitleBlock[];
	readonly timestampScaleNs: number;
	readonly durationMs: number | null;
};

const DEFAULT_TIMESTAMP_SCALE_NS = 1_000_000;

export function isMatroska(bytes: Uint8Array): boolean {
	// EBML header magic.
	return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function readSubtitleTracks(bytes: Uint8Array): MatroskaSubtitles {
	const reader = new EbmlReader(bytes);
	const tracks: RawSubtitleTrack[] = [];
	const blocks: RawSubtitleBlock[] = [];
	let timestampScaleNs = DEFAULT_TIMESTAMP_SCALE_NS;
	let durationMs: number | null = null;

	const segment = findSegment(reader);
	if (segment === null) return { tracks, blocks, timestampScaleNs, durationMs };

	const subtitleTrackNumbers = new Set<number>();

	for (const child of reader.children(segment.contentOffset, segment.size)) {
		if (child.id === EBML_IDS.Info) {
			for (const info of reader.children(child.contentOffset, child.size)) {
				if (info.id === EBML_IDS.TimestampScale) {
					timestampScaleNs = reader.readUint(info.contentOffset, info.size);
				} else if (info.id === EBML_IDS.Duration) {
					durationMs = (reader.readFloat(info.contentOffset, info.size) * timestampScaleNs) / 1e6;
				}
			}
			continue;
		}

		if (child.id === EBML_IDS.Tracks) {
			for (const entry of reader.children(child.contentOffset, child.size)) {
				if (entry.id !== EBML_IDS.TrackEntry) continue;
				const track = readTrackEntry(reader, entry.contentOffset, entry.size);
				if (track !== null) {
					tracks.push(track);
					subtitleTrackNumbers.add(track.trackNumber);
				}
			}
			continue;
		}

		if (child.id === EBML_IDS.Cluster) {
			readCluster(reader, child, subtitleTrackNumbers, timestampScaleNs, blocks);
		}
	}

	return { tracks, blocks, timestampScaleNs, durationMs };
}

function findSegment(reader: EbmlReader) {
	let offset = 0;
	while (offset < reader.length) {
		const element = reader.readElement(offset);
		if (element.id === EBML_IDS.Segment) return element;
		const size = Number.isFinite(element.size) ? element.size : reader.length;
		offset = element.contentOffset + size;
	}
	return null;
}

function readTrackEntry(
	reader: EbmlReader,
	contentOffset: number,
	size: number,
): RawSubtitleTrack | null {
	let trackNumber = 0;
	let trackType = 0;
	let codecId = "";
	let codecPrivate: Uint8Array | null = null;
	let language: string | null = null;
	let name: string | null = null;
	let isDefault = true;
	let isForced = false;

	for (const field of reader.children(contentOffset, size)) {
		switch (field.id) {
			case EBML_IDS.TrackNumber:
				trackNumber = reader.readUint(field.contentOffset, field.size);
				break;
			case EBML_IDS.TrackType:
				trackType = reader.readUint(field.contentOffset, field.size);
				break;
			case EBML_IDS.CodecID:
				codecId = reader.readString(field.contentOffset, field.size).replace(/\0+$/u, "");
				break;
			case EBML_IDS.CodecPrivate:
				// Copied out of the file buffer: the caller keeps it after the
				// source bytes are released.
				codecPrivate = Uint8Array.from(reader.readBytes(field.contentOffset, field.size));
				break;
			case EBML_IDS.Language:
			case EBML_IDS.LanguageBCP47:
				language = reader.readString(field.contentOffset, field.size).replace(/\0+$/u, "");
				break;
			case EBML_IDS.Name:
				name = reader.readString(field.contentOffset, field.size);
				break;
			case EBML_IDS.FlagDefault:
				isDefault = reader.readUint(field.contentOffset, field.size) !== 0;
				break;
			case EBML_IDS.FlagForced:
				isForced = reader.readUint(field.contentOffset, field.size) !== 0;
				break;
			default:
				break;
		}
	}

	// Only subtitle tracks; video and audio are Mediabunny's business.
	if (trackType !== TRACK_TYPE_SUBTITLE) return null;

	return {
		trackNumber,
		codecId,
		codecPrivate,
		language: language === "und" || language === "" ? null : language,
		name,
		isDefault,
		isForced,
	};
}

function readCluster(
	reader: EbmlReader,
	cluster: { contentOffset: number; size: number },
	subtitleTracks: ReadonlySet<number>,
	timestampScaleNs: number,
	blocks: RawSubtitleBlock[],
): void {
	let clusterTimestamp = 0;

	for (const child of reader.children(cluster.contentOffset, cluster.size)) {
		if (child.id === EBML_IDS.Timestamp) {
			clusterTimestamp = reader.readUint(child.contentOffset, child.size);
			continue;
		}

		if (child.id === EBML_IDS.SimpleBlock) {
			const block = readBlock(reader, child.contentOffset, child.size, subtitleTracks);
			if (block !== null) {
				blocks.push(toBlock(block, clusterTimestamp, timestampScaleNs, null));
			}
			continue;
		}

		if (child.id === EBML_IDS.BlockGroup) {
			let pending: ReturnType<typeof readBlock> = null;
			let durationTicks: number | null = null;

			for (const groupChild of reader.children(child.contentOffset, child.size)) {
				if (groupChild.id === EBML_IDS.Block) {
					pending = readBlock(reader, groupChild.contentOffset, groupChild.size, subtitleTracks);
				} else if (groupChild.id === EBML_IDS.BlockDuration) {
					durationTicks = reader.readUint(groupChild.contentOffset, groupChild.size);
				}
			}

			if (pending !== null) {
				blocks.push(toBlock(pending, clusterTimestamp, timestampScaleNs, durationTicks));
			}
		}
	}
}

function readBlock(
	reader: EbmlReader,
	contentOffset: number,
	size: number,
	subtitleTracks: ReadonlySet<number>,
): { trackNumber: number; relativeTimestamp: number; payload: Uint8Array } | null {
	const { value: trackNumber, length } = reader.readSize(contentOffset);
	if (!subtitleTracks.has(trackNumber)) return null;

	const relativeTimestamp = reader.readInt(contentOffset + length, 2);
	// Track number, a signed 16-bit offset, then one flag byte.
	const headerSize = length + 3;

	return {
		trackNumber,
		relativeTimestamp,
		payload: Uint8Array.from(reader.readBytes(contentOffset + headerSize, size - headerSize)),
	};
}

function toBlock(
	block: { trackNumber: number; relativeTimestamp: number; payload: Uint8Array },
	clusterTimestamp: number,
	timestampScaleNs: number,
	durationTicks: number | null,
): RawSubtitleBlock {
	const scaleMs = timestampScaleNs / 1e6;
	return {
		trackNumber: block.trackNumber,
		timestampMs: (clusterTimestamp + block.relativeTimestamp) * scaleMs,
		durationMs: durationTicks === null ? null : durationTicks * scaleMs,
		payload: block.payload,
	};
}

/** Groups blocks by track, which is how the editor consumes them. */
export function blocksByTrack(
	subtitles: MatroskaSubtitles,
): ReadonlyMap<number, readonly RawSubtitleBlock[]> {
	const grouped = new Map<number, RawSubtitleBlock[]>();
	for (const block of subtitles.blocks) {
		const existing = grouped.get(block.trackNumber);
		if (existing === undefined) grouped.set(block.trackNumber, [block]);
		else existing.push(block);
	}
	for (const blocks of grouped.values()) blocks.sort((a, b) => a.timestampMs - b.timestampMs);
	return grouped;
}

export function subtitleFormatOf(codecId: string): SubtitleFormat | null {
	switch (codecId.toUpperCase()) {
		case "S_TEXT/UTF8":
		case "S_TEXT/ASCII":
			return "srt";
		case "S_TEXT/ASS":
		case "S_TEXT/SSA":
			return "ass";
		case "S_TEXT/WEBVTT":
			return "vtt";
		case "S_HDMV/PGS":
			return "pgs";
		default:
			return null;
	}
}
