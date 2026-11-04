import { describe, expect, test } from 'vitest';
import { cut, type Kept, keptRanges, restoreCut, setTrim } from './kept';

const doc = (): Kept => ({ duration: 10, trim: { start: 0, end: 10 }, cuts: [] });

describe('kept ranges', () => {
	test('a passage removed inside the trim leaves two ranges', () => {
		expect(keptRanges(cut(doc(), { start: 4, end: 7 }))).toEqual([
			{ start: 0, end: 4 },
			{ start: 7, end: 10 },
		]);
	});

	test('removing the start moves the trim', () => {
		const removed = cut(doc(), { start: 0, end: 3 });
		expect(removed.trim).toEqual({ start: 3, end: 10 });
		expect(removed.cuts).toEqual([]);
	});

	test('a passage restored comes back', () => {
		expect(keptRanges(restoreCut(cut(doc(), { start: 4, end: 7 }), 0))).toEqual([{ start: 0, end: 10 }]);
	});

	test('cuts outside the trim are dropped', () => {
		expect(setTrim(cut(doc(), { start: 7, end: 8 }), { start: 0, end: 6 }).cuts).toEqual([]);
	});
});
