/**
 * Visits counted with GoatCounter (goatcounter.com): no cookie, nothing stored on the device, no
 * script from elsewhere. Each page shown sends its path, the site the visitor came from and the
 * screen width; GoatCounter keeps no IP address. Off unless the build is given a GoatCounter code
 * (VITE_GOATCOUNTER), and only on the site's own address, never on a preview.
 */

const CODE: string | undefined = import.meta.env.VITE_GOATCOUNTER;
const HOST = 'vixely.app';

export const analyticsEnabled = Boolean(CODE);

let last: string | null = null;

/** Counts a page shown. The same page twice in a row counts once. */
export function countPage(path: string) {
	if (!CODE || location.hostname !== HOST || path === last) return;
	last = path;
	const referrer = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '';
	const query = new URLSearchParams({
		p: path,
		t: document.title,
		r: referrer,
		s: String(window.screen.width),
		// Tells GoatCounter the request is not a bot's.
		b: '0',
		rnd: Math.random().toString(36).slice(2),
	});
	try {
		navigator.sendBeacon(`https://${CODE}.goatcounter.com/count?${query.toString()}`);
	} catch {
		// Counting never gets in the way.
	}
}
