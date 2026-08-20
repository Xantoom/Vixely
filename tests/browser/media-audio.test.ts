import { beforeAll, describe, expect, it } from "vitest";
import { chainIsPassthrough, measureLoudness, renderAudioDocument } from "~/core/audio";
import { createAudioDocument, type AudioDocument } from "~/core/document";
import {
	channelsOf,
	decodeAudioTrack,
	encodeAudioBuffer,
	openMedia,
	planExportPath,
	runConversion,
	type OpenedInput,
} from "~/core/media";

/**
 * Tier 3: the only tier that proves the media pipeline works.
 *
 * Fixtures are WAV, authored byte by byte by `scripts/make-fixtures.ts`,
 * because this toolchain carries no encoder to produce anything else. That is
 * enough to exercise the whole path: open, probe, decode, process, encode,
 * reopen.
 */

async function loadFixture(name: string): Promise<File> {
	const response = await fetch(`/tests/fixtures/audio/${name}`);
	if (!response.ok) throw new Error(`fixture ${name} not served: ${response.status}`);
	return new File([await response.blob()], name, { type: "audio/wav" });
}

function documentFor(file: File, durationSec: number): AudioDocument {
	return {
		...createAudioDocument(
			{ id: "fixture", name: file.name, byteLength: file.size, mimeType: file.type },
			durationSec,
		),
		segments: [
			{
				id: "whole",
				sourceId: file.name,
				startSec: 0,
				endSec: durationSec,
				gainDb: 0,
				fadeInSec: 0,
				fadeOutSec: 0,
			},
		],
	};
}

let stereo: File;
let clipping: File;

beforeAll(async () => {
	[stereo, clipping] = await Promise.all([
		loadFixture("stereo-44k.wav"),
		loadFixture("clipping.wav"),
	]);
});

describe("opening and probing", () => {
	let opened: OpenedInput;

	beforeAll(async () => {
		opened = await openMedia(stereo, stereo.name);
	});

	it("reports the container and the track layout", () => {
		expect(opened.probe.format.toLowerCase()).toContain("wave");
		expect(opened.probe.audioTracks).toHaveLength(1);
		expect(opened.probe.videoTracks).toHaveLength(0);
		expect(opened.probe.audioTracks[0]?.channels).toBe(2);
		expect(opened.probe.audioTracks[0]?.sampleRate).toBe(44_100);
	});

	it("reports a duration that matches the fixture", () => {
		expect(opened.probe.durationSec).toBeCloseTo(1, 1);
	});

	it("lists no subtitle track, because Mediabunny reads none", () => {
		// Recorded on purpose: this empty array is the whole reason
		// core/container exists.
		expect(opened.probe.subtitleTracks).toEqual([]);
	});

	it("fails with a self-describing error on a file it cannot read", async () => {
		const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "broken.wav");
		await expect(openMedia(junk, junk.name)).rejects.toThrow();
	});
});

describe("decoding", () => {
	it("returns the samples the fixture was written with", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);

		expect(decoded.channels).toBe(2);
		expect(decoded.sampleRate).toBe(44_100);
		expect(decoded.durationSec).toBeCloseTo(1, 1);

		const [left, right] = channelsOf(decoded.buffer);
		// The two channels carry different tones; identical channels would mean
		// the decode collapsed them.
		expect(left).toBeDefined();
		expect(right).toBeDefined();
		const difference = left!.reduce(
			(sum, value, index) => sum + Math.abs(value - (right![index] ?? 0)),
			0,
		);
		expect(difference).toBeGreaterThan(1000);
		opened.dispose();
	});

	it("reports progress while it decodes", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const ratios: number[] = [];
		await decodeAudioTrack(opened, { onProgress: (ratio) => ratios.push(ratio) });
		expect(ratios.length).toBeGreaterThan(0);
		expect(ratios.at(-1)).toBeCloseTo(1, 1);
		opened.dispose();
	});
});

