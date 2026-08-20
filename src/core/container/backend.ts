import type { SubtitleFormat } from "../document/types.ts";
import { isMatroska, readSubtitleTracks, subtitleFormatOf } from "./matroska-reader.ts";
import { muxMatroska, type MuxPacket, type MuxTrack } from "./matroska-muxer.ts";

/**
 * The one interface the rest of the application may use (ADR 004e).
 *
 * Two implementations are planned from the start: `MatroskaBackend` today, a
 * Mediabunny-backed one the day it reads subtitle tracks. The conformance suite
 * is written against this interface, so it will validate the replacement
 * unchanged — which is what makes the swap a change of factory rather than a
 * rewrite.
 *
 * Watch for `getSubtitleTracks`, an `InputSubtitleTrack`, `SUBTITLE_CODECS`
 * growing past `["webvtt"]`, or an `EncodedSubtitlePacketSource`. The first
 * alone is reason to re-evaluate.
 */

export type SubtitleTrackInfo = {
	readonly id: number;
	readonly codecId: string;
	readonly format: SubtitleFormat | null;
	readonly language: string | null;
	readonly name: string | null;
	readonly isDefault: boolean;
	readonly isForced: boolean;
};

export type RawSubtitleEntry = {
	readonly timestampMs: number;
	readonly durationMs: number | null;
	readonly payload: Uint8Array;
};

export type RawSubtitlePayload = {
	readonly track: SubtitleTrackInfo;
	/** ASS keeps its script header here; empty for the other formats. */
	readonly header: Uint8Array | null;
	readonly entries: readonly RawSubtitleEntry[];
};

export type ContainerWriteSpec = {
	readonly tracks: readonly MuxTrack[];
	readonly packets: readonly MuxPacket[];
	readonly durationMs: number;
};

export type ContainerBackend = {
	readonly name: string;
	/** True when this backend can read the given bytes at all. */
	canRead: (bytes: Uint8Array) => boolean;
	readSubtitleTracks: (bytes: Uint8Array) => Promise<readonly SubtitleTrackInfo[]>;
	readSubtitlePayload: (bytes: Uint8Array, trackId: number) => Promise<RawSubtitlePayload>;
	write: (spec: ContainerWriteSpec) => Promise<Blob>;
};

export class MatroskaBackend implements ContainerBackend {
	readonly name = "matroska";

	canRead(bytes: Uint8Array): boolean {
		return isMatroska(bytes);
	}

	async readSubtitleTracks(bytes: Uint8Array): Promise<readonly SubtitleTrackInfo[]> {
		return readSubtitleTracks(bytes).tracks.map((track) => ({
			id: track.trackNumber,
			codecId: track.codecId,
			format: subtitleFormatOf(track.codecId),
			language: track.language,
			name: track.name,
			isDefault: track.isDefault,
			isForced: track.isForced,
		}));
	}

	async readSubtitlePayload(bytes: Uint8Array, trackId: number): Promise<RawSubtitlePayload> {
		const parsed = readSubtitleTracks(bytes);
		const raw = parsed.tracks.find((track) => track.trackNumber === trackId);
		if (raw === undefined) throw new Error(`no subtitle track ${trackId} in this file`);

		return {
			track: {
				id: raw.trackNumber,
				codecId: raw.codecId,
				format: subtitleFormatOf(raw.codecId),
				language: raw.language,
				name: raw.name,
				isDefault: raw.isDefault,
				isForced: raw.isForced,
			},
			header: raw.codecPrivate,
			entries: parsed.blocks
				.filter((block) => block.trackNumber === trackId)
				.map((block) => ({
					timestampMs: block.timestampMs,
					durationMs: block.durationMs,
					payload: block.payload,
				})),
		};
	}

	async write(spec: ContainerWriteSpec): Promise<Blob> {
		const bytes = muxMatroska(spec);
		return new Blob([bytes as BlobPart], { type: "video/x-matroska" });
	}
}

/**
 * Chooses a backend.
 *
 * The day Mediabunny reads subtitle tracks, this returns a different one and
 * the rest of the application does not notice.
 */
export function createContainerBackend(): ContainerBackend {
	return new MatroskaBackend();
}
