import { create } from 'zustand';
import type { MediaKind } from '@/editors/registry';
import { useSession } from '@/media/session';

/**
 * Work kept across a closed tab. While a file is edited, the editors' documents (their whole undo
 * history) and export settings are written to the browser's own storage, with a copy of the files
 * when there is room. Reloading the page brings everything back; after closing the tab, the home
 * page and the empty editor offer to take it up again.
 *
 * Each editor store registers what it keeps (`registerRestorable`) and takes it back when it loads
 * the same file (`takeRestore`). Only files being edited are kept: opening one is not work yet.
 */

/** A file of the saved session, whether or not its bytes could be kept. */
export interface SavedFile {
	name: string;
	size: number;
	lastModified: number;
}

export interface SavedSession {
	/** The editor it was in. */
	kind: MediaKind;
	files: SavedFile[];
	/** Whether the files themselves are kept; if not, they are asked for again. */
	stored: boolean;
	savedAt: number;
	/** What each store kept, by store name. */
	states: Record<string, unknown>;
}

interface Restorable {
	/** What to keep for the files open now, or null when there is nothing to keep. */
	snapshot: () => unknown;
	subscribe: (listener: () => void) => () => void;
}

const DB = 'vixely-session';
const SESSION = 'session';
const FILES = 'files';
/** Files larger than this together are not copied: the work is kept, the files asked for again. */
const MAX_COPY = 4 * 1024 ** 3;
/** Wait after the last change before writing, so a drag writes once. */
const DELAY = 800;

const restorables = new Map<string, Restorable>();

async function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => {
			resolve(req.result);
		};
		req.onerror = () => {
			reject(req.error ?? new Error('IndexedDB'));
		};
	});
}

let database: Promise<IDBDatabase> | null = null;

async function open(): Promise<IDBDatabase> {
	database ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(SESSION);
			req.result.createObjectStore(FILES);
		};
		req.onsuccess = () => {
			resolve(req.result);
		};
		req.onerror = () => {
			database = null;
			reject(req.error ?? new Error('IndexedDB'));
		};
	});
	return database;
}

async function transaction<T>(
	stores: string[],
	mode: IDBTransactionMode,
	work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
	const tx = (await open()).transaction(stores, mode);
	const done = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => {
			resolve();
		};
		tx.onerror = () => {
			reject(tx.error ?? new Error('IndexedDB'));
		};
		tx.onabort = () => {
			reject(tx.error ?? new Error('IndexedDB'));
		};
	});
	const result = await work(tx);
	await done;
	return result;
}

// ── What the editors keep ─────────────────────────────────────────────────────────────────────

/** Adds a store's state to what is kept. Called once by each store's module. */
export function registerRestorable(name: string, restorable: Restorable) {
	restorables.set(name, restorable);
	restorable.subscribe(schedule);
}

/** Whether `owner` (a file, or a batch) is what the session has open. */
export function isSessionOwner(owner: object | null): boolean {
	const { current, batchKey } = useSession.getState();
	return owner !== null && (owner === current?.file || owner === batchKey);
}

/** A kept state is the store's own, written by its `snapshot`. */
function isKept<T>(state: unknown): state is T {
	return state !== undefined && state !== null;
}

/** States waiting for their store, after the files were opened again. */
let pending: { lead: File; states: Record<string, unknown>; since: number } | null = null;

/**
 * What a store kept for the file it is loading, if that file is the one taken up again. Given
 * once: a later load of the same file starts afresh.
 */
export function takeRestore<T>(name: string): T | null {
	if (!pending || useSession.getState().current?.file !== pending.lead) return null;
	const state = pending.states[name];
	delete pending.states[name];
	if (Object.keys(pending.states).length === 0) pending = null;
	return isKept<T>(state) ? state : null;
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

/** Ids of the files written, by file, so the same file is never copied twice. */
const fileIds = new WeakMap<File, number>();
let nextId = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();
/** What was written last, to skip writing it again when only the playhead moved. */
let written: { files: File[]; states: Record<string, unknown> } | null = null;

/** Whether two kept states hold the same values, field by field. */
function sameStates(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const names = Object.keys(a);
	if (names.length !== Object.keys(b).length) return false;
	return names.every((name) => {
		const x = a[name];
		const y = b[name];
		if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return Object.is(x, y);
		const fields = new Map<string, unknown>(Object.entries(y));
		const own = Object.entries(x);
		return own.length === fields.size && own.every(([key, value]) => Object.is(value, fields.get(key)));
	});
}

function schedule() {
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		writing = writing.then(save).catch(() => {
			// Private windows and full disks refuse: the work simply isn't kept.
		});
	}, DELAY);
}

function sessionFiles(): File[] {
	const { current, batch } = useSession.getState();
	if (batch) {
		// The file shown first, so it opens first again.
		const files = batch.map((item) => item.file);
		return current ? [current.file, ...files.filter((file) => file !== current.file)] : files;
	}
	return current ? [current.file] : [];
}

async function roomFor(bytes: number): Promise<boolean> {
	if (bytes > MAX_COPY) return false;
	try {
		const { quota = 0, usage = 0 } = await navigator.storage.estimate();
		return bytes < (quota - usage) * 0.8;
	} catch {
		return false;
	}
}