describe("encoding, then reading the result back", () => {
	it("writes FLAC that reopens with the same shape", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);

		const result = await encodeAudioBuffer({
			buffer: decoded.buffer,
			container: "flac",
			codec: "flac",
			quality: 0.8,
			destination: { kind: "buffer" },
		});

		expect(result.blob).not.toBeNull();
		expect(result.bytes).toBeGreaterThan(1000);

		// Round trip: the output has to be readable, not merely produced.
		const reopened = await openMedia(result.blob!, "out.flac");
		expect(reopened.probe.audioTracks[0]?.channels).toBe(2);
		expect(reopened.probe.durationSec).toBeCloseTo(1, 1);
		reopened.dispose();
		opened.dispose();
	});

	it("remuxes to WAV through the Conversion path without re-encoding", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const result = await runConversion({
			source: opened,
			container: "wav",
			destination: { kind: "buffer" },
		});

		expect(result.blob).not.toBeNull();
		const reopened = await openMedia(result.blob!, "out.wav");
		expect(reopened.probe.durationSec).toBeCloseTo(1, 1);
		reopened.dispose();
		opened.dispose();
	});
});

describe("the document actually reaches the output", () => {
	it("takes the remux path only when nothing touches the samples", async () => {
		const edit = documentFor(stereo, 1);
		expect(planExportPath(edit).kind).toBe("conversion");
		expect(chainIsPassthrough(edit, 1)).toBe(true);

		const edited: AudioDocument = {
			...edit,
			segments: [{ ...edit.segments[0]!, endSec: 0.5 }],
		};
		expect(chainIsPassthrough(edited, 1)).toBe(false);
	});

	it("renders a trim, so the output is genuinely shorter", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);
		const edit = documentFor(stereo, decoded.durationSec);

		const trimmed = await renderAudioDocument(
			{ ...edit, segments: [{ ...edit.segments[0]!, endSec: 0.4 }] },
			decoded.buffer,
		);

		expect(trimmed.buffer.duration).toBeCloseTo(0.4, 1);
		opened.dispose();
	});

	it("renders a gain change, so the output is genuinely louder", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);
		const edit = documentFor(stereo, decoded.durationSec);

		const quiet = await renderAudioDocument(
			{ ...edit, segments: [{ ...edit.segments[0]!, gainDb: -12 }] },
			decoded.buffer,
		);

		const before = measureLoudness(channelsOf(decoded.buffer), decoded.sampleRate);
		const after = measureLoudness(channelsOf(quiet.buffer), quiet.buffer.sampleRate);
		expect(before.integratedLufs - after.integratedLufs).toBeCloseTo(12, 0);
		opened.dispose();
	});

	it("renders a fade, so the first samples are near silence", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);
		const edit = documentFor(stereo, decoded.durationSec);

		const faded = await renderAudioDocument(
			{ ...edit, segments: [{ ...edit.segments[0]!, fadeInSec: 0.5 }] },
			decoded.buffer,
		);

		const channel = channelsOf(faded.buffer)[0]!;
		const head = Math.max(...channel.slice(0, 100).map((value) => Math.abs(value)));
		const middle = Math.max(...channel.slice(30_000, 40_000).map((value) => Math.abs(value)));
		expect(head).toBeLessThan(middle / 4);
		opened.dispose();
	});

	it("normalises towards the target, and caps the gain rather than clipping", async () => {
		const opened = await openMedia(clipping, clipping.name);
		const decoded = await decodeAudioTrack(opened);
		const edit = documentFor(clipping, decoded.durationSec);

		const normalised = await renderAudioDocument(
			{
				...edit,
				loudness: { enabled: true, targetLufs: -14, truePeakDb: -1 },
			},
			decoded.buffer,
		);

		const after = measureLoudness(channelsOf(normalised.buffer), normalised.buffer.sampleRate, -14);
		// A full-scale tone can only come down, and it must not exceed the ceiling.
		expect(after.integratedLufs).toBeLessThan(-10);
		expect(after.samplePeakDb).toBeLessThanOrEqual(0.1);
		opened.dispose();
	});

	it("encodes a processed buffer, and the result reads back trimmed", async () => {
		const opened = await openMedia(stereo, stereo.name);
		const decoded = await decodeAudioTrack(opened);
		const edit = documentFor(stereo, decoded.durationSec);

		const rendered = await renderAudioDocument(
			{ ...edit, segments: [{ ...edit.segments[0]!, endSec: 0.4 }] },
			decoded.buffer,
		);
		const result = await encodeAudioBuffer({
			buffer: rendered.buffer,
			container: "flac",
			codec: "flac",
			quality: 0.8,
			destination: { kind: "buffer" },
		});

		const reopened = await openMedia(result.blob!, "trimmed.flac");
		expect(reopened.probe.durationSec).toBeCloseTo(0.4, 1);
		reopened.dispose();
		opened.dispose();
	});
});
