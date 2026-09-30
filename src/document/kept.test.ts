import { describe, expect, test } from 'vitest';
import { clipsOf, cut, joinAt, type Kept, restoreCut, setTrim, splitAt } from './kept';

const doc = (): Kept => ({ duration: 10, trim: { start: 0, end: 10 }, cuts: [] });

describe('clips', () => {
	test('a split makes two clips, the output unchanged', () => {
		const split = splitAt(doc(), 4);
		expect(clipsOf(split)).toEqual([
			{ start: 0, end: 4 },
			{ start: 4, end: 10 },
		]);
		expect(split.cuts).toEqual([]);
	});

	test('removing a clip removes only it, and its splits with it', () => {
		const split = splitAt(splitAt(doc(), 4), 7);
		const removed = cut(split, { start: 4, end: 7 });
		expect(clipsOf(removed)).toEqual([
			{ start: 0, end: 4 },
			{ start: 7, end: 10 },
		]);
		expect(removed.splits).toEqual([]);
	});

	test('removing the first clip moves the start', () => {
		const removed = cut(splitAt(doc(), 3), { start: 0, end: 3 });
		expect(removed.trim).toEqual({ start: 3, end: 10 });
		expect(clipsOf(removed)).toEqual([{ start: 3, end: 10 }]);
	});

	test('a passage restored comes back as a clip of its own', () => {
		const removed = cut(doc(), { start: 4, end: 7 });
		expect(clipsOf(restoreCut(removed, 0))).toEqual([
			{ start: 0, end: 4 },
			{ start: 4, end: 7 },
			{ start: 7, end: 10 },
		]);
	});

	test('splits outside the kept part are dropped, joined ones go', () => {
		const split = splitAt(doc(), 8);
		expect(setTrim(split, { start: 0, end: 6 }).splits).toEqual([]);
		expect(joinAt(split, 8).splits).toEqual([]);
		expect(splitAt(doc(), 0)).toEqual(doc());
	});
});
