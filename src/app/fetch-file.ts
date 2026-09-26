import type { MediaKind } from '@/editors/registry';

/** Why a file at an address could not be opened. */
export class FetchFileError extends Error {
	constructor(
		readonly reason: 'address' | 'blocked' | 'status',
		readonly status?: number,
	) {
		super(reason);
	}
}

/** The address of a file when `text` is one (http or https), else null. */
export function fileAddress(text: string): URL | null {
	try {
		const url = new URL(text.trim());
		return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
	} catch {
		return null;
	}
}

function nameFrom(url: URL, response: Response): string {
	const disposition = response.headers.get('content-disposition') ?? '';
	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	if (match?.[1]) return decodeURIComponent(match[1]);
	const last = decodeURIComponent(url.pathname.split('/').pop() ?? '');
	return last || url.hostname;
}

/**
 * Downloads the file at `address` into the page. Only sites that let other pages read their files
 * (CORS) allow it; the others answer nothing a page can read.
 */
export async function fetchFile(address: string, signal?: AbortSignal): Promise<File> {
	const url = fileAddress(address);
	if (!url) throw new FetchFileError('address');
	let response: Response;
	try {
		response = await fetch(url, { signal, credentials: 'omit' });
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		throw new FetchFileError('blocked');
	}
	if (!response.ok) throw new FetchFileError('status', response.status);
	const blob = await response.blob();
	return new File([blob], nameFrom(url, response), { type: blob.type });
}

/** The example each editor offers, made for Vixely (e2e/app-samples.ts). */
const SAMPLES: Record<MediaKind, string> = {
	video: 'sunset.mkv',
	image: 'lake.jpg',
	gif: 'sunset.gif',
	audio: 'sunset.mp3',
	subtitles: 'sunset.mkv',
};

export async function fetchSample(kind: MediaKind): Promise<File> {
	const name = SAMPLES[kind];
	const response = await fetch(`/samples/${name}`);
	if (!response.ok) throw new FetchFileError('status', response.status);
	const blob = await response.blob();
	return new File([blob], name, { type: blob.type });
}
