import type {
	BrowserEngine,
	EnvironmentLimitation,
	EnvironmentProbes,
	EnvironmentReport,
} from "./types.ts";

/**
 * In-memory assembly ceiling on browsers without `showSaveFilePicker`.
 * Deliberately conservative: the warning must arrive before forty minutes of
 * encoding, not after.
 */
export const IN_MEMORY_EXPORT_CEILING_BYTES = 2 * 1024 * 1024 * 1024;

export function detectEngine(userAgent: string): BrowserEngine {
	const ua = userAgent.toLowerCase();
	if (ua.includes("firefox") || ua.includes("fxios") || ua.includes("gecko/")) return "gecko";
	if (ua.includes("edg/") || ua.includes("chrome") || ua.includes("chromium")) return "chromium";
	if (ua.includes("safari") || ua.includes("applewebkit")) return "webkit";
	return "unknown";
}

/**
 * Turns raw capability probes into what the application may offer and what it
 * must say up front (plan §10). Probes are injected so the five reference
 * configurations are unit-testable without a browser.
 */
export function buildEnvironmentReport(probes: EnvironmentProbes): EnvironmentReport {
	const engine = detectEngine(probes.userAgent);
	const limitations: EnvironmentLimitation[] = [];

	const canDecodeVideo = probes.hasVideoDecoder;
	const canEncodeVideo = probes.hasVideoEncoder;
	const canEditVideo = canDecodeVideo && canEncodeVideo && probes.hasWebGL2;
	const canReencodeAudio = probes.hasAudioEncoder && probes.hasAudioDecoder;
	const canEditAudio = canReencodeAudio && probes.hasWebAudio;
	// Passthrough only moves already-encoded packets; it needs no audio codec.
	const canPassthroughAudio = canDecodeVideo || canEncodeVideo || canReencodeAudio;
	const canEditImages = probes.hasWebGL2;
	const canEditGif = probes.hasWebGL2;
	const canEditSubtitles = true;

	if (!canDecodeVideo) {
		limitations.push({ key: "environment.noWebCodecsVideo", severity: "blocking" });
	}
	if (!probes.hasWebGL2) {
		limitations.push({ key: "environment.noWebGL2", severity: "blocking" });
	}
	if (!canReencodeAudio) {
		limitations.push({
			key: canPassthroughAudio
				? "environment.audioPassthroughOnly"
				: "environment.noWebCodecsAudio",
			severity: canPassthroughAudio ? "warning" : "blocking",
		});
	}
	if (!probes.hasFileSystemWritableStream) {
		limitations.push({ key: "environment.noStreamingExport", severity: "warning" });
	}
	if (!probes.hasOffscreenCanvas) {
		limitations.push({ key: "environment.noOffscreenCanvas", severity: "info" });
	}

	// Subtitles need neither WebCodecs nor WebGL2, so an environment is only
	// truly unsupported when nothing at all can run.
	const level: EnvironmentReport["level"] = (() => {
		if (canEditVideo && canEditAudio && probes.hasFileSystemWritableStream) return "full";
		if (canEditVideo || canEditAudio || canEditImages) return "limited";
		return "unsupported";
	})();

	return {
		engine,
		level,
		streamingExport: probes.hasFileSystemWritableStream,
		exportSizeCeilingBytes: probes.hasFileSystemWritableStream
			? null
			: IN_MEMORY_EXPORT_CEILING_BYTES,
		canEditVideo,
		canEditAudio,
		canReencodeAudio,
		canPassthroughAudio,
		canEditImages,
		canEditGif,
		canEditSubtitles,
		limitations,
		probes,
	};
}

/** Reads the real environment. Never called from tests. */
export function readProbes(): EnvironmentProbes {
	const globalScope = globalThis as Record<string, unknown> & {
		navigator?: Navigator & { deviceMemory?: number };
	};
	const navigatorRef = globalScope.navigator;
	const userAgent = navigatorRef?.userAgent ?? "";

	let hasWebGL2 = false;
	try {
		const canvas =
			typeof document === "undefined"
				? typeof OffscreenCanvas === "undefined"
					? null
					: new OffscreenCanvas(1, 1)
				: document.createElement("canvas");
		hasWebGL2 = canvas !== null && canvas.getContext("webgl2") !== null;
	} catch {
		hasWebGL2 = false;
	}

	return {
		userAgent,
		hasVideoEncoder: "VideoEncoder" in globalScope,
		hasVideoDecoder: "VideoDecoder" in globalScope,
		hasAudioEncoder: "AudioEncoder" in globalScope,
		hasAudioDecoder: "AudioDecoder" in globalScope,
		hasFileSystemWritableStream:
			"showSaveFilePicker" in globalScope && "FileSystemWritableFileStream" in globalScope,
		hasWebGL2,
		hasOffscreenCanvas: "OffscreenCanvas" in globalScope,
		hasWebAudio: "AudioContext" in globalScope || "webkitAudioContext" in globalScope,
		hasSharedWorker: "SharedWorker" in globalScope,
		hardwareConcurrency: navigatorRef?.hardwareConcurrency ?? 4,
		deviceMemoryGb: navigatorRef?.deviceMemory ?? null,
		isMobile:
			/android|iphone|ipad|ipod|mobile/i.test(userAgent) || (navigatorRef?.maxTouchPoints ?? 0) > 1,
	};
}

export function describeEnvironment(): EnvironmentReport {
	return buildEnvironmentReport(readProbes());
}

/**
 * Rough output-size estimate used to warn *before* an export starts on a
 * browser that must assemble the file in memory.
 */
export function estimateExportBytes(
	durationSec: number,
	videoBitsPerSecond: number,
	audioBitsPerSecond: number,
): number {
	return Math.round(((videoBitsPerSecond + audioBitsPerSecond) * durationSec) / 8);
}

export function exportExceedsCeiling(report: EnvironmentReport, estimatedBytes: number): boolean {
	return (
		report.exportSizeCeilingBytes !== null && estimatedBytes > report.exportSizeCeilingBytes * 0.8
	);
}
