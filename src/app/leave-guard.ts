import { useEffect } from 'react';

/** Everything that would be lost by closing the tab now: edits, an export under way. */
const holds = new Set<symbol>();

function onBeforeUnload(event: BeforeUnloadEvent) {
	if (holds.size === 0) return;
	// The browser shows its own question; the text can't be chosen.
	event.preventDefault();
}

/**
 * Asks before the tab closes or reloads while `active`: the browser's own "Leave site?" question.
 * Leaving within the app is not affected.
 */
export function useLeaveGuard(active: boolean) {
	useEffect(() => {
		if (!active) return;
		const hold = Symbol('leave-guard');
		if (holds.size === 0) window.addEventListener('beforeunload', onBeforeUnload);
		holds.add(hold);
		return () => {
			holds.delete(hold);
			if (holds.size === 0) window.removeEventListener('beforeunload', onBeforeUnload);
		};
	}, [active]);
}

/** Keeps the screen on while `active`: a phone going to sleep would stop an export. */
export function useWakeLock(active: boolean) {
	useEffect(() => {
		if (!active || !('wakeLock' in navigator)) return;
		let lock: WakeLockSentinel | null = null;
		let stopped = false;
		const request = async () => {
			try {
				const next = await navigator.wakeLock.request('screen');
				if (stopped) void next.release();
				else lock = next;
			} catch {
				// Refused, as on low battery: the export goes on as long as the screen does.
			}
		};
		// The lock ends when the page is hidden.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void request();
		};
		void request();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			stopped = true;
			document.removeEventListener('visibilitychange', onVisible);
			void lock?.release();
		};
	}, [active]);
}
