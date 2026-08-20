import { useSyncExternalStore } from "react";
import { buildEnvironmentReport, readProbes, type EnvironmentReport } from "~/core/environment";

let cached: EnvironmentReport | null = null;

/** The probe result never changes within a session, so it is read once. */
function getSnapshot(): EnvironmentReport {
	cached ??= buildEnvironmentReport(readProbes());
	return cached;
}

const SERVER_SNAPSHOT: EnvironmentReport = buildEnvironmentReport({
	userAgent: "",
	hasVideoEncoder: false,
	hasVideoDecoder: false,
	hasAudioEncoder: false,
	hasAudioDecoder: false,
	hasFileSystemWritableStream: false,
	hasWebGL2: false,
	hasOffscreenCanvas: false,
	hasWebAudio: false,
	hasSharedWorker: false,
	hardwareConcurrency: 1,
	deviceMemoryGb: null,
	isMobile: false,
});

export function useEnvironment(): EnvironmentReport {
	return useSyncExternalStore(
		() => () => undefined,
		getSnapshot,
		() => SERVER_SNAPSHOT,
	);
}
