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
