import { describe, expect, it } from "vitest";
import {
	createContainerBackend,
	MatroskaBackend,
	type ContainerBackend,
	type MuxPacket,
	type MuxTrack,
} from "~/core/container";
import { serialiseAss, parseAss } from "~/core/subtitles";

/**
 * Conformance suite for `ContainerBackend`.
 *
 * Written against the interface, never against the Matroska implementation, so
 * the day Mediabunny reads subtitle tracks this same file validates the
 * replacement backend. If these pass on both, the swap is safe — that is the
 * entire safety net for the removal ADR 004e plans for.
 */

const VIDEO_TRACK: MuxTrack = {
	number: 1,
	kind: "video",
	codecId: "V_MPEG4/ISO/AVC",
	width: 1920,
	height: 1080,
	language: "und",
};

const AUDIO_TRACK: MuxTrack = {
	number: 2,
	kind: "audio",
	codecId: "A_AAC",
	sampleRate: 48_000,
	channels: 2,
	language: "eng",
};

const SUBTITLE_TRACK: MuxTrack = {
	number: 3,
	kind: "subtitle",
	codecId: "S_TEXT/UTF8",
	language: "fre",
	name: "Français",
	isDefault: false,
	isForced: false,
};

/** Recognisable payloads, so a byte-for-byte comparison means something. */
function videoPacket(index: number): MuxPacket {
	return {
		trackNumber: 1,
		timestampMs: index * 40,
		isKeyframe: index % 25 === 0,
		data: Uint8Array.from({ length: 64 }, (_, offset) => (index * 7 + offset) % 256),
	};
}

function audioPacket(index: number): MuxPacket {
	return {
		trackNumber: 2,
		timestampMs: index * 21,
		isKeyframe: true,
		data: Uint8Array.from({ length: 32 }, (_, offset) => (index * 13 + offset) % 256),
	};
}

