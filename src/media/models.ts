/**
 * Data downloaded the first time a feature needs it (text recognition languages), kept in the
 * browser's cache so later uses work at once and offline. Only these public files are fetched:
 * nothing of the user's files leaves the device.
 */
const CACHE = 'vixely-models';

/** Fetches a file, from the cache when it was fetched before. `onProgress` gets 0 to 1. */
export async function fetchModel(url: string, onProgress: (share: number) => void = () => {}): Promise<Uint8Array> {
	const cache = await caches.open(CACHE).catch(() => null);
	const cached = await cache?.match(url);
	if (cached) {
		onProgress(1);
		return new Uint8Array(await cached.arrayBuffer());
	}
	const response = await fetch(url, { mode: 'cors' });
	if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
	const total = Number(response.headers.get('content-length')) || 0;
	const reader = response.body.getReader();
	const parts: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- a stream is read in order
		const { done, value } = await reader.read();
		if (done) break;
		parts.push(value);
		received += value.length;
		if (total > 0) onProgress(Math.min(1, received / total));
	}
	const bytes = new Uint8Array(received);
	let at = 0;
	for (const part of parts) {
		bytes.set(part, at);
		at += part.length;
	}
	await cache?.put(url, new Response(bytes.slice())).catch(() => undefined);
	onProgress(1);
	return bytes;
}

/** Undoes gzip, for files published compressed. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
