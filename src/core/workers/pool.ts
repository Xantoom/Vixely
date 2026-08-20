import type { Remote } from "comlink";

/**
 * Typed worker plumbing (I5).
 *
 * Decoding and encoding cannot run on the main thread if the preview is to stay
 * smooth. Comlink carries the type across the boundary so the alternative —
 * hand-written message passing and hand-written unions — never has to exist.
 */

export type WorkerTask<Input, Output> = {
	readonly run: (input: Input, signal?: AbortSignal) => Promise<Output>;
};

/** Pool size from the machine, capped so the system keeps room to breathe. */
export function poolSize(): number {
	const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
	return Math.max(1, Math.min(4, cores - 1));
}

export type WorkerHandle<T> = {
	readonly proxy: Remote<T>;
	readonly terminate: () => void;
};

/**
 * Wraps a worker with Comlink and hands back a terminator.
 *
 * The caller owns the handle and must terminate it: a worker left running holds
 * its decoder and its frames, which is the same leak `core/resources` guards
 * against, one thread over.
 */
export async function spawn<T>(factory: () => Worker): Promise<WorkerHandle<T>> {
	const { wrap } = await import("comlink");
	const worker = factory();
	return {
		proxy: wrap<T>(worker),
		terminate: () => worker.terminate(),
	};
}

/**
 * Round-robin pool.
 *
 * Deliberately not a queue with work stealing: media tasks are long and few,
 * and the complexity would buy nothing measurable here.
 */
export class WorkerPool<T> {
	readonly #handles: WorkerHandle<T>[] = [];
	#next = 0;

	private constructor(handles: readonly WorkerHandle<T>[]) {
		this.#handles = [...handles];
	}

	static async create<T>(factory: () => Worker, size = poolSize()): Promise<WorkerPool<T>> {
		const handles = await Promise.all(Array.from({ length: size }, () => spawn<T>(factory)));
		return new WorkerPool<T>(handles);
	}

	acquire(): Remote<T> {
		const handle = this.#handles[this.#next % this.#handles.length];
		this.#next += 1;
		if (handle === undefined) throw new Error("worker pool is empty");
		return handle.proxy;
	}

	get size(): number {
		return this.#handles.length;
	}

	dispose(): void {
		for (const handle of this.#handles) handle.terminate();
		this.#handles.length = 0;
	}
}

/**
 * Cooperative cancellation.
 *
 * A cancelled export must free its encoders and frames immediately, so every
 * long task takes a signal from the start rather than gaining one later.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) {
		throw new DOMException("the operation was cancelled", "AbortError");
	}
}

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

/** Transferables move; a structured clone of 200 MB would undo the worker. */
export function transferables(value: unknown): Transferable[] {
	const found: Transferable[] = [];
	const visit = (node: unknown) => {
		if (node instanceof ArrayBuffer) {
			found.push(node);
		} else if (ArrayBuffer.isView(node)) {
			found.push(node.buffer as ArrayBuffer);
		} else if (Array.isArray(node)) {
			for (const item of node) visit(item);
		} else if (node !== null && typeof node === "object") {
			for (const item of Object.values(node)) visit(item);
		}
	};
	visit(value);
	return found;
}
