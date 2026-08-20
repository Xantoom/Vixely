import { beforeAll, describe, expect, it } from "vitest";
import { NEUTRAL_FILTERS, createVideoDocument, type VideoDocument } from "~/core/document";
import {
	closeFrame,
	createVideoReader,
	extractPassthroughTracks,
	openMedia,
	planExportPath,
} from "~/core/media";
import { createContainerBackend } from "~/core/container";
import { codecIdFor } from "~/core/subtitles";
import { RenderGraph, type RenderSpec } from "~/core/render";

/**
 * Tier 3 for video.
 *
 * The fixture is encoded here rather than committed: the toolchain carries no
 * encoder, but the browser does, and WebCodecs will produce a real H.264 or
 * VP8 file at runtime. Skipped where the browser can encode neither, with the
 * reason stated rather than passing silently.
 */

const WIDTH = 160;
const HEIGHT = 120;
const FRAME_COUNT = 30;

/** Each frame is a flat colour keyed to its index, so frame N is identifiable. */
function frameColour(index: number): [number, number, number] {
	return [Math.round((index / FRAME_COUNT) * 255), 40, 200];
}

async function encodeFixture(): Promise<File | null> {
	const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } =
		await import("mediabunny");

	const codec = (await canEncodeVideo("avc", { width: WIDTH, height: HEIGHT }))
		? ("avc" as const)
		: (await canEncodeVideo("vp9", { width: WIDTH, height: HEIGHT }))
			? ("vp9" as const)
			: null;
	if (codec === null) return null;

	const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
	const context = canvas.getContext("2d");
	if (context === null) return null;

	const target = new BufferTarget();
	const output = new Output({ format: new Mp4OutputFormat(), target });
	const source = new CanvasSource(canvas, { codec, quality: new Quality(0.9) });
	output.addVideoTrack(source, { frameRate: 30 });

	await output.start();
	for (let index = 0; index < FRAME_COUNT; index++) {
		const [r, g, b] = frameColour(index);
		context.fillStyle = `rgb(${r} ${g} ${b})`;
		context.fillRect(0, 0, WIDTH, HEIGHT);
		await source.add(index / 30, 1 / 30);
	}
	source.close();
	await output.finalize();

	const buffer = target.buffer;
	if (buffer === null) return null;
	return new File([buffer], "fixture.mp4", { type: "video/mp4" });
}

function documentFor(file: File, durationSec: number): VideoDocument {
	return createVideoDocument(
		{ id: "fixture", name: file.name, byteLength: file.size, mimeType: file.type },
		durationSec,
		WIDTH,
		HEIGHT,
	);
}

let fixture: File | null = null;

beforeAll(async () => {
	fixture = await encodeFixture();
}, 60_000);

describe("frame-accurate video reading", () => {
	it("has an encoder to build the fixture with", () => {
		// Stated rather than skipped silently: a test one believes one has is
		// worse than one that says it did not run.
		expect(fixture, "no video encoder available in this browser").not.toBeNull();
	});

	it("opens the file and reports the track", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			expect(opened.probe.videoTracks).toHaveLength(1);
			expect(opened.probe.videoTracks[0]?.codedWidth).toBe(WIDTH);
			expect(opened.probe.durationSec).toBeCloseTo(1, 0);
		} finally {
			opened.dispose();
		}
	});

	it("lands on the frame asked for, not on a nearby one", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			const reader = await createVideoReader(opened);
			// Frame 15 of 30 at 30 fps sits at 0.5 s and is a distinct colour.
			const frame = await reader.frameAt(15 / 30);
			expect(frame).not.toBeNull();
			try {
				const [r] = await firstPixel(frame!);
				const [expectedR] = frameColour(15);
				// Lossy encoding moves the value a little, never a lot.
				expect(Math.abs(r - expectedR)).toBeLessThan(30);
			} finally {
				closeFrame(frame);
			}
		} finally {
			opened.dispose();
		}
	});

	it("steps one frame at a time in both directions", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			const reader = await createVideoReader(opened);
			const start = await reader.frameAt(10 / 30);
			const startTime = (start?.timestamp ?? 0) / 1e6;
			closeFrame(start);

			const forward = await reader.stepFrom(startTime, 1);
			expect(forward).not.toBeNull();
			const forwardTime = (forward?.timestamp ?? 0) / 1e6;
			closeFrame(forward);
			expect(forwardTime).toBeGreaterThan(startTime);
			// One frame, not several: about a 30th of a second.
			expect(forwardTime - startTime).toBeLessThan(2 / 30);

			const back = await reader.stepFrom(startTime, -1);
			const backTime = (back?.timestamp ?? 0) / 1e6;
			closeFrame(back);
			expect(backTime).toBeLessThan(startTime);
		} finally {
			opened.dispose();
		}
	});

	it("finds the keyframe at or before a timestamp", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			const reader = await createVideoReader(opened);
			const keyframe = await reader.keyframeBefore(0.5);
			expect(keyframe).not.toBeNull();
			expect(keyframe!).toBeLessThanOrEqual(0.5);
		} finally {
			opened.dispose();
		}
	});

	it("closes every frame it hands out", async () => {
		if (fixture === null) return;
		const { resourceTracker } = await import("~/core/resources");
		resourceTracker.reset();
		resourceTracker.enable();

		const opened = await openMedia(fixture, fixture.name);
		try {
			const reader = await createVideoReader(opened);
			// A scrub: the exact pattern that kills a tab when frames leak (I4).
			for (let index = 0; index < 20; index++) {
				const frame = await reader.frameAt(index / 30);
				closeFrame(frame);
			}
			expect(resourceTracker.report("VideoFrame").outstanding).toBe(0);
		} finally {
			opened.dispose();
			resourceTracker.disable();
		}
	});
});