async function save() {
	// Stores still waiting for what they kept would look unedited.
	if (pending && Date.now() - pending.since < 30_000) return;
	pending = null;
	const { current } = useSession.getState();
	const files = sessionFiles();
	if (!current || files.length === 0) return;
	const states: Record<string, unknown> = {};
	for (const [name, restorable] of restorables) {
		const state = restorable.snapshot();
		if (state !== null) states[name] = state;
	}
	if (
		written &&
		written.files.length === files.length &&
		written.files.every((file, index) => file === files[index])
	) {
		if (sameStates(written.states, states)) return;
	}
	const saved = useResume.getState().saved;
	const same = saved !== null && sameFiles(saved.files, files);
	if (Object.keys(states).length === 0) {
		// Everything undone: what was kept for these files goes too.
		if (same) await forget();
		written = { files, states };
		return;
	}

	const known = files.every((file) => fileIds.has(file));
	const stored = known || (await roomFor(files.reduce((sum, file) => sum + file.size, 0)));
	const session: SavedSession = {
		kind: current.kind,
		files: files.map(({ name, size, lastModified }) => ({ name, size, lastModified })),
		stored,
		savedAt: Date.now(),
		states,
	};
	await transaction([SESSION, FILES], 'readwrite', async (tx) => {
		const store = tx.objectStore(FILES);
		const ids: number[] = [];
		for (const file of files) {
			let id = fileIds.get(file);
			if (id === undefined && stored) {
				id = nextId++;
				store.put(file, id);
				fileIds.set(file, id);
			}
			if (id !== undefined) ids.push(id);
		}
		// Files of an older session go.
		const old = await request(store.getAllKeys());
		for (const key of old) if (!ids.includes(Number(key))) store.delete(key);
		tx.objectStore(SESSION).put({ ...session, ids }, 'last');
	});
	written = { files, states };
	useResume.setState({ saved: session });
}

function sameFiles(saved: readonly SavedFile[], files: readonly SavedFile[]): boolean {
	return (
		saved.length === files.length &&
		saved.every(
			(file, index) =>
				file.name === files[index]?.name &&
				file.size === files[index].size &&
				file.lastModified === files[index].lastModified,
		)
	);
}

// ── Reading ───────────────────────────────────────────────────────────────────────────────────

interface ResumeState {
	/** The session kept, once read; null when there is none. */
	saved: SavedSession | null;
	checked: boolean;
}

export const useResume = create<ResumeState>(() => ({ saved: null, checked: false }));

let checking: Promise<void> | null = null;

/** Reads what was kept, once per visit. */
export async function checkSaved(): Promise<void> {
	checking ??= (async () => {
		try {
			const saved = await transaction([SESSION], 'readonly', readSession);
			useResume.setState({ saved: saved ?? null, checked: true });
		} catch {
			useResume.setState({ checked: true });
		}
	})();
	return checking;
}

type StoredSession = SavedSession & { ids: number[] };

function isStoredSession(value: unknown): value is StoredSession {
	return typeof value === 'object' && value !== null && 'kind' in value && 'files' in value && 'ids' in value;
}

async function readSession(tx: IDBTransaction): Promise<StoredSession | null> {
	const value: unknown = await request(tx.objectStore(SESSION).get('last'));
	return isStoredSession(value) ? value : null;
}

/** Drops what was kept. */
export async function forget(): Promise<void> {
	useResume.setState({ saved: null });
	await transaction([SESSION, FILES], 'readwrite', (tx) => {
		tx.objectStore(SESSION).clear();
		tx.objectStore(FILES).clear();
	}).catch(() => {});
}

/**
 * Opens the kept files again and hands each store what it kept. `chosen` are the files picked by
 * the user when they couldn't be kept; they must be the same ones. Resolves with the editor to
 * show, or null when the files are gone or not the same.
 */
export async function resume(chosen?: readonly File[]): Promise<MediaKind | null> {
	const saved = await transaction([SESSION, FILES], 'readonly', async (tx) => {
		const session = await readSession(tx);
		if (!session) return null;
		const files = await Promise.all(
			session.ids.map(async (id) => {
				const file: unknown = await request(tx.objectStore(FILES).get(id));
				return { id, file: file instanceof File ? file : null };
			}),
		);
		return { session, files };
	});
	if (!saved) return null;
	const { session } = saved;
	let files: File[];
	if (chosen) {
		// In the order kept, whatever order they were picked in.
		const picked = session.files.map((meta) =>
			chosen.find((file) => file.name === meta.name && file.size === meta.size),
		);
		if (picked.some((file) => !file)) return null;
		files = picked.filter((file): file is File => file !== undefined);
	} else {
		const found = saved.files.flatMap(({ id, file }) => (file ? [{ id, file }] : []));
		if (!session.stored || found.length !== session.files.length) return null;
		// Found again: never copied a second time.
		for (const { id, file } of found) fileIds.set(file, id);
		files = found.map(({ file }) => file);
	}
	const [lead] = files;
	if (!lead) return null;
	pending = { lead, states: { ...session.states }, since: Date.now() };
	const kind = await useSession.getState().open(files, session.kind);
	if (!kind) {
		pending = null;
		return null;
	}
	// The editor it was in, such as the subtitles of a video.
	if (kind !== session.kind) useSession.getState().openAs(session.kind);
	return session.kind;
}

/** Whether this page load is a reload, when work is taken up without asking. */
export function isReload(): boolean {
	const [entry] = performance.getEntriesByType('navigation');
	return entry instanceof PerformanceNavigationTiming && entry.type === 'reload';
}

// A hidden tab may be closed at any time: what waits is written now.
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'hidden' || !timer) return;
		clearTimeout(timer);
		timer = null;
		writing = writing.then(save).catch(() => {});
	});
	useSession.subscribe(schedule);
}
