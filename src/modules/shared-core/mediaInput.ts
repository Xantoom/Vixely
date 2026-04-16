import { ALL_FORMATS, BlobSource, BufferSource, Input, ReadableStreamSource, UrlSource, type Source } from 'mediabunny';

/**
 * Union of every source type Vixely can hand to Mediabunny. Keeping this as a single
 * entry point lets the rest of the app stay agnostic of whether the file is local,
 * fetched from a URL or streamed in chunks.
 */
export type MediaInputSource =
	| File
	| Blob
	| ArrayBuffer
	| Uint8Array
	| ReadableStream<Uint8Array>
	| { kind: 'url'; url: string | URL | Request; requestInit?: RequestInit }
	| { kind: 'stream'; stream: ReadableStream<Uint8Array> };

export interface CreateMediaInputOptions {
	/** Maximum cache size in bytes. Defaults per source type. */
	maxCacheSize?: number;
	/** Limit parallel network requests (URL sources only). Defaults to 2. */
	parallelism?: number;
}

function toSource(source: MediaInputSource, options: CreateMediaInputOptions): Source {
	if (source instanceof Blob) {
		return new BlobSource(
			source,
			options.maxCacheSize != null ? { maxCacheSize: options.maxCacheSize } : undefined,
		);
	}
	if (source instanceof ArrayBuffer) {
		return new BufferSource(new Uint8Array(source));
	}
	if (source instanceof Uint8Array) {
		return new BufferSource(source);
	}
	if (source instanceof ReadableStream) {
		return new ReadableStreamSource(
			source,
			options.maxCacheSize != null ? { maxCacheSize: options.maxCacheSize } : undefined,
		);
	}
	if (source && typeof source === 'object' && 'kind' in source) {
		if (source.kind === 'stream') {
			return new ReadableStreamSource(
				source.stream,
				options.maxCacheSize != null ? { maxCacheSize: options.maxCacheSize } : undefined,
			);
		}
		if (source.kind === 'url') {
			return new UrlSource(source.url, {
				maxCacheSize: options.maxCacheSize,
				parallelism: options.parallelism,
				requestInit: source.requestInit,
			});
		}
	}
	throw new Error('Unsupported media input source');
}

/**
 * Creates a Mediabunny `Input` from any supported source. Callers should always call
 * `input.dispose()` when finished.
 */
export function createMediaInput(source: MediaInputSource, options: CreateMediaInputOptions = {}): Input {
	return new Input({ source: toSource(source, options), formats: ALL_FORMATS });
}

export interface RemoteFileFetchOptions {
	/** Passed through to the `fetch()` call. */
	requestInit?: RequestInit;
	/** Override the filename derived from the URL. */
	filename?: string;
	/** Notified for download progress (0..1) when `Content-Length` is known. */
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
}

function deriveFilename(url: string | URL): string {
	try {
		const parsed = typeof url === 'string' ? new URL(url) : url;
		const segments = parsed.pathname.split('/');
		for (let i = segments.length - 1; i >= 0; i -= 1) {
			const segment = segments[i];
			if (segment && segment.includes('.')) return decodeURIComponent(segment);
		}
	} catch {
		// fall through
	}
	return 'remote-media';
}

/**
 * Fetches a media file from a URL and wraps it in a browser `File`. Prefer
 * {@link createMediaInput} with a `{ kind: 'url' }` source when you can avoid
 * buffering the entire response — this helper exists for the legacy code paths
 * that still require a concrete `File` reference.
 */
export async function fetchRemoteAsFile(url: string, options: RemoteFileFetchOptions = {}): Promise<File> {
	const response = await fetch(url, { ...options.requestInit, signal: options.signal });
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}
	const total = Number(response.headers.get('Content-Length')) || 0;
	const type = response.headers.get('Content-Type') ?? 'application/octet-stream';

	if (!response.body || !options.onProgress || total <= 0) {
		const buffer = await response.arrayBuffer();
		options.onProgress?.(1);
		return new File([buffer], options.filename ?? deriveFilename(url), { type });
	}

	// Stream the body one chunk at a time so we can report progress. The reads are
	// inherently sequential — they advance the stream — so the lint rule against
	// awaiting in a loop doesn't apply here.
	const merged = await readStreamWithProgress(response.body, total, options.onProgress);
	const dedicated = new ArrayBuffer(merged.byteLength);
	new Uint8Array(dedicated).set(merged);
	return new File([dedicated], options.filename ?? deriveFilename(url), { type });
}

async function readStreamWithProgress(
	stream: ReadableStream<Uint8Array>,
	total: number,
	onProgress: (progress: number) => void,
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		// eslint-disable-next-line no-await-in-loop
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			received += value.byteLength;
			onProgress(Math.min(1, received / total));
		}
	}
	const merged = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged;
}
