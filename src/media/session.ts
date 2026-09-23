import { create } from 'zustand';
import type { MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { identify } from './identify';
import type { MediaInfo } from './probe';

export type OpenError =
	| { reason: 'unknown' | 'legacy' | 'read'; format?: string }
	| { reason: 'skipped'; count: number };

export interface OpenedFile {
	file: File;
	kind: MediaKind;
	format: string;
	/** Null when the file could be identified but not read further. */
	info: MediaInfo | null;
	poster: ImageBitmap | null;
}

/** A file of a batch: identified, not read yet. */
export interface BatchFile {
	id: number;
	file: File;
	format: string;
}

interface SessionState {
	current: OpenedFile | null;
	/** Several images opened at once. The current file is one of them, shown in the preview. */
	batch: BatchFile[] | null;
	/** Stays the same while a batch lives, even as images are added or removed. */
	batchKey: object | null;
	/** What is being read, ready to show while the drop is processed. */
	reading: string | null;
	error: OpenError | null;
	/** Reads files and resolves with the editor that should open them, or null if none can be opened. */
	open: (files: File[]) => Promise<MediaKind | null>;
	/** Shows another file of the batch in the preview. */
	select: (item: BatchFile) => Promise<void>;
	addToBatch: (files: File[]) => Promise<void>;
	removeFromBatch: (id: number) => void;
	clearError: () => void;
}

/**
 * Containers such as MP4 or Matroska can hold audio only. Their signature says "video"; the tracks
 * inside decide.
 */
function editorFor(kind: MediaKind, info: MediaInfo | null): MediaKind {
	if (kind === 'video' && info && !info.video && info.audio) return 'audio';
	return kind;
}

async function read(file: File, kind: MediaKind, format: string): Promise<OpenedFile> {
	let info: MediaInfo | null = null;
	let poster: ImageBitmap | null = null;
	try {
		// Mediabunny is only needed once a file is open, so it stays out of the first load.
		const { probe } = await import('./probe');
		({ info, poster } = await probe(file, kind, format));
	} catch {
		// The editor still opens and shows what is known: name, size and format.
	}
	return { file, kind: editorFor(kind, info), format, info, poster };
}

let nextBatchId = 1;

/** Identifies files and keeps the images, for batches. */
async function identifyImages(files: File[]): Promise<{ images: BatchFile[]; skipped: number }> {
	const results = await Promise.all(files.map(async (file) => ({ file, result: await identify(file) })));
	const images: BatchFile[] = [];
	for (const { file, result } of results) {
		if (result.ok && result.value.kind === 'image')
			images.push({ id: nextBatchId++, file, format: result.value.format });
	}
	return { images, skipped: files.length - images.length };
}

export const useSession = create<SessionState>((set, get) => ({
	current: null,
	batch: null,
	batchKey: null,
	reading: null,
	error: null,

	async open(files) {
		const [first] = files;
		if (!first) return null;
		const reading =
			files.length > 1 ? m.drop_reading_many({ count: files.length }) : m.drop_reading({ name: first.name });
		set({ reading, error: null });

		if (files.length > 1) {
			const { images, skipped } = await identifyImages(files);
			const [lead] = images;
			if (!lead) {
				set({ reading: null, error: { reason: 'unknown' } });
				return null;
			}
			const opened = await read(lead.file, 'image', lead.format);
			get().current?.poster?.close();
			set({
				reading: null,
				current: opened,
				batch: images.length > 1 ? images : null,
				batchKey: images.length > 1 ? {} : null,
				error: skipped > 0 ? { reason: 'skipped', count: skipped } : null,
			});
			return 'image';
		}

		const result = await identify(first);
		if (!result.ok) {
			set({ reading: null, error: { reason: result.reason, format: result.format } });
			return null;
		}
		const opened = await read(first, result.value.kind, result.value.format);
		// Another drop may have started while this file was being read.
		if (get().reading !== reading) {
			opened.poster?.close();
			return null;
		}
		get().current?.poster?.close();
		set({ reading: null, current: opened, batch: null, batchKey: null });
		return opened.kind;
	},

	async select(item) {
		if (get().current?.file === item.file) return;
		const opened = await read(item.file, 'image', item.format);
		if (!get().batch?.some((entry) => entry.id === item.id)) {
			opened.poster?.close();
			return;
		}
		get().current?.poster?.close();
		set({ current: opened });
	},

	async addToBatch(files) {
		const { images, skipped } = await identifyImages(files);
		const current = get().current;
		const existing =
			get().batch ?? (current ? [{ id: nextBatchId++, file: current.file, format: current.format }] : []);
		set({
			batch: [...existing, ...images],
			batchKey: get().batchKey ?? {},
			error: skipped > 0 ? { reason: 'skipped', count: skipped } : null,
		});
	},

	removeFromBatch(id) {
		const batch = get().batch?.filter((item) => item.id !== id) ?? null;
		if (!batch) return;
		const current = get().current;
		const [first] = batch;
		// Keep a batch of one as a batch, so the strip stays until the user leaves it.
		set({ batch });
		if (current && first && !batch.some((item) => item.file === current.file)) void get().select(first);
	},

	clearError() {
		set({ error: null });
	},
}));
