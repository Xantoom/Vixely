/**
 * The site's only code on the server: it counts the pages shown, without cookies and without
 * keeping anything that identifies a visitor. Everything else is a static file, served by
 * Cloudflare before this code runs (wrangler.jsonc: run_worker_first only for /count).
 *
 * Kept for each page shown: its address, its language, the country Cloudflare places the request
 * in, the size of the screen (phone, tablet or computer) and the site the visitor came from. No IP
 * address, no browser identifier, nothing that links two visits. Workers Analytics Engine keeps it
 * three months; `bun scripts/visits.ts` reads it.
 */

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	VISITS?: { writeDataPoint: (point: { blobs: string[]; doubles: number[]; indexes: string[] }) => void };
}

/** A page of the site, as the app names it. Anything else is not counted. */
const PAGE = /^\/[a-z0-9/-]{0,64}$/;
const LANGUAGES = new Set(['en', 'fr']);
const SCREENS = new Set(['phone', 'tablet', 'computer']);

/** The site a visitor came from, by its name only: never the full address. */
function origin(referrer: unknown): string {
	if (typeof referrer !== 'string' || !referrer) return '';
	try {
		return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 60);
	} catch {
		return '';
	}
}

async function count(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null) return new Response(null, { status: 400 });
	const { page, language, screen, from } = body as Record<string, unknown>;
	if (typeof page !== 'string' || !PAGE.test(page) || !LANGUAGES.has(String(language)) || !SCREENS.has(String(screen))) {
		return new Response(null, { status: 400 });
	}
	const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? '';
	env.VISITS?.writeDataPoint({
		blobs: [page, String(language), country, String(screen), origin(from)],
		doubles: [1],
		indexes: [page],
	});
	return new Response(null, { status: 204 });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (new URL(request.url).pathname === '/count') return count(request, env);
		return env.ASSETS.fetch(request);
	},
};
