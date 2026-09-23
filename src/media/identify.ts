import { isMediaKind, type MediaKind } from '@/editors/registry';
import { loadCore } from '@/wasm/core';

export interface Identified {
	kind: MediaKind;
	/** Short lowercase format name, such as `mp4`, `jpeg` or `srt`. */
	format: string;
}

export type IdentifyResult =
	| { ok: true; value: Identified }
	| { ok: false; reason: 'unknown' | 'legacy' | 'read'; format?: string };

/** Containers and codecs that neither Mediabunny nor WebCodecs can read. They get a clear refusal. */
const LEGACY_FORMATS = new Set(['avi', 'flv', 'wmv', 'mpeg', 'ogv']);

/** Bytes read from the start of the file. Enough for every signature we check, including APNG chunks. */
const HEAD_SIZE = 4096;

const EXTENSION_FALLBACK: Record<string, Identified> = {
	srt: { kind: 'subtitles', format: 'srt' },
	vtt: { kind: 'subtitles', format: 'vtt' },
	ass: { kind: 'subtitles', format: 'ass' },
	ssa: { kind: 'subtitles', format: 'ass' },
	sup: { kind: 'subtitles', format: 'pgs' },
};

/**
 * Works out which editor should open a file. The signature in the first bytes wins over the
 * extension, which is often missing or wrong. The extension only helps for text formats whose
 * content was too unusual to recognise.
 */
export async function identify(file: File): Promise<IdentifyResult> {
	let head: Uint8Array;
	try {
		head = new Uint8Array(await file.slice(0, HEAD_SIZE).arrayBuffer());
	} catch {
		return { ok: false, reason: 'read' };
	}

	const core = await loadCore();
	const sniffed = core.sniff(head);
	let found: Identified | undefined;
	if (sniffed) {
		const { kind, format } = sniffed;
		sniffed.free();
		if (isMediaKind(kind)) found = { kind, format };
	} else {
		const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
		found = EXTENSION_FALLBACK[extension];
	}

	if (!found) return { ok: false, reason: 'unknown' };
	if (LEGACY_FORMATS.has(found.format)) return { ok: false, reason: 'legacy', format: found.format.toUpperCase() };
	return { ok: true, value: found };
}
