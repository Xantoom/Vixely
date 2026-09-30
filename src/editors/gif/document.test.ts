import { describe, expect, it } from 'vitest';
import {
	createGifDoc,
	duplicateFrames,
	fadeAmount,
	frameAt,
	frameKey,
	frameLayout,
	moveFrame,
	moveFrames,
	setFrameDelays,
	framesUntouched,
	outputFrames,
	outputLength,
	setTrim,
} from './document';

/** Ten frames of 100 ms. */
const timing = Array.from({ length: 10 }, (_, i) => ({ start: i / 10, duration: 0.1 }));

describe('gif document', () => {
	it('keeps the source frames and timing by default', () => {
		const frames = outputFrames(createGifDoc(1, null), timing);
		expect(frames).toHaveLength(10);
		expect(frames[3]?.source).toBe(0.3);
		expect(frames[3]?.start).toBeCloseTo(0.3);
		expect(frames[3]?.duration).toBeCloseTo(0.1);
		expect(outputLength(frames)).toBeCloseTo(1);
	});

	it('trims and speeds up the source frames', () => {
		let doc = setTrim(createGifDoc(1, null), { start: 0.25, end: 0.75 });
		doc = { ...doc, speed: 2 };
		const frames = outputFrames(doc, timing);
		// 0.25–0.3 (shortened), 0.3 … 0.6, 0.7–0.75: six frames, 0.25 s at double speed.
		expect(frames).toHaveLength(6);
		expect(frames[0]?.source).toBeCloseTo(0.25);
		expect(outputLength(frames)).toBeCloseTo(0.25);
	});

	it('shows frames as long as asked, in the order asked', () => {
		const doc = { ...createGifDoc(1, null), delays: { [frameKey(0.2)]: 0.5 }, order: [frameKey(0.2), frameKey(0)] };
		const frames = outputFrames(doc, timing);
		expect(frames.map((frame) => frame.source).slice(0, 3)).toEqual([0.2, 0, 0.1]);
		expect(frames[0]?.duration).toBeCloseTo(0.5);
		expect(outputLength(frames)).toBeCloseTo(1.4);
		expect(framesUntouched(doc)).toBe(false);
	});

	it('moves a frame and sets frame delays', () => {
		let doc = moveFrame({ ...createGifDoc(1, null), removed: [frameKey(0.5)] }, timing, frameKey(0.8), 0);
		expect(
			outputFrames(doc, timing)
				.map((frame) => frame.source)
				.slice(0, 2),
		).toEqual([0.8, 0]);
		doc = setFrameDelays({ ...doc, speed: 2 }, [frameKey(0.8)], 0.3);
		expect(outputFrames(doc, timing)[0]?.duration).toBeCloseTo(0.3);
	});

	it('moves several frames together, in their order', () => {
		const doc = moveFrames(createGifDoc(1, null), timing, [frameKey(0.7), frameKey(0.2)], 0);
		expect(
			outputFrames(doc, timing)
				.map((frame) => frame.source)
				.slice(0, 4),
		).toEqual([0.2, 0.7, 0, 0.1]);
	});

	it('copies frames right after themselves, each timed and left out on its own', () => {
		const start = setFrameDelays(createGifDoc(1, null), [frameKey(0.3)], 0.4);
		const { doc, copies } = duplicateFrames(start, timing, [frameKey(0.3), frameKey(0.5)]);
		expect(copies).toHaveLength(2);
		expect(copies.every((copy) => copy < 0)).toBe(true);
		const frames = outputFrames(doc, timing);
		expect(frames).toHaveLength(12);
		expect(frames.slice(3, 5).map((frame) => frame.source)).toEqual([0.3, 0.3]);
		expect(frames[4]?.key).toBe(copies[0]);
		expect(frames[4]?.duration).toBeCloseTo(0.4);
		expect(outputLength(frames)).toBeCloseTo(1.8);
		expect(framesUntouched(doc)).toBe(false);

		// A copy of a copy shows the same frame; removing a copy keeps its frame.
		const again = duplicateFrames(doc, timing, [copies[0] ?? 0]);
		expect(new Set(again.copies).size).toBe(1);
		expect(copies).not.toContain(again.copies[0]);
		const removed = outputFrames({ ...again.doc, removed: [copies[0] ?? 0] }, timing);
		expect(removed.filter((frame) => frame.source === 0.3)).toHaveLength(2);
	});

	it('samples at a fixed rate when one is chosen', () => {
		const frames = outputFrames({ ...createGifDoc(4, 15), trim: { start: 1, end: 3 } }, null);
		expect(frames).toHaveLength(30);
		expect(frames[15]?.source).toBeCloseTo(2);
		expect(outputLength(frames)).toBeCloseTo(2);
	});

	it('plays backwards and back and forth', () => {
		const reverse = outputFrames({ ...createGifDoc(1, null), direction: 'reverse' }, timing);
		expect(reverse.map((frame) => frame.source)).toEqual(timing.map((frame) => frame.start).toReversed());
		const pingpong = outputFrames({ ...createGifDoc(1, null), direction: 'pingpong' }, timing);
		// Forward 10, then 8 back: the end frames are not shown twice.
		expect(pingpong).toHaveLength(18);
		expect(pingpong[10]?.source).toBeCloseTo(0.8);
		expect(pingpong.at(-1)?.source).toBeCloseTo(0.1);
	});

	it('finds the frame playing at a moment', () => {
		const frames = outputFrames(createGifDoc(1, null), timing);
		expect(frameAt(frames, 0.55)?.source).toBeCloseTo(0.5);
		expect(frameAt(frames, 5)?.source).toBeCloseTo(0.9);
		expect(frameAt(frames, -1)?.source).toBe(0);
	});

	it('leaves out removed frames and keeps one in n, each as long as those it stands for', () => {
		const doc = { ...createGifDoc(1, null), removed: [frameKey(0.3)] };
		expect(outputFrames(doc, timing)).toHaveLength(9);
		expect(outputLength(outputFrames(doc, timing))).toBeCloseTo(0.9);
		const skipped = outputFrames({ ...createGifDoc(1, null), skip: 3 }, timing);
		expect(skipped.map((frame) => frame.source)).toEqual([0, 0.3, 0.6, 0.9]);
		expect(skipped[0]?.duration).toBeCloseTo(0.3);
		expect(skipped[3]?.duration).toBeCloseTo(0.1);
		expect(outputLength(skipped)).toBeCloseTo(1);
	});

	it('fades in and out over their lengths', () => {
		const fade = { in: 0.5, out: 1, color: 'black' as const };
		expect(fadeAmount(fade, 0, 4)).toBe(1);
		expect(fadeAmount(fade, 0.25, 4)).toBeCloseTo(0.5);
		expect(fadeAmount(fade, 2, 4)).toBe(0);
		expect(fadeAmount(fade, 3.5, 4)).toBeCloseTo(0.5);
	});

	it('lays the picture out in bands, scaled to the width', () => {
		const doc = { ...createGifDoc(1, null), bands: { ratio: 1, color: null } };
		const layout = frameLayout(doc, { width: 400, height: 200 }, 200);
		expect(layout).toEqual({ width: 200, height: 200, content: { x: 0, y: 50, width: 200, height: 100 } });
		// A quarter turn makes the picture tall: the bands go to the sides.
		const turned = frameLayout(
			{ ...doc, picture: { ...doc.picture, rotation: 90 } },
			{ width: 400, height: 200 },
			null,
		);
		expect(turned).toEqual({ width: 400, height: 400, content: { x: 100, y: 0, width: 200, height: 400 } });
		expect(frameLayout(createGifDoc(1, null), { width: 301, height: 151 }, null, true)).toMatchObject({
			width: 300,
			height: 150,
		});
	});

	it('knows when the frames are still the source’s own', () => {
		const doc = createGifDoc(1, null);
		expect(framesUntouched(doc)).toBe(true);
		expect(framesUntouched({ ...doc, skip: 2 })).toBe(false);
		expect(framesUntouched({ ...doc, picture: { ...doc.picture, flipX: true } })).toBe(false);
		expect(framesUntouched({ ...doc, fade: { ...doc.fade, out: 1 } })).toBe(false);
	});
});
