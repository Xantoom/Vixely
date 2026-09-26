import { describe, expect, it } from 'vitest';
import {
	createGifDoc,
	fadeAmount,
	frameAt,
	frameKey,
	frameLayout,
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
