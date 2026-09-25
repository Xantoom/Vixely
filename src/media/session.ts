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
	/** Several files of one kind opened at once. The current file is one of them. */
	batch: BatchFile[] | null;
	/** What the batch holds: images or audio. */
	batchKind: MediaKind | null;
	/** Stays the same while a batch lives, even as images are added or removed. */
	batchKey: object | null;
	/** What is being read, ready to show while the drop is processed. */
	reading: string | null;
	error: OpenError | null;
	/**
	 * Reads files and resolves with the editor that should open them, or null if none can be opened.
	 * `prefer` names the editor the files were dropped on: a video dropped on the audio editor
	 * opens its audio there.
	 */
	open: (files: File[], prefer?: MediaKind) => Promise<MediaKind | null>;
	/** Opens the current file in another editor, such as the audio of a video. */
	openAs: (kind: MediaKind) => void;
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

/** Kinds that can be batched. Audio batches also take videos: their audio is what gets processed. */
const BATCH_KINDS: Partial<Record<MediaKind, MediaKind[]>> = {
	image: ['image'],
	gif: ['gif'],
	audio: ['audio', 'video'],
	subtitles: ['subtitles'],
	video: ['video'],
};

/** Identifies files and keeps those a batch of `kind` accepts. */
async function identifyBatch(files: File[], kind: MediaKind): Promise<{ items: BatchFile[]; skipped: number }> {
	const accepted = BATCH_KINDS[kind] ?? [kind];
	const results = await Promise.all(files.map(async (file) => ({ file, result: await identify(file) })));
	const items: BatchFile[] = [];
	for (const { file, result } of results) {
		if (result.ok && accepted.includes(result.value.kind))
			items.push({ id: nextBatchId++, file, format: result.value.format });
	}
	return { items, skipped: files.length - items.length };
}

/** The kind a set of dropped files is batched as: the editor dropped on, else the first file's kind. */
async function batchKindOf(files: File[], prefer: MediaKind | undefined): Promise<MediaKind | null> {
	if (prefer && BATCH_KINDS[prefer]) return prefer;
	for (const file of files) {
		// Sequential on purpose: the first recognised file decides, the rest is not read.
		// oxlint-disable-next-line no-await-in-loop
		const result = await identify(file);
		if (!result.ok) continue;
		if (BATCH_KINDS[result.value.kind]) return result.value.kind;
	}
	return null;
}

export const useSession = create<SessionState>((set, get) => ({
	current: null,
	batch: null,
	batchKind: null,
	batchKey: null,
	reading: null,
	error: null,

	async open(files, prefer) {
		const [first] = files;
		if (!first) return null;
		const reading =
			files.length > 1 ? m.drop_reading_many({ count: files.length }) : m.drop_reading({ name: first.name });
		set({ reading, error: null });

		if (files.length > 1) {
			const kind = await batchKindOf(files, prefer);
			const { items, skipped } = kind ? await identifyBatch(files, kind) : { items: [], skipped: files.length };
			const [lead] = items;
			if (!kind || !lead) {
				set({ reading: null, error: { reason: 'unknown' } });
				return null;
			}
			const opened = { ...(await read(lead.file, kind, lead.format)), kind };
			get().current?.poster?.close();
			set({
				reading: null,
				current: opened,
				batch: items.length > 1 ? items : null,
				batchKind: items.length > 1 ? kind : null,
				batchKey: items.length > 1 ? {} : null,
				error: skipped > 0 ? { reason: 'skipped', count: skipped } : null,
			});
			return kind;
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
		// A video dropped on the audio editor opens its audio there.
		if (prefer === 'audio' && opened.kind === 'video' && opened.info?.audio) opened.kind = 'audio';
		// And a video dropped on the GIF editor becomes a GIF there.
		if (prefer === 'gif' && opened.kind === 'video' && opened.info?.video) opened.kind = 'gif';
		// On the subtitle editor, a video brings its subtitle tracks, or gets new ones.
		if (prefer === 'subtitles' && (opened.kind === 'video' || opened.kind === 'audio')) opened.kind = 'subtitles';
		get().current?.poster?.close();
		set({ reading: null, current: opened, batch: null, batchKind: null, batchKey: null });
		return opened.kind;
	},

	openAs(kind) {
		const current = get().current;
		if (!current) return;
		set({ current: { ...current, kind }, batch: null, batchKind: null, batchKey: null });
	},

	async select(item) {
		const kind = get().batchKind;
		if (!kind || get().current?.file === item.file) return;
		const opened = { ...(await read(item.file, kind, item.format)), kind };
		if (!get().batch?.some((entry) => entry.id === item.id)) {
			opened.poster?.close();
			return;
		}
		get().current?.poster?.close();
		set({ current: opened });
	},

	async addToBatch(files) {
		const current = get().current;
		const kind = get().batchKind ?? current?.kind;
		if (!kind || !BATCH_KINDS[kind]) return;
		const { items, skipped } = await identifyBatch(files, kind);
		const existing =
			get().batch ?? (current ? [{ id: nextBatchId++, file: current.file, format: current.format }] : []);
		set({
			batch: [...existing, ...items],
			batchKind: kind,
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
