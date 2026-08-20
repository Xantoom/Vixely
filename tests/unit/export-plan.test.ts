import { describe, expect, it } from "vitest";
import {
	createAudioDocument,
	createImageDocument,
	createVideoDocument,
	NEUTRAL_FILTERS,
	type AudioDocument,
	type SourceRef,
	type VideoDocument,
} from "~/core/document";
import {
	collectVideoExportWarnings,
	containerAccepts,
	CONTAINER_SUBTITLE_SUPPORT,
	outputName,
	planExportPath,
} from "~/core/media";

const SOURCE: SourceRef = {
	id: "s",
	name: "holiday.mp4",
	byteLength: 1024,
	mimeType: "video/mp4",
};

function video(overrides: Partial<VideoDocument> = {}): VideoDocument {
	return { ...createVideoDocument(SOURCE, 120, 1920, 1080), ...overrides };
}

function audio(overrides: Partial<AudioDocument> = {}): AudioDocument {
	return { ...createAudioDocument(SOURCE, 120), ...overrides };
}

describe("choosing between Conversion and the manual path", () => {
	it("remuxes rather than re-encodes when nothing touches the pixels", () => {
		expect(planExportPath(video())).toEqual({
			kind: "conversion",
			reason: "no pixel or sample work",
		});
	});

	it.each([
		["a filter", video({ filters: { ...NEUTRAL_FILTERS, contrast: 0.2 } })],
		["a crop", video({ crop: { x: 0, y: 0, width: 100, height: 100 } })],
		["a rotation", video({ rotation: 90 })],
		[
			"a text layer",
			video({
				textLayers: [
					{
						id: "t",
						text: "hi",
						x: 0,
						y: 0,
						fontFamily: "Inter",
						fontSize: 12,
						fontWeight: 400,
						italic: false,
						color: "#fff",
						align: "left",
						rotation: 0,
						opacity: 1,
						strokeColor: null,
						strokeWidth: 0,
						shadowColor: null,
						shadowBlur: 0,
						shadowOffsetX: 0,
						shadowOffsetY: 0,
						backgroundColor: null,
						letterSpacing: 0,
						lineHeight: 1.2,
					},
				],
			}),
		],
	])("re-encodes for %s", (_label, document) => {
		const path = planExportPath(document);
		expect(path.kind).toBe("manual");
	});

	it("re-encodes when subtitles are burnt in, but not when they are embedded", () => {
		const burn = video({ export: { ...video().export, subtitleMode: "burn-in" } });
		const embed = video({ export: { ...video().export, subtitleMode: "embed" } });
		expect(planExportPath(burn).kind).toBe("manual");
		expect(planExportPath(embed).kind).toBe("conversion");
	});

	it("leaves audio alone when no processing is requested", () => {
		expect(planExportPath(audio()).kind).toBe("conversion");
	});

	it("processes audio when normalisation or the equaliser is on", () => {
		expect(
			planExportPath(audio({ loudness: { enabled: true, targetLufs: -14, truePeakDb: -1 } })).kind,
		).toBe("manual");
		expect(
			planExportPath(
				audio({
					equalizer: [
						{ id: "b", type: "peaking", frequency: 1000, gainDb: 3, q: 1, enabled: true },
					],
				}),
			).kind,
		).toBe("manual");
	});

	it("ignores a disabled equaliser band", () => {
		expect(
			planExportPath(
				audio({
					equalizer: [
						{
							id: "b",
							type: "peaking",
							frequency: 1000,
							gainDb: 6,
							q: 1,
							enabled: false,
						},
					],
				}),
			).kind,
		).toBe("conversion");
	});

	it("always renders images", () => {
		expect(planExportPath(createImageDocument(SOURCE, 10, 10)).kind).toBe("manual");
	});
});

describe("container compatibility", () => {
	it("knows which container carries which codec", () => {
		expect(containerAccepts("webm", "vp9")).toBe(true);
		expect(containerAccepts("webm", "hevc")).toBe(false);
		expect(containerAccepts("mp4", "dts")).toBe(true);
		expect(containerAccepts("wav", "aac")).toBe(false);
	});

	it("records that MP4 standardises neither ASS nor PGS", () => {
		expect(CONTAINER_SUBTITLE_SUPPORT.mp4).toEqual({ text: true, ass: false, pgs: false });
		expect(CONTAINER_SUBTITLE_SUPPORT.mkv).toEqual({ text: true, ass: true, pgs: true });
	});
});

describe("warnings raised before the export starts", () => {
	it("says PGS cannot go into MP4, and names the way out", () => {
		const warnings = collectVideoExportWarnings(video(), ["pgs"]);
		const dropped = warnings.find((w) => w.code === "subtitles-dropped");
		expect(dropped?.detail).toMatch(/MKV/);
	});

	it("says ASS loses its styling in MP4 rather than silently converting", () => {
		const warnings = collectVideoExportWarnings(video(), ["ass"]);
		expect(warnings.some((w) => w.code === "subtitles-downgraded")).toBe(true);
	});

	it("raises nothing about subtitles when the target is MKV", () => {
		const mkv = video({ export: { ...video().export, container: "mkv" } });
		const warnings = collectVideoExportWarnings(mkv, ["ass", "pgs"]);
		expect(warnings.filter((w) => w.code.startsWith("subtitles"))).toHaveLength(0);
	});

	it("flags a codec the container cannot carry", () => {
		const webm = video({ export: { ...video().export, container: "webm", codec: "hevc" } });
		expect(collectVideoExportWarnings(webm, []).some((w) => w.code === "codec-incompatible")).toBe(
			true,
		);
	});

	it("says when a re-encode is unavoidable, and why", () => {
		const cropped = video({ crop: { x: 0, y: 0, width: 100, height: 100 } });
		const warning = collectVideoExportWarnings(cropped, []).find(
			(w) => w.code === "reencode-required",
		);
		expect(warning?.detail).toContain("crop");
	});
});

describe("output naming", () => {
	it("swaps the extension", () => {
		expect(outputName("holiday.mp4", "mkv")).toBe("holiday.mkv");
		expect(outputName("no-extension", "webm")).toBe("no-extension.webm");
		expect(outputName("archive.tar.gz", "mp4")).toBe("archive.tar.mp4");
	});
});
