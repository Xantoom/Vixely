import { describe, expect, it } from 'vitest';
import { toOutput, toSource } from '@/document/timemap';
import {
	createAudioDoc,
	cut,
	DECLICK,
	envelope,
	gainAt,
	keepOnly,
	keptRanges,
	outputDuration,
	restoreCut,
	setFades,
	setGain,
	setTrim,
} from './document';

describe('audio document', () => {
	it('keeps everything at first', () => {
		const doc = createAudioDoc(60);
		expect(keptRanges(doc)).toEqual([{ start: 0, end: 60 }]);
		expect(outputDuration(doc)).toBe(60);
	});

	it('removes passages and maps time around them', () => {
		const doc = cut(createAudioDoc(60), { start: 10, end: 20 });
		expect(keptRanges(doc)).toEqual([
			{ start: 0, end: 10 },
			{ start: 20, end: 60 },
		]);
		expect(outputDuration(doc)).toBe(50);
		const ranges = keptRanges(doc);
		expect(toOutput(ranges, 25)).toBe(15);
		// Inside the removed passage: where the output resumes.
		expect(toOutput(ranges, 15)).toBe(10);
		expect(toSource(ranges, 15)).toBe(25);
		expect(toSource(ranges, 500)).toBe(60);
	});

	it('merges overlapping cuts and restores them', () => {
		let doc = cut(createAudioDoc(60), { start: 10, end: 20 });
		doc = cut(doc, { start: 15, end: 30 });
		doc = cut(doc, { start: 40, end: 45 });
		expect(doc.cuts).toEqual([
			{ start: 10, end: 30 },
			{ start: 40, end: 45 },
		]);
		expect(restoreCut(doc, 0).cuts).toEqual([{ start: 40, end: 45 }]);
	});

	it('turns a cut at an edge into a trim', () => {
		const start = cut(createAudioDoc(60), { start: 0, end: 5 });
		expect(start.trim).toEqual({ start: 5, end: 60 });
		expect(start.cuts).toEqual([]);
		const end = cut(start, { start: 50, end: 70 });
		expect(end.trim).toEqual({ start: 5, end: 50 });
	});

	it('never removes everything', () => {
		const doc = createAudioDoc(60);
		expect(cut(doc, { start: 0, end: 60 })).toBe(doc);
		expect(setTrim(doc, { start: 30, end: 30 }).trim.end).toBeCloseTo(30.05);
		const cutDoc = cut(doc, { start: 10, end: 50 });
		expect(keepOnly(cutDoc, { start: 20, end: 40 })).toBe(cutDoc);
	});

	it('drops cuts outside a new trim and keeps those inside', () => {
		let doc = cut(createAudioDoc(60), { start: 10, end: 20 });
		doc = cut(doc, { start: 40, end: 45 });
		doc = keepOnly(doc, { start: 30, end: 60 });
		expect(doc.trim).toEqual({ start: 30, end: 60 });
		expect(doc.cuts).toEqual([{ start: 40, end: 45 }]);
	});

	it('builds a volume curve with gain, fades and dips at cuts', () => {
		let doc = setGain(createAudioDoc(10), 6);
		doc = setFades(doc, { fadeIn: 2, fadeOut: 1 });
		const points = envelope(doc);
		const full = 10 ** (6 / 20);
		expect(gainAt(points, 0)).toBe(0);
		expect(gainAt(points, 1)).toBeCloseTo(full / 2, 2);
		expect(gainAt(points, 5)).toBeCloseTo(full);
		expect(gainAt(points, 10)).toBe(0);

		const cutDoc = cut(createAudioDoc(10), { start: 4, end: 6 });
		const dips = envelope(cutDoc);
		expect(gainAt(dips, 4)).toBe(0);
		expect(gainAt(dips, 4 - DECLICK / 2)).toBeCloseTo(0.5);
		expect(gainAt(dips, 3)).toBe(1);
	});

	it('shares the output between fades that are too long', () => {
		const doc = setFades(createAudioDoc(4), { fadeIn: 6, fadeOut: 2 });
		const points = envelope(doc);
		// 6 + 2 seconds of fades in 4 seconds: the fade in takes 3, the fade out 1.
		expect(gainAt(points, 3)).toBeCloseTo(1);
		expect(gainAt(points, 1.5)).toBeCloseTo(0.5, 2);
	});
});