function subtitlePacket(index: number, text: string): MuxPacket {
	return {
		trackNumber: 3,
		timestampMs: 1000 + index * 3000,
		durationMs: 2500,
		isKeyframe: true,
		data: new TextEncoder().encode(text),
	};
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

function runConformance(name: string, create: () => ContainerBackend): void {
	describe(`${name} — ContainerBackend conformance`, () => {
		it("recognises what it can read, and what it cannot", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [SUBTITLE_TRACK],
				packets: [subtitlePacket(0, "Bonjour")],
				durationMs: 4000,
			});

			expect(backend.canRead(await bytesOf(written))).toBe(true);
			expect(backend.canRead(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(false);
		});

		it("writes a file it can read its own tracks back from", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [VIDEO_TRACK, AUDIO_TRACK, SUBTITLE_TRACK],
				packets: [videoPacket(0), audioPacket(0), subtitlePacket(0, "Bonjour")],
				durationMs: 5000,
			});

			const tracks = await backend.readSubtitleTracks(await bytesOf(written));
			// Only the subtitle track: video and audio are somebody else's concern.
			expect(tracks).toHaveLength(1);
			expect(tracks[0]).toMatchObject({
				id: 3,
				codecId: "S_TEXT/UTF8",
				format: "srt",
				language: "fre",
				name: "Français",
				isDefault: false,
			});
		});

		it("reads several subtitle tracks and tells them apart", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [
					SUBTITLE_TRACK,
					{
						number: 4,
						kind: "subtitle",
						codecId: "S_TEXT/ASS",
						language: "jpn",
						name: "日本語",
						isForced: true,
					},
					{ number: 5, kind: "subtitle", codecId: "S_HDMV/PGS", language: "eng" },
				],
				packets: [subtitlePacket(0, "un")],
				durationMs: 4000,
			});

			const tracks = await backend.readSubtitleTracks(await bytesOf(written));
			expect(tracks.map((track) => track.format)).toEqual(["srt", "ass", "pgs"]);
			expect(tracks[1]?.isForced).toBe(true);
			expect(tracks[1]?.name).toBe("日本語");
		});

		it("returns the payload of one track, with its timings", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [SUBTITLE_TRACK],
				packets: [
					subtitlePacket(0, "First"),
					subtitlePacket(1, "Second"),
					subtitlePacket(2, "Third"),
				],
				durationMs: 12_000,
			});

			const payload = await backend.readSubtitlePayload(await bytesOf(written), 3);
			expect(payload.entries).toHaveLength(3);
			expect(payload.entries.map((entry) => entry.timestampMs)).toEqual([1000, 4000, 7000]);
			expect(payload.entries.every((entry) => entry.durationMs === 2500)).toBe(true);
			expect(new TextDecoder().decode(payload.entries[1]?.payload)).toBe("Second");
		});

		it("carries an ASS header through CodecPrivate untouched", async () => {
			const backend = create();
			const header = serialiseAss({
				format: "ass",
				cues: [],
				styles: [],
				scriptInfo: { PlayResX: "1920", PlayResY: "1080", Title: "Conformance" },
				rawHeader: null,
			});

			const written = await backend.write({
				tracks: [
					{
						number: 3,
						kind: "subtitle",
						codecId: "S_TEXT/ASS",
						codecPrivate: new TextEncoder().encode(header),
					},
				],
				packets: [subtitlePacket(0, "0,0,Default,,0,0,0,,Dialogue text")],
				durationMs: 4000,
			});

			const payload = await backend.readSubtitlePayload(await bytesOf(written), 3);
			expect(payload.header).not.toBeNull();

			// The header must survive well enough to be parsed again, which is
			// what makes the styles usable after a round trip.
			const restored = parseAss(new TextDecoder().decode(payload.header!));
			expect(restored.scriptInfo["PlayResX"]).toBe("1920");
			expect(restored.scriptInfo["Title"]).toBe("Conformance");
		});

		it("carries binary PGS payloads without corrupting them", async () => {
			const backend = create();
			// Every byte value, including the ones that look like EBML markers.
			const payload = Uint8Array.from({ length: 256 }, (_, index) => index);

			const written = await backend.write({
				tracks: [{ number: 3, kind: "subtitle", codecId: "S_HDMV/PGS" }],
				packets: [
					{
						trackNumber: 3,
						timestampMs: 500,
						durationMs: 2000,
						isKeyframe: true,
						data: payload,
					},
				],
				durationMs: 3000,
			});

			const read = await backend.readSubtitlePayload(await bytesOf(written), 3);
			expect([...(read.entries[0]?.payload ?? [])]).toEqual([...payload]);
		});

		it("passes video and audio through byte for byte", async () => {
			const backend = create();
			const video = Array.from({ length: 50 }, (_, index) => videoPacket(index));
			const audio = Array.from({ length: 90 }, (_, index) => audioPacket(index));

			const written = await backend.write({
				tracks: [VIDEO_TRACK, AUDIO_TRACK, SUBTITLE_TRACK],
				packets: [...video, ...audio, subtitlePacket(0, "Subtitle")],
				durationMs: 2000,
			});

			const bytes = await bytesOf(written);
			// Each original payload must appear intact in the output: this is the
			// no-re-encode guarantee, checked rather than assumed.
			for (const packet of [...video.slice(0, 5), ...audio.slice(0, 5)]) {
				expect(indexOfSequence(bytes, packet.data)).toBeGreaterThan(0);
			}
		});

		it("reports nothing for a file with no subtitle track", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [VIDEO_TRACK, AUDIO_TRACK],
				packets: [videoPacket(0), audioPacket(0)],
				durationMs: 1000,
			});

			expect(await backend.readSubtitleTracks(await bytesOf(written))).toEqual([]);
		});

		it("refuses to read a track that is not there", async () => {
			const backend = create();
			const written = await backend.write({
				tracks: [SUBTITLE_TRACK],
				packets: [subtitlePacket(0, "text")],
				durationMs: 4000,
			});

			await expect(backend.readSubtitlePayload(await bytesOf(written), 99)).rejects.toThrow(
				/no subtitle track/,
			);
		});

		it("spreads a long file across clusters and still reads it back", async () => {
			const backend = create();
			// 30 seconds at 25 fps: several clusters at a 5 s cap.
			const video = Array.from({ length: 750 }, (_, index) => videoPacket(index));
			const subtitles = Array.from({ length: 10 }, (_, index) =>
				subtitlePacket(index, `Cue ${index}`),
			);

			const written = await backend.write({
				tracks: [VIDEO_TRACK, SUBTITLE_TRACK],
				packets: [...video, ...subtitles],
				durationMs: 30_000,
			});

			const payload = await backend.readSubtitlePayload(await bytesOf(written), 3);
			expect(payload.entries).toHaveLength(10);
			expect(new TextDecoder().decode(payload.entries[9]?.payload)).toBe("Cue 9");
			// Timings must survive the cluster split, which is where a relative
			// timestamp bug would show up.
			expect(payload.entries.map((entry) => entry.timestampMs)).toEqual(
				subtitles.map((packet) => packet.timestampMs),
			);
		});

		it("handles an empty file without inventing tracks", async () => {
			const backend = create();
			const written = await backend.write({ tracks: [], packets: [], durationMs: 0 });
			expect(await backend.readSubtitleTracks(await bytesOf(written))).toEqual([]);
		});
	});
}

/** Finds a byte sequence, which is how the passthrough check is made. */
function indexOfSequence(haystack: Uint8Array, needle: Uint8Array): number {
	outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
		for (let offset = 0; offset < needle.length; offset++) {
			if (haystack[start + offset] !== needle[offset]) continue outer;
		}
		return start;
	}
	return -1;
}

runConformance("MatroskaBackend", () => new MatroskaBackend());

describe("backend selection", () => {
	it("returns the Matroska backend today", () => {
		expect(createContainerBackend().name).toBe("matroska");
	});
});
