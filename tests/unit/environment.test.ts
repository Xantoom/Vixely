import { describe, expect, it } from "vitest";
import {
	buildEnvironmentReport,
	detectEngine,
	estimateExportBytes,
	exportExceedsCeiling,
	IN_MEMORY_EXPORT_CEILING_BYTES,
	type EnvironmentProbes,
} from "~/core/environment";

const BASE: EnvironmentProbes = {
	userAgent: "",
	hasVideoEncoder: true,
	hasVideoDecoder: true,
	hasAudioEncoder: true,
	hasAudioDecoder: true,
	hasFileSystemWritableStream: true,
	hasWebGL2: true,
	hasOffscreenCanvas: true,
	hasWebAudio: true,
	hasSharedWorker: true,
	hardwareConcurrency: 8,
	deviceMemoryGb: 16,
	isMobile: false,
};

/** The five reference configurations of plan §10. */
const CONFIGURATIONS = {
	chromium: {
		...BASE,
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
	},
	firefoxDesktop: {
		...BASE,
		userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
		hasFileSystemWritableStream: false,
	},
	safari26: {
		...BASE,
		userAgent:
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1 (KHTML, like Gecko) Version/26.0 Safari/620.1",
		hasFileSystemWritableStream: false,
	},
	safari25: {
		...BASE,
		userAgent:
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/618.1 (KHTML, like Gecko) Version/25.0 Safari/618.1",
		hasFileSystemWritableStream: false,
		hasAudioEncoder: false,
		hasAudioDecoder: false,
	},
	firefoxAndroid: {
		...BASE,
		userAgent: "Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0",
		hasFileSystemWritableStream: false,
		hasVideoEncoder: false,
		hasVideoDecoder: false,
		hasAudioEncoder: false,
		hasAudioDecoder: false,
		isMobile: true,
	},
} satisfies Record<string, EnvironmentProbes>;

describe("engine detection", () => {
	it.each([
		[CONFIGURATIONS.chromium.userAgent, "chromium"],
		[CONFIGURATIONS.firefoxDesktop.userAgent, "gecko"],
		[CONFIGURATIONS.safari26.userAgent, "webkit"],
		[CONFIGURATIONS.firefoxAndroid.userAgent, "gecko"],
		["", "unknown"],
	] as const)("classifies %s", (userAgent, expected) => {
		expect(detectEngine(userAgent)).toBe(expected);
	});

	it("does not mistake Edge for WebKit", () => {
		expect(
			detectEngine(
				"Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
			),
		).toBe("chromium");
	});
});

describe("capability report (plan §10)", () => {
	it("Chromium is fully capable and streams to disk", () => {
		const report = buildEnvironmentReport(CONFIGURATIONS.chromium);
		expect(report.level).toBe("full");
		expect(report.streamingExport).toBe(true);
		expect(report.exportSizeCeilingBytes).toBeNull();
		expect(report.limitations).toHaveLength(0);
	});

	it("Firefox desktop warns about in-memory assembly, before any work", () => {
		const report = buildEnvironmentReport(CONFIGURATIONS.firefoxDesktop);
		expect(report.canEditVideo).toBe(true);
		expect(report.canEditAudio).toBe(true);
		expect(report.streamingExport).toBe(false);
		expect(report.exportSizeCeilingBytes).toBe(IN_MEMORY_EXPORT_CEILING_BYTES);
		expect(report.limitations.map((l) => l.key)).toEqual(["environment.noStreamingExport"]);
	});

	it("Safari 26 behaves like Firefox desktop", () => {
		const report = buildEnvironmentReport(CONFIGURATIONS.safari26);
		expect(report.canEditVideo).toBe(true);
		expect(report.canReencodeAudio).toBe(true);
		expect(report.limitations.map((l) => l.key)).toEqual(["environment.noStreamingExport"]);
	});

	it("Safari 25 keeps audio passthrough rather than dropping audio", () => {
		const report = buildEnvironmentReport(CONFIGURATIONS.safari25);
		expect(report.canReencodeAudio).toBe(false);
		expect(report.canPassthroughAudio).toBe(true);
		expect(report.canEditAudio).toBe(false);
		expect(report.canEditVideo).toBe(true);
		const keys = report.limitations.map((l) => l.key);
		expect(keys).toContain("environment.audioPassthroughOnly");
		expect(keys).not.toContain("environment.noWebCodecsAudio");
		expect(
			report.limitations.find((l) => l.key === "environment.audioPassthroughOnly")?.severity,
		).toBe("warning");
	});

	it("Firefox Android is told plainly that it cannot run the editors", () => {
		const report = buildEnvironmentReport(CONFIGURATIONS.firefoxAndroid);
		expect(report.canEditVideo).toBe(false);
		expect(report.canEditAudio).toBe(false);
		expect(report.canPassthroughAudio).toBe(false);
		// Subtitles need no codec, so the page still has something to offer.
		expect(report.canEditSubtitles).toBe(true);
		const keys = report.limitations.map((l) => l.key);
		expect(keys).toContain("environment.noWebCodecsVideo");
		expect(keys).toContain("environment.noWebCodecsAudio");
		expect(
			report.limitations.every((l) => l.severity === "blocking" || l.severity === "warning"),
		).toBe(true);
	});

	it("reports missing WebGL2 as blocking", () => {
		const report = buildEnvironmentReport({ ...BASE, hasWebGL2: false });
		expect(report.canEditImages).toBe(false);
		expect(report.limitations.map((l) => l.key)).toContain("environment.noWebGL2");
	});
});

describe("export size estimation", () => {
	it("turns bitrates and duration into bytes", () => {
		// 10 Mbit/s video + 192 kbit/s audio for one minute.
		expect(estimateExportBytes(60, 10_000_000, 192_000)).toBe(76_440_000);
	});

	it("warns before the ceiling is actually hit, not at it", () => {
		const firefox = buildEnvironmentReport(CONFIGURATIONS.firefoxDesktop);
		expect(exportExceedsCeiling(firefox, IN_MEMORY_EXPORT_CEILING_BYTES * 0.9)).toBe(true);
		expect(exportExceedsCeiling(firefox, IN_MEMORY_EXPORT_CEILING_BYTES * 0.5)).toBe(false);
	});

	it("never warns where writes stream to disk", () => {
		const chromium = buildEnvironmentReport(CONFIGURATIONS.chromium);
		expect(exportExceedsCeiling(chromium, 500 * 1024 ** 3)).toBe(false);
	});
});
