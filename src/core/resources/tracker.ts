import type { Closeable, LeakReport, ResourceKind } from "./types.ts";

/**
 * Allocation counters for resources that must be released by hand (I4).
 *
 * A `VideoFrame` left open during a scrub blows the tab's memory in seconds,
 * and the symptom — the tab dying — does not point at the cause. Counting is
 * the only way to catch it before a user does.
 */
class ResourceTracker {
	readonly #allocated = new Map<ResourceKind, number>();
	readonly #released = new Map<ResourceKind, number>();
	#enabled = false;
	#onImbalance: ((report: LeakReport) => void) | null = null;

	/** Off in production: the counters exist for development and for tests. */
	enable(onImbalance?: (report: LeakReport) => void): void {
		this.#enabled = true;
		this.#onImbalance = onImbalance ?? null;
	}

	disable(): void {
		this.#enabled = false;
		this.#onImbalance = null;
	}

	get enabled(): boolean {
		return this.#enabled;
	}

	reset(): void {
		this.#allocated.clear();
		this.#released.clear();
	}

	trackAllocation(kind: ResourceKind): void {
		if (!this.#enabled) return;
		this.#allocated.set(kind, (this.#allocated.get(kind) ?? 0) + 1);
	}

	trackRelease(kind: ResourceKind): void {
		if (!this.#enabled) return;
		this.#released.set(kind, (this.#released.get(kind) ?? 0) + 1);
		const report = this.report(kind);
		if (report.outstanding < 0) {
			// Closing twice is as much a bug as never closing: the second call
			// throws on a real VideoFrame.
			this.#onImbalance?.(report);
		}
	}

	report(kind: ResourceKind): LeakReport {
		const allocated = this.#allocated.get(kind) ?? 0;
		const released = this.#released.get(kind) ?? 0;
		return { kind, allocated, released, outstanding: allocated - released };
	}

	reportAll(): readonly LeakReport[] {
		const kinds = new Set([...this.#allocated.keys(), ...this.#released.keys()]);
		return [...kinds].map((kind) => this.report(kind));
	}

	/** True when every tracked resource has been released. */
	balanced(): boolean {
		return this.reportAll().every((report) => report.outstanding === 0);
	}
}

export const resourceTracker = new ResourceTracker();
export type { LeakReport, ResourceKind } from "./types.ts";

function kindOf(resource: object): ResourceKind {
	const name = resource.constructor?.name;
	if (name === "VideoFrame" || name === "AudioData" || name === "ImageBitmap") return name;
	return "other";
}

/** Registers a resource with the tracker and returns it unchanged. */
export function track<T extends Closeable>(resource: T, kind?: ResourceKind): T {
	resourceTracker.trackAllocation(kind ?? kindOf(resource));
	return resource;
}

/** Closes a resource once, tolerating an already-closed one. */
export function release(resource: Closeable | null | undefined, kind?: ResourceKind): void {
	if (resource === null || resource === undefined) return;
	resourceTracker.trackRelease(kind ?? kindOf(resource));
	try {
		resource.close();
	} catch {
		// A frame closed by its owner elsewhere is not worth failing over; the
		// counter above is what surfaces the double release.
	}
}

/**
 * Scoped ownership: the resource is closed on the way out, exception included.
 * This is the shape every decode loop should use.
 */
export function withResource<T extends Closeable, R>(resource: T, body: (value: T) => R): R {
	track(resource);
	try {
		return body(resource);
	} finally {
		release(resource);
	}
}

export async function withResourceAsync<T extends Closeable, R>(
	resource: T,
	body: (value: T) => Promise<R>,
): Promise<R> {
	track(resource);
	try {
		return await body(resource);
	} finally {
		release(resource);
	}
}

/**
 * Owns a set of resources and releases them together.
 *
 * A decode loop hands each frame to the scope; cancelling the export disposes
 * the scope and nothing is left open.
 */
export class ResourceScope {
	// The declared kind travels with the resource: releasing it later must
	// decrement the same counter its adoption incremented.
	readonly #owned = new Map<Closeable, ResourceKind | undefined>();
	#disposed = false;

	adopt<T extends Closeable>(resource: T, kind?: ResourceKind): T {
		if (this.#disposed) {
			release(resource, kind);
			throw new Error("cannot adopt into a disposed scope");
		}
		track(resource, kind);
		this.#owned.set(resource, kind);
		return resource;
	}

	/** Hands ownership back to the caller, who becomes responsible for closing. */
	disown<T extends Closeable>(resource: T): T {
		this.#owned.delete(resource);
		return resource;
	}

	releaseOne(resource: Closeable): void {
		if (!this.#owned.has(resource)) return;
		const kind = this.#owned.get(resource);
		this.#owned.delete(resource);
		release(resource, kind);
	}

	get size(): number {
		return this.#owned.size;
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		for (const [resource, kind] of this.#owned) release(resource, kind);
		this.#owned.clear();
	}
}

/**
 * Recycles frames in a decode loop rather than allocating one per frame.
 *
 * The pool never grows past `capacity`; anything beyond it is closed straight
 * away, so a slow consumer cannot turn the pool into the leak it exists to
 * prevent.
 */
export class ResourcePool<T extends Closeable> {
	readonly #available: T[] = [];

	constructor(readonly capacity: number) {}

	acquire(): T | undefined {
		return this.#available.pop();
	}

	recycle(resource: T): void {
		if (this.#available.length >= this.capacity) {
			release(resource);
			return;
		}
		this.#available.push(resource);
	}

	get size(): number {
		return this.#available.length;
	}

	drain(): void {
		for (const resource of this.#available) release(resource);
		this.#available.length = 0;
	}
}