describe("the preview renders decoded frames through the shared graph", () => {
	it("draws a VideoFrame with filters applied once", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			const reader = await createVideoReader(opened);
			const frame = await reader.frameAt(0.5);
			expect(frame).not.toBeNull();

			const graph = new RenderGraph(new OffscreenCanvas(1, 1));
			try {
				const spec: RenderSpec = {
					source: { kind: "frame", frame: frame! },
					sourceWidth: WIDTH,
					sourceHeight: HEIGHT,
					crop: null,
					rotation: 0,
					flipHorizontal: false,
					flipVertical: false,
					resize: null,
					filters: NEUTRAL_FILTERS,
					textLayers: [],
					overlay: null,
					bypassFilters: false,
				};

				const neutral = graph.readPixels(graph.render(spec));
				const brighter = graph.readPixels(
					graph.render({ ...spec, filters: { ...NEUTRAL_FILTERS, brightness: 0.25 } }),
				);

				// The green channel starts at 40; +0.25 lands near 104, not near 168.
				expect(brighter[1]! - neutral[1]!).toBeGreaterThan(45);
				expect(brighter[1]! - neutral[1]!).toBeLessThan(85);
			} finally {
				graph.dispose();
				closeFrame(frame);
			}
		} finally {
			opened.dispose();
		}
	});
});

describe("export planning on a real file", () => {
	it("remuxes when nothing touches the pixels", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		try {
			const edit = documentFor(fixture, opened.probe.durationSec);
			expect(planExportPath(edit).kind).toBe("conversion");
			expect(planExportPath({ ...edit, filters: { ...NEUTRAL_FILTERS, contrast: 0.3 } }).kind).toBe(
				"manual",
			);
		} finally {
			opened.dispose();
		}
	});

	it("embeds a subtitle track without re-encoding the picture", async () => {
		if (fixture === null) return;
		const opened = await openMedia(fixture, fixture.name);
		const passthrough = await extractPassthroughTracks(opened);
		opened.dispose();

		const backend = createContainerBackend();
		const subtitleNumber = passthrough.tracks.length + 1;
		const written = await backend.write({
			tracks: [
				...passthrough.tracks,
				{
					number: subtitleNumber,
					kind: "subtitle",
					codecId: codecIdFor("ass"),
					codecPrivate: new TextEncoder().encode("[Script Info]\nScriptType: v4.00+\n"),
					language: "eng",
				},
			],
			packets: [
				...passthrough.packets,
				{
					trackNumber: subtitleNumber,
					timestampMs: 100,
					durationMs: 500,
					isKeyframe: true,
					data: new TextEncoder().encode("0,0,Default,,0,0,0,,Embedded"),
				},
			],
			durationMs: passthrough.durationMs,
		});

		// Mediabunny reads the video back, unchanged...
		const reopened = await openMedia(written, "with-subs.mkv");
		try {
			expect(reopened.probe.videoTracks).toHaveLength(1);
			const roundTripped = await extractPassthroughTracks(reopened);
			for (const [index, packet] of passthrough.packets.entries()) {
				expect([...(roundTripped.packets[index]?.data ?? [])]).toEqual([...packet.data]);
			}
		} finally {
			reopened.dispose();
		}

		// ...and our backend reads the ASS track it cannot see.
		const bytes = new Uint8Array(await written.arrayBuffer());
		const tracks = await backend.readSubtitleTracks(bytes);
		expect(tracks[0]?.format).toBe("ass");
	});
});

async function firstPixel(frame: VideoFrame): Promise<[number, number, number]> {
	const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
	const context = canvas.getContext("2d");
	if (context === null) throw new Error("no 2D context");
	context.drawImage(frame, 0, 0);
	const data = context.getImageData(
		Math.floor(frame.displayWidth / 2),
		Math.floor(frame.displayHeight / 2),
		1,
		1,
	).data;
	return [data[0]!, data[1]!, data[2]!];
}
