const PERF_TELEMETRY_STORAGE_KEY = 'vixely:perf-telemetry';

export interface TelemetryPayload {
	[key: string]: unknown;
}

function isDevBuild(): boolean {
	return import.meta.env.DEV;
}

function readStorageFlag(key: string): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

export function isPerfTelemetryEnabled(): boolean {
	return isDevBuild() || readStorageFlag(PERF_TELEMETRY_STORAGE_KEY);
}

export function emitTelemetry(event: string, payload: TelemetryPayload = {}): void {
	if (!isPerfTelemetryEnabled()) return;
	const entry = { event, payload, timestampMs: Date.now() };
	if (typeof window !== 'undefined') {
		const target = window as Window & {
			__VIXELY_TELEMETRY__?: Array<{ event: string; payload: TelemetryPayload; timestampMs: number }>;
		};
		if (!target.__VIXELY_TELEMETRY__) target.__VIXELY_TELEMETRY__ = [];
		target.__VIXELY_TELEMETRY__.push(entry);
	}
	console.debug('[telemetry]', event, payload);
}
