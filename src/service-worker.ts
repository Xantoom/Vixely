/**
 * The service worker: Vixely without a network. It is built after the app (scripts/service-worker.ts),
 * which fills in the list of the build's files.
 *
 * - The pages and the code every screen needs are cached when it installs.
 * - The rest of the build (editors' encoders, decoders, fonts, stickers) is cached once the page
 *   asks for it, in the background, or whenever it is first used.
 * - Pages come from the network while there is one, so a new version shows up at once; the cache
 *   answers when there isn't. Files named by their content never change: the cache answers first.
 * - Files shared with the installed app (Android's share sheet) are kept until the page takes them.
 *
 * Other sites (models, language data) are left alone: their own caches keep them.
 */

interface ExtendableEvent extends Event {
	waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
	readonly request: Request;
	respondWith(response: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
	readonly data: unknown;
	readonly source: { postMessage(message: unknown): void } | null;
}
interface WorkerScope {
	readonly location: Location;
	readonly clients: { claim(): Promise<void> };
	skipWaiting(): Promise<void>;
	addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
	addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
	addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
}

declare const self: WorkerScope;
/**
 * Filled in by the build: the files cached at install, those cached in the background after, and
 * those only cached once used (speech recognition and text recognition, tens of megabytes).
 */
declare const SHELL: string[];
declare const REST: string[];
declare const LAZY: string[];

const CACHE = 'vixely-app';
const SHARED = 'vixely-shared';
/** How long a page waits for the network before the cached copy answers. */
const NETWORK_WAIT = 4000;

const everything = new Set([...SHELL, ...REST, ...LAZY]);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then(async (cache) => cache.addAll(SHELL)));
});

// Files of older versions go once no page uses them any more, which is when this worker starts.
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			const kept = await cache.keys();
			await Promise.all(
				kept
					.filter((request) => !everything.has(new URL(request.url).pathname))
					.map(async (request) => cache.delete(request)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener('message', (event) => {
	const data: unknown = event.data;
	const type = typeof data === 'object' && data !== null && 'type' in data ? data.type : null;
	if (type === 'update') void self.skipWaiting();
	// Cached a few at a time, so the page stays quick while it happens.
	if (type === 'warm') event.waitUntil(warm());
	if (type === 'take-shared') event.waitUntil(takeShared(event));
});

async function warm(): Promise<void> {
	const cache = await caches.open(CACHE);
	const missing: string[] = [];
	for (const path of REST) {
		// oxlint-disable-next-line no-await-in-loop
		if (!(await cache.match(path))) missing.push(path);
	}
	const next = async (): Promise<void> => {
		const path = missing.shift();
		if (!path) return;
		try {
			await cache.add(path);
		} catch {
			// Offline or gone: it will be cached when it is used.
		}
		await next();
	};
	await Promise.all([next(), next(), next()]);
}

/** The cached copy of a page: /video is video.html, anything else the app's own page. */
function pageFile(pathname: string): string {
	if (pathname === '/') return '/index.html';
	const file = `${pathname.replace(/\/$/, '')}.html`;
	return everything.has(file) ? file : '/index.html';
}

async function page(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const file = pageFile(new URL(request.url).pathname);
	const network = fetch(request).then(async (response) => {
		if (response.ok) await cache.put(file, response.clone());
		return response;
	});
	const waited = new Promise<null>((resolve) => {
		setTimeout(() => {
			resolve(null);
		}, NETWORK_WAIT);
	});
	try {
		const first = await Promise.race([network, waited]);
		if (first) return first;
	} catch {
		// No network: the cache answers.
	}
	return (await cache.match(file)) ?? (await cache.match('/index.html')) ?? network;
}

async function file(request: Request, path: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(path);
	if (cached) return cached;
	const response = await fetch(request);
	// Parts of a file (media seeking) are never kept, only whole ones of this version.
	if (response.status === 200 && everything.has(path)) await cache.put(path, response.clone());
	return response;
}

/** Files shared with the app: kept in a cache, the page then opens with ?shared to take them. */
async function share(request: Request): Promise<Response> {
	const form = await request.formData();
	const cache = await caches.open(SHARED);
	await Promise.all((await cache.keys()).map(async (old) => cache.delete(old)));
	const files = form.getAll('files').filter((value): value is File => value instanceof File);
	await Promise.all(
		files.map(async (shared, index) =>
			cache.put(
				`/shared/${index}`,
				new Response(shared, {
					headers: {
						'content-type': shared.type || 'application/octet-stream',
						'x-name': encodeURIComponent(shared.name),
						'x-modified': String(shared.lastModified),
					},
				}),
			),
		),
	);
	return Response.redirect('/?shared', 303);
}

async function takeShared(event: ExtendableMessageEvent): Promise<void> {
	const cache = await caches.open(SHARED);
	const keys = await cache.keys();
	const files: File[] = [];
	for (const key of keys) {
		// oxlint-disable-next-line no-await-in-loop
		const response = await cache.match(key);
		if (!response) continue;
		// oxlint-disable-next-line no-await-in-loop
		const blob = await response.blob();
		files.push(
			new File([blob], decodeURIComponent(response.headers.get('x-name') ?? 'shared'), {
				type: blob.type,
				lastModified: Number(response.headers.get('x-modified')) || Date.now(),
			}),
		);
	}
	await Promise.all(keys.map(async (key) => cache.delete(key)));
	event.source?.postMessage({ type: 'shared', files });
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (request.method === 'POST' && url.pathname === '/share') {
		event.respondWith(share(request));
		return;
	}
	if (request.method !== 'GET' || request.headers.has('range')) return;
	if (request.mode === 'navigate') {
		event.respondWith(page(request));
		return;
	}
	if (everything.has(url.pathname)) event.respondWith(file(request, url.pathname));
});

export {};
