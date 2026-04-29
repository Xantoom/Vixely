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

function formatLogTimestamp(date: Date): string {
	const hh = date.getHours().toString().padStart(2, '0');
	const mm = date.getMinutes().toString().padStart(2, '0');
	const ss = date.getSeconds().toString().padStart(2, '0');
	const ms = date.getMilliseconds().toString().padStart(3, '0');
	return `${hh}:${mm}:${ss}.${ms}`;
}

export function emitTelemetry(event: string, payload: TelemetryPayload = {}): void {
	if (!isPerfTelemetryEnabled()) return;
	const now = Date.now();
	const entry = { event, payload, timestampMs: now };
	if (typeof window !== 'undefined') {
		const target = window as Window & {
			__VIXELY_TELEMETRY__?: Array<{ event: string; payload: TelemetryPayload; timestampMs: number }>;
		};
		if (!target.__VIXELY_TELEMETRY__) target.__VIXELY_TELEMETRY__ = [];
		target.__VIXELY_TELEMETRY__.push(entry);
	}
	console.debug(`[telemetry ${formatLogTimestamp(new Date(now))}]`, event, payload);
}
