import { emitTelemetry, isPerfTelemetryEnabled } from '@/utils/telemetry.ts';

let patched = false;

export function installObjectUrlMetricsPatch(): void {
	if (patched || typeof URL === 'undefined') return;
	patched = true;

	const originalCreateObjectURL = URL.createObjectURL.bind(URL);
	const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
	const liveUrls = new Set<string>();

	URL.createObjectURL = ((object: Blob | MediaSource) => {
		const url = originalCreateObjectURL(object);
		liveUrls.add(url);
		if (isPerfTelemetryEnabled()) {
			emitTelemetry('object_url_created', {
				activeCount: liveUrls.size,
				objectType: object instanceof Blob ? object.type || 'blob' : 'media-source',
			});
		}
		return url;
	}) as typeof URL.createObjectURL;

	URL.revokeObjectURL = ((url: string) => {
		const existed = liveUrls.delete(url);
		if (isPerfTelemetryEnabled()) {
			emitTelemetry('object_url_revoked', { activeCount: liveUrls.size, wasTracked: existed });
		}
		originalRevokeObjectURL(url);
	}) as typeof URL.revokeObjectURL;
}
