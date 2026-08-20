import { beforeAll, describe, expect, it } from "vitest";
import { NEUTRAL_FILTERS, createVideoDocument, type VideoDocument } from "~/core/document";
import {
	closeFrame,
	createVideoReader,
	extractPassthroughTracks,
	openMedia,
	planExportPath,
	renderAndEncodeVideo,
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

let encodableCodec: "avc" | "vp9" | null = null;

async function encodeFixture(): Promise<File | null> {
	const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } =
		await import("mediabunny");

	// Probed rather than assumed: Firefox headless encodes VP9 but not H.264,
	// which is exactly the variability the environment layer exists for.
	const codec = (await canEncodeVideo("avc", { width: WIDTH, height: HEIGHT }))
		? ("avc" as const)
		: (await canEncodeVideo("vp9", { width: WIDTH, height: HEIGHT }))
			? ("vp9" as const)
			: null;
	if (codec === null) return null;
	encodableCodec = codec;

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
	const base = createVideoDocument(
		{ id: "fixture", name: file.name, byteLength: file.size, mimeType: file.type },
		durationSec,
		WIDTH,
		HEIGHT,
	);
	// The export codec follows what this browser can actually encode, and the
	// container follows the codec: WebM carries VP9, MP4 does not carry it here.
	return encodableCodec === "vp9"
		? {
				...base,
				export: { ...base.export, codec: "vp9", container: "webm" },
			}
		: base;
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

describe("preview and export are the same pipeline for video (I1)", () => {
	it("encodes the frames the preview drew, filters included", async () => {
		if (fixture === null) return;

		const opened = await openMedia(fixture, fixture.name);
		const edit: VideoDocument = {
			...documentFor(fixture, opened.probe.durationSec),
			filters: { ...NEUTRAL_FILTERS, contrast: 0.35, saturation: -0.2, brightness: 0.1 },
			trimStartSec: 0,
			trimEndSec: 0.5,
		};

		// The export path: decode → graph → encode.
		const exported = await renderAndEncodeVideo({
			document: edit,
			source: opened,
			container: documentContainer(),
			destination: { kind: "buffer" },
		});
		expect(exported.blob).not.toBeNull();

		// The preview path: decode → graph → screen, on the same source frame.
		const reader = await createVideoReader(opened);
		const previewFrame = await reader.frameAt(0.25);
		expect(previewFrame).not.toBeNull();

		const graph = new RenderGraph(new OffscreenCanvas(1, 1));
		let previewPixels: Uint8ClampedArray;
		try {
			const size = graph.render({
				source: { kind: "frame", frame: previewFrame! },
				sourceWidth: WIDTH,
				sourceHeight: HEIGHT,
				crop: null,
				rotation: 0,
				flipHorizontal: false,
				flipVertical: false,
				resize: null,
				filters: edit.filters,
				textLayers: [],
				overlay: null,
				bypassFilters: false,
			});
			previewPixels = graph.readPixels(size);
		} finally {
			graph.dispose();
			closeFrame(previewFrame);
			opened.dispose();
		}

		// Decode the exported file back and take the corresponding frame.
		const reopened = await openMedia(exported.blob!, "exported.mp4");
		try {
			const exportReader = await createVideoReader(reopened);
			const exportedFrame = await exportReader.frameAt(0.25);
			expect(exportedFrame).not.toBeNull();

			const [previewR, previewG, previewB] = centrePixel(previewPixels, WIDTH, HEIGHT);
			const [exportR, exportG, exportB] = await centreOfFrame(exportedFrame!);
			closeFrame(exportedFrame);

			// Lossy encoding moves values a little; a filter applied twice — or
			// not at all — moves them by an order of magnitude more.
			expect(Math.abs(previewR - exportR)).toBeLessThanOrEqual(24);
			expect(Math.abs(previewG - exportG)).toBeLessThanOrEqual(24);
			expect(Math.abs(previewB - exportB)).toBeLessThanOrEqual(24);
		} finally {
			reopened.dispose();
		}
	}, 60_000);

	it("would fail if the export ignored the filters", async () => {
		if (fixture === null) return;

		const opened = await openMedia(fixture, fixture.name);
		const neutral: VideoDocument = {
			...documentFor(fixture, opened.probe.durationSec),
			trimEndSec: 0.4,
		};
		const filtered: VideoDocument = {
			...neutral,
			filters: { ...NEUTRAL_FILTERS, brightness: 0.4 },
		};

		const withoutFilters = await renderAndEncodeVideo({
			document: neutral,
			source: opened,
			container: documentContainer(),
			destination: { kind: "buffer" },
		});
		const withFilters = await renderAndEncodeVideo({
			document: filtered,
			source: opened,
			container: documentContainer(),
			destination: { kind: "buffer" },
		});
		opened.dispose();

		const plain = await openMedia(withoutFilters.blob!, "plain.mp4");
		const bright = await openMedia(withFilters.blob!, "bright.mp4");
		try {
			const plainFrame = await (await createVideoReader(plain)).frameAt(0.2);
			const brightFrame = await (await createVideoReader(bright)).frameAt(0.2);
			const [, plainG] = await centreOfFrame(plainFrame!);
			const [, brightG] = await centreOfFrame(brightFrame!);
			closeFrame(plainFrame);
			closeFrame(brightFrame);

			// The green channel starts at 40; +0.4 lands near 142.
			expect(brightG - plainG).toBeGreaterThan(60);
		} finally {
			plain.dispose();
			bright.dispose();
		}
	}, 60_000);

	it("honours the trim, so the output is genuinely shorter", async () => {
		if (fixture === null) return;

		const opened = await openMedia(fixture, fixture.name);
		const edit: VideoDocument = {
			...documentFor(fixture, opened.probe.durationSec),
			filters: { ...NEUTRAL_FILTERS, contrast: 0.2 },
			trimStartSec: 0.2,
			trimEndSec: 0.6,
		};

		const exported = await renderAndEncodeVideo({
			document: edit,
			source: opened,
			container: documentContainer(),
			destination: { kind: "buffer" },
		});
		opened.dispose();

		const reopened = await openMedia(exported.blob!, "trimmed.mp4");
		try {
			expect(reopened.probe.durationSec).toBeGreaterThan(0.2);
			expect(reopened.probe.durationSec).toBeLessThan(0.55);
		} finally {
			reopened.dispose();
		}
	}, 60_000);
});

/** The container the probed codec belongs in. */
function documentContainer(): "mp4" | "webm" {
	return encodableCodec === "vp9" ? "webm" : "mp4";
}

function centrePixel(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): [number, number, number] {
	// readPixels is bottom-up, but the centre pixel is the centre either way.
	const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
	return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!];
}

async function centreOfFrame(frame: VideoFrame): Promise<[number, number, number]> {
	return firstPixel(frame);
}

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
