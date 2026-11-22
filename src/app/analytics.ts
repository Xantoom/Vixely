/**
 * Visits counted by the site itself (worker/index.ts): no cookie, nothing stored on the device, no
 * other site involved. Each page shown sends its address, its language, the kind of screen and the
 * site the visitor came from; the IP address is never kept. Only the deployed site counts.
 */
import { getLocale } from '@/paraglide/runtime.js';

const COUNTING = import.meta.env.PROD && location.protocol === 'https:';

let last: string | null = null;

function screenKind(): string {
	if (!matchMedia('(pointer: coarse)').matches) return 'computer';
	return Math.min(window.screen.width, window.screen.height) < 600 ? 'phone' : 'tablet';
}

/** Counts a page shown. The same page twice in a row counts once. */
export function countPage(path: string) {
	if (!COUNTING || path === last) return;
	last = path;
	const from = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '';
	const body = JSON.stringify({ page: path, language: getLocale(), screen: screenKind(), from });
	try {
		navigator.sendBeacon('/count', new Blob([body], { type: 'application/json' }));
	} catch {
		// Counting never gets in the way.
	}
}
