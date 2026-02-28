import { useEffect } from 'react';
import { emitTelemetry, isPerfTelemetryEnabled } from '@/utils/telemetry.ts';

interface PerformanceObserverLike {
	observe(options?: PerformanceObserverInit): void;
	disconnect(): void;
}

export function useLongTaskObserver(scope: string): void {
	useEffect(() => {
		if (!isPerfTelemetryEnabled()) return;
		if (typeof PerformanceObserver === 'undefined') return;
		if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;

		const observer: PerformanceObserverLike = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				emitTelemetry('long_task', {
					scope,
					name: entry.name,
					startTimeMs: Number(entry.startTime.toFixed(2)),
					durationMs: Number(entry.duration.toFixed(2)),
				});
			}
		});

		observer.observe({ type: 'longtask', buffered: true });

		return () => {
			observer.disconnect();
		};
	}, [scope]);
}
