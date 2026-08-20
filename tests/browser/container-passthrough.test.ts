import { beforeAll, describe, expect, it } from "vitest";
import { createContainerBackend } from "~/core/container";
import {
	decodeAudioTrack,
	encodeAudioBuffer,
	extractPassthroughTracks,
	openMedia,
} from "~/core/media";
import { codecIdFor, parseSrt, serialiseSrt } from "~/core/subtitles";

/**
 * The check the unit tests cannot make.
 *
 * `tests/unit/container.test.ts` validates our writer against our own reader,
 * which cannot catch a shared misreading of Matroska. Here the file is written
 * by us and read by Mediabunny — an independent demuxer — and the audio packets
 * are compared byte for byte before and after, which is the no-re-encode
 * guarantee stated as a measurement rather than an intention.
 */

async function loadFixture(name: string): Promise<File> {
	const response = await fetch(`/tests/fixtures/audio/${name}`);
	if (!response.ok) throw new Error(`fixture ${name} not served: ${response.status}`);
	return new File([await response.blob()], name, { type: "audio/wav" });
}

/** A real encoded track, since a WAV alone carries nothing Matroska accepts. */
async function makeFlacFile(): Promise<File> {
	const wav = await loadFixture("stereo-44k.wav");
	const opened = await openMedia(wav, wav.name);
	try {
		const decoded = await decodeAudioTrack(opened);
		const result = await encodeAudioBuffer({
			buffer: decoded.buffer,
			container: "mkv",
			codec: "flac",
			quality: 0.8,
			destination: { kind: "buffer" },
		});
		if (result.blob === null) throw new Error("no output");
		return new File([result.blob], "source.mkv", { type: "video/x-matroska" });
	} finally {
		opened.dispose();
	}
}

let source: File;

beforeAll(async () => {
	source = await makeFlacFile();
}, 30_000);

