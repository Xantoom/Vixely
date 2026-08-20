import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	release,
	ResourcePool,
	ResourceScope,
	resourceTracker,
	track,
	withResource,
	withResourceAsync,
} from "~/core/resources";

/** Stands in for a VideoFrame: one explicit release, throws on a second. */
class FakeFrame {
	closed = false;

	close(): void {
		if (this.closed) throw new Error("already closed");
		this.closed = true;
	}
}

beforeEach(() => {
	resourceTracker.reset();
	resourceTracker.enable();
});

afterEach(() => {
	resourceTracker.disable();
	resourceTracker.reset();
});

describe("resource tracking (I4)", () => {
	it("counts allocations and releases", () => {
		const frame = track(new FakeFrame(), "VideoFrame");
		expect(resourceTracker.report("VideoFrame").outstanding).toBe(1);
		release(frame, "VideoFrame");
		expect(resourceTracker.report("VideoFrame").outstanding).toBe(0);
		expect(resourceTracker.balanced()).toBe(true);
	});

	it("surfaces an outstanding resource as a leak", () => {
		track(new FakeFrame(), "VideoFrame");
		track(new FakeFrame(), "VideoFrame");
		expect(resourceTracker.balanced()).toBe(false);
		expect(resourceTracker.report("VideoFrame").outstanding).toBe(2);
	});

	it("reports a double release, which is also a bug", () => {
		const onImbalance = vi.fn();
		resourceTracker.enable(onImbalance);
		const frame = track(new FakeFrame(), "VideoFrame");
		release(frame, "VideoFrame");
		release(frame, "VideoFrame");
		expect(onImbalance).toHaveBeenCalledOnce();
		expect(onImbalance.mock.calls[0]?.[0]).toMatchObject({ outstanding: -1 });
	});

	it("does nothing when disabled, so production pays no cost", () => {
		resourceTracker.disable();
		track(new FakeFrame(), "VideoFrame");
		expect(resourceTracker.report("VideoFrame").allocated).toBe(0);
	});

	it("ignores a null resource", () => {
		expect(() => release(null)).not.toThrow();
		expect(resourceTracker.balanced()).toBe(true);
	});
});

describe("scoped ownership", () => {
	it("closes on the way out", () => {
		const frame = new FakeFrame();
		withResource(frame, () => undefined);
		expect(frame.closed).toBe(true);
		expect(resourceTracker.balanced()).toBe(true);
	});

	it("closes even when the body throws", () => {
		const frame = new FakeFrame();
		expect(() =>
			withResource(frame, () => {
				throw new Error("decode failed");
			}),
		).toThrow("decode failed");
		expect(frame.closed).toBe(true);
		expect(resourceTracker.balanced()).toBe(true);
	});

	it("closes after an async body rejects", async () => {
		const frame = new FakeFrame();
		await expect(
			withResourceAsync(frame, async () => {
				throw new Error("encode failed");
			}),
		).rejects.toThrow("encode failed");
		expect(frame.closed).toBe(true);
		expect(resourceTracker.balanced()).toBe(true);
	});
});

describe("ResourceScope", () => {
	it("releases everything it owns at once", () => {
		const scope = new ResourceScope();
		const frames = Array.from({ length: 5 }, () => scope.adopt(new FakeFrame(), "VideoFrame"));
		expect(scope.size).toBe(5);
		scope.dispose();
		expect(frames.every((frame) => frame.closed)).toBe(true);
		expect(resourceTracker.balanced()).toBe(true);
	});

	it("leaves a disowned resource to its new owner", () => {
		const scope = new ResourceScope();
		const frame = scope.disown(scope.adopt(new FakeFrame(), "VideoFrame"));
		scope.dispose();
		expect(frame.closed).toBe(false);
		release(frame, "VideoFrame");
		expect(resourceTracker.balanced()).toBe(true);
	});

	it("is idempotent, and refuses to adopt after disposal", () => {
		const scope = new ResourceScope();
		scope.dispose();
		expect(() => scope.dispose()).not.toThrow();
		const orphan = new FakeFrame();
		expect(() => scope.adopt(orphan, "VideoFrame")).toThrow(/disposed/);
		// The rejected resource is still closed rather than left dangling.
		expect(orphan.closed).toBe(true);
	});

	it("stays balanced across 200 chained operations", () => {
		// Mirrors the leak test the phase exit criteria call for.
		const scope = new ResourceScope();
		for (let index = 0; index < 200; index++) {
			const frame = scope.adopt(new FakeFrame(), "VideoFrame");
			if (index % 3 === 0) scope.releaseOne(frame);
		}
		scope.dispose();
		expect(resourceTracker.report("VideoFrame").outstanding).toBe(0);
	});
});

describe("ResourcePool", () => {
	it("hands back a recycled resource instead of allocating", () => {
		const pool = new ResourcePool<FakeFrame>(2);
		expect(pool.acquire()).toBeUndefined();
		const frame = new FakeFrame();
		pool.recycle(frame);
		expect(pool.acquire()).toBe(frame);
	});

	it("closes anything beyond its capacity rather than growing", () => {
		const pool = new ResourcePool<FakeFrame>(2);
		const overflow = new FakeFrame();
		pool.recycle(new FakeFrame());
		pool.recycle(new FakeFrame());
		pool.recycle(overflow);
		expect(pool.size).toBe(2);
		expect(overflow.closed).toBe(true);
	});

	it("drains everything it holds", () => {
		const pool = new ResourcePool<FakeFrame>(4);
		const frames = Array.from({ length: 3 }, () => new FakeFrame());
		for (const frame of frames) pool.recycle(frame);
		pool.drain();
		expect(pool.size).toBe(0);
		expect(frames.every((frame) => frame.closed)).toBe(true);
	});
});
