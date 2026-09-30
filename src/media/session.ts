import { create } from 'zustand';
import type { StillImage } from '@/editors/gif/source';
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
	/** An animation made from still images, `file` being the first: all of them, in order. */
	images?: StillImage[];
}

/** A file of a batch: identified, not read yet. */
export interface BatchFile {
	id: number;
	file: File;
	format: string;
}

type Opened = Partial<Record<MediaKind, OpenedFile>>;

interface SessionState {
	/**
	 * The file each editor has open. Going from one editor to another and back finds the file
	 * again, with its edits: a video stays open in the video editor while a GIF is made from it.
	 */
	opened: Opened;
	/** The file of the editor used last: the one a closed tab gets back. */
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
	/** Opens the file of one editor in another, such as the video open for a GIF made from it. */
	openFrom: (from: MediaKind, kind: MediaKind) => void;
	/** The editor on screen: its file becomes the current one. */
	focus: (kind: MediaKind) => void;
	/** Closes the file of one editor, and the batch it holds: the editor is empty again. */
	close: (kind: MediaKind) => void;
	/** Shows another file of the batch in the preview. */
	select: (item: BatchFile) => Promise<void>;
	addToBatch: (files: File[]) => Promise<void>;
	removeFromBatch: (id: number) => void;
	/** Opens still images in the GIF editor as the frames of one animation. */
	makeGif: (files: File[]) => Promise<boolean>;
	/** Adds still images at the end of the animation made from images; false if none were. */
	addImages: (files: File[]) => Promise<boolean>;
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

/**
 * Loads what opening a file needs, from the moment one is about to be opened (a file dialog, a
 * file dragged over the page): it is then ready when the file comes, rather than fetched after.
 */
export function prepareOpening() {
	void import('./probe').catch(() => undefined);
}

async function read(original: File, kind: MediaKind, format: string): Promise<OpenedFile> {
	let file = original;
	let info: MediaInfo | null = null;
	let poster: ImageBitmap | null = null;
	try {
		// Mediabunny is only needed once a file is open, so it stays out of the first load.
		const [{ probe }, { readableFile }] = await Promise.all([import('./probe'), import('./readable')]);
		file = await readableFile(original, format).catch(() => original);
		({ info, poster } = await probe(file, kind, format));
		// A file read as the WAV made from it still shows its own format.
		if (file !== original) info = { ...info, format: format.toUpperCase(), size: original.size };
	} catch {
		// The editor still opens and shows what is known: name, size and format.
	}
	return { file, kind: editorFor(kind, info), format, info, poster };
}

let nextBatchId = 1;

/**
 * `opened` with `file` in `kind`'s place. The poster of the file it replaces is released, unless
 * another editor still shows the same file.
 */
function withOpened(opened: Opened, kind: MediaKind, file: OpenedFile): Opened {
	const previous = opened[kind];
	const next = { ...opened, [kind]: file };
	const poster = previous?.poster;
	if (poster && poster !== file.poster && !Object.values(next).some((entry) => entry.poster === poster))
		poster.close();
	return next;
}

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

/** The still images among files, in order, and how many other files there were. */
export async function stillImages(files: readonly File[]): Promise<{ images: StillImage[]; others: number }> {
	const results = await Promise.all(files.map(async (file) => ({ file, result: await identify(file) })));
	const images = results.flatMap(({ file, result }) =>
		result.ok && result.value.kind === 'image' ? [{ file, format: result.value.format }] : [],
	);
	return { images, others: files.length - images.length };
}

export const useSession = create<SessionState>((set, get) => ({
	opened: {},
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

		// Still images dropped on the GIF editor become the frames of one animation.
		if (prefer === 'gif') {
			const { images, others } = await stillImages(files);
			if (images.length > 0 && (others === 0 || files.length > 1)) {
				set({ reading: null });
				return (await get().makeGif(images.map((image) => image.file))) ? 'gif' : null;
			}
		}

		if (files.length > 1) {
			const kind = await batchKindOf(files, prefer);
			const { items, skipped } = kind ? await identifyBatch(files, kind) : { items: [], skipped: files.length };
			const [lead] = items;
			if (!kind || !lead) {
				set({ reading: null, error: { reason: 'unknown' } });
				return null;
			}
			const opened = { ...(await read(lead.file, kind, lead.format)), kind };
			set({
				reading: null,
				opened: withOpened(get().opened, kind, opened),
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
		// The subtitles of a video are read while it is probed, rather than after.
		if (result.value.kind === 'video') {
			void import('@/editors/subtitles/project').then(({ prepareVideo }) => {
				prepareVideo(first);
			});
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
		// A batch belongs to its editor: a file opened elsewhere leaves it.
		const batchLeft = get().batchKind === opened.kind;
		set({
			reading: null,
			opened: withOpened(get().opened, opened.kind, opened),
			current: opened,
			...(batchLeft ? { batch: null, batchKind: null, batchKey: null } : {}),
		});
		return opened.kind;
	},

	openFrom(from, kind) {
		const source = get().opened[from];
		if (!source) return;
		const opened = { ...source, kind };
		set({
			opened: withOpened(get().opened, kind, opened),
			current: opened,
			...(get().batchKind === kind ? { batch: null, batchKind: null, batchKey: null } : {}),
		});
	},

	openAs(kind) {
		const current = get().current;
		if (!current) return;
		const opened = { ...current, kind };
		set({
			opened: withOpened(get().opened, kind, opened),
			current: opened,
			...(get().batchKind === kind ? { batch: null, batchKind: null, batchKey: null } : {}),
		});
	},

	focus(kind) {
		const opened = get().opened[kind];
		if (opened && opened !== get().current) set({ current: opened });
	},

	close(kind) {
		const closed = get().opened[kind];
		if (!closed) return;
		const rest: Opened = { ...get().opened };
		delete rest[kind];
		const poster = closed.poster;
		if (poster && !Object.values(rest).some((entry) => entry.poster === poster)) poster.close();
		set({
			opened: rest,
			current: get().current === closed ? null : get().current,
			...(get().batchKind === kind ? { batch: null, batchKind: null, batchKey: null } : {}),
		});
	},

	async select(item) {
		const kind = get().batchKind;
		if (!kind || get().opened[kind]?.file === item.file) return;
		const opened = { ...(await read(item.file, kind, item.format)), kind };
		if (!get().batch?.some((entry) => entry.id === item.id)) {
			opened.poster?.close();
			return;
		}
		set({ opened: withOpened(get().opened, kind, opened), current: opened });
	},

	async addToBatch(files) {
		const kind = get().batchKind ?? get().current?.kind;
		if (!kind || !BATCH_KINDS[kind]) return;
		const current = get().opened[kind];
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
		const kind = get().batchKind;
		const current = kind ? get().opened[kind] : null;
		const [first] = batch;
		// Keep a batch of one as a batch, so the strip stays until the user leaves it.
		set({ batch });
		if (current && first && !batch.some((item) => item.file === current.file)) void get().select(first);
	},

	async makeGif(files) {
		const { images, others } = await stillImages(files);
		const [lead] = images;
		if (!lead) {
			set({ error: { reason: 'unknown' } });
			return false;
		}
		const opened: OpenedFile = {
			...(await read(lead.file, 'image', lead.format)),
			kind: 'gif',
			format: 'images',
			images,
		};
		set({
			opened: withOpened(get().opened, 'gif', opened),
			current: opened,
			...(get().batchKind === 'gif' ? { batch: null, batchKind: null, batchKey: null } : {}),
			error: others > 0 ? { reason: 'skipped', count: others } : null,
		});
		return true;
	},

	async addImages(files) {
		const current = get().opened.gif;
		if (!current?.images) return false;
		const { images, others } = await stillImages(files);
		if (images.length === 0) return false;
		const opened = { ...current, images: [...current.images, ...images] };
		set({
			opened: withOpened(get().opened, 'gif', opened),
			...(get().current === current ? { current: opened } : {}),
			error: others > 0 ? { reason: 'skipped', count: others } : null,
		});
		return true;
	},

	clearError() {
		set({ error: null });
	},
}));

/** The file `kind`'s editor has open, if any. */
export function useOpened(kind: MediaKind): OpenedFile | null {
	return useSession((state) => state.opened[kind] ?? null);
}