describe("passthrough muxing", () => {
	it("extracts encoded packets without decoding them", async () => {
		const opened = await openMedia(source, source.name);
		try {
			const extracted = await extractPassthroughTracks(opened);
			expect(extracted.tracks).toHaveLength(1);
			expect(extracted.tracks[0]?.kind).toBe("audio");
			expect(extracted.tracks[0]?.codecId).toBe("A_FLAC");
			expect(extracted.packets.length).toBeGreaterThan(0);
		} finally {
			opened.dispose();
		}
	});

	it("writes a file Mediabunny reads back with the same track", async () => {
		const opened = await openMedia(source, source.name);
		const extracted = await extractPassthroughTracks(opened);
		opened.dispose();

		const backend = createContainerBackend();
		const written = await backend.write({
			tracks: extracted.tracks,
			packets: extracted.packets,
			durationMs: extracted.durationMs,
		});

		// Read by an independent demuxer, not by our own reader.
		const reopened = await openMedia(written, "remuxed.mkv");
		try {
			expect(reopened.probe.format.toLowerCase()).toContain("matroska");
			expect(reopened.probe.audioTracks).toHaveLength(1);
			expect(reopened.probe.audioTracks[0]?.codec).toBe("flac");
			expect(reopened.probe.audioTracks[0]?.channels).toBe(2);
			expect(reopened.probe.audioTracks[0]?.sampleRate).toBe(44_100);
		} finally {
			reopened.dispose();
		}
	});

	it("passes the audio packets through byte for byte", async () => {
		const opened = await openMedia(source, source.name);
		const extracted = await extractPassthroughTracks(opened);
		opened.dispose();

		const written = await createContainerBackend().write({
			tracks: extracted.tracks,
			packets: extracted.packets,
			durationMs: extracted.durationMs,
		});

		const reopened = await openMedia(written, "remuxed.mkv");
		try {
			const roundTripped = await extractPassthroughTracks(reopened);
			expect(roundTripped.packets.length).toBe(extracted.packets.length);

			// The whole no-re-encode claim, measured: every payload identical.
			for (const [index, packet] of extracted.packets.entries()) {
				expect([...(roundTripped.packets[index]?.data ?? [])]).toEqual([...packet.data]);
			}
		} finally {
			reopened.dispose();
		}
	});

	it("keeps the timings across the round trip", async () => {
		const opened = await openMedia(source, source.name);
		const extracted = await extractPassthroughTracks(opened);
		opened.dispose();

		const written = await createContainerBackend().write({
			tracks: extracted.tracks,
			packets: extracted.packets,
			durationMs: extracted.durationMs,
		});

		const reopened = await openMedia(written, "remuxed.mkv");
		try {
			const roundTripped = await extractPassthroughTracks(reopened);
			for (const [index, packet] of extracted.packets.entries()) {
				// A millisecond of slack: Matroska stores timestamps in ticks.
				expect(
					Math.abs((roundTripped.packets[index]?.timestampMs ?? 0) - packet.timestampMs),
				).toBeLessThanOrEqual(1);
			}
		} finally {
			reopened.dispose();
		}
	});

	it("adds a subtitle track without touching the audio", async () => {
		const opened = await openMedia(source, source.name);
		const extracted = await extractPassthroughTracks(opened);
		opened.dispose();

		const track = parseSrt(
			"1\n00:00:00,200 --> 00:00:00,600\nFirst cue.\n\n2\n00:00:00,700 --> 00:00:00,950\nSecond cue.\n",
		);
		const subtitleNumber = extracted.tracks.length + 1;

		const backend = createContainerBackend();
		const written = await backend.write({
			tracks: [
				...extracted.tracks,
				{
					number: subtitleNumber,
					kind: "subtitle",
					codecId: codecIdFor("srt"),
					language: "eng",
					name: "English",
				},
			],
			packets: [
				...extracted.packets,
				...track.cues.map((cue) => ({
					trackNumber: subtitleNumber,
					timestampMs: cue.startMs,
					durationMs: cue.endMs - cue.startMs,
					isKeyframe: true,
					data: new TextEncoder().encode(cue.text),
				})),
			],
			durationMs: extracted.durationMs,
		});

		// Mediabunny still sees the audio track, unchanged...
		const reopened = await openMedia(written, "subtitled.mkv");
		try {
			expect(reopened.probe.audioTracks).toHaveLength(1);
			const roundTripped = await extractPassthroughTracks(reopened);
			for (const [index, packet] of extracted.packets.entries()) {
				expect([...(roundTripped.packets[index]?.data ?? [])]).toEqual([...packet.data]);
			}
		} finally {
			reopened.dispose();
		}

		// ...and our backend reads the subtitle track Mediabunny cannot see.
		const bytes = new Uint8Array(await written.arrayBuffer());
		const subtitleTracks = await backend.readSubtitleTracks(bytes);
		expect(subtitleTracks).toHaveLength(1);
		expect(subtitleTracks[0]?.format).toBe("srt");
		expect(subtitleTracks[0]?.language).toBe("eng");

		const payload = await backend.readSubtitlePayload(bytes, subtitleNumber);
		expect(payload.entries).toHaveLength(2);
		expect(new TextDecoder().decode(payload.entries[0]?.payload)).toBe("First cue.");

		// And the cues survive back into a subtitle file.
		const restored = serialiseSrt({
			cues: payload.entries.map((entry, index) => ({
				id: `restored-${index}`,
				startMs: entry.timestampMs,
				endMs: entry.timestampMs + (entry.durationMs ?? 0),
				text: new TextDecoder().decode(entry.payload),
				styleName: null,
				layer: 0,
				marginLeft: null,
				marginRight: null,
				marginVertical: null,
				effect: null,
			})),
		});
		expect(parseSrt(restored).cues).toHaveLength(2);
		expect(parseSrt(restored).cues[0]?.startMs).toBe(200);
	});

	it("confirms Mediabunny still reports no subtitle track of its own", async () => {
		// Recorded deliberately: the day this fails, core/container can start
		// being removed (ADR 004e).
		const opened = await openMedia(source, source.name);
		try {
			expect(opened.probe.subtitleTracks).toEqual([]);
			expect("getSubtitleTracks" in opened.input).toBe(false);
		} finally {
			opened.dispose();
		}
	});
});
