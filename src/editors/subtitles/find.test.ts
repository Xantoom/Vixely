import { describe, expect, it } from 'vitest';
import type { SubtitleDoc } from './document';
import { findMatches, replaceAll, replaceMatch } from './find';

const doc: SubtitleDoc = {
	format: 'srt',
	cues: [
		{ id: 1, start: 0, end: 1000, text: 'The cat sat on the mat.' },
		{ id: 2, start: 1000, end: 2000, text: 'Cats are not the Catalan.' },
		{ id: 3, start: 2000, end: 3000, text: 'hidden cat', comment: true },
	],
	ass: null,
	vttHeader: null,
};

const query = (text: string, options: Partial<{ matchCase: boolean; wholeWord: boolean; regex: boolean }> = {}) => ({
	text,
	matchCase: false,
	wholeWord: false,
	regex: false,
	...options,
});

describe('find and replace', () => {
	it('finds text in the shown lines, ignoring case by default', () => {
		expect(findMatches(doc, query('cat')).map((match) => match.id)).toEqual([1, 2, 2]);
		expect(findMatches(doc, query('Cat', { matchCase: true })).map((match) => match.id)).toEqual([2, 2]);
	});

	it('finds whole words only, accents included', () => {
		expect(findMatches(doc, query('cat', { wholeWord: true }))).toEqual([{ id: 1, index: 4, length: 3 }]);
		const french: SubtitleDoc = { ...doc, cues: [{ id: 9, start: 0, end: 1, text: 'été, étés' }] };
		expect(findMatches(french, query('été', { wholeWord: true }))).toHaveLength(1);
	});

	it('replaces one match, then all, with groups by expression', () => {
		const [first] = findMatches(doc, query('the'));
		const one = first ? replaceMatch(doc, query('the'), first, 'a') : doc;
		expect(one.cues[0]?.text).toBe('a cat sat on the mat.');
		const all = replaceAll(doc, query('(c)at', { regex: true }), '$1ow');
		expect(all.count).toBe(3);
		expect(all.doc.cues[0]?.text).toBe('The cow sat on the mat.');
		expect(all.doc.cues[1]?.text).toBe('Cows are not the Cowalan.');
		expect(all.doc.cues[2]?.text).toBe('hidden cat');
	});

	it('finds nothing with an invalid expression', () => {
		expect(findMatches(doc, query('(', { regex: true }))).toEqual([]);
	});
});
