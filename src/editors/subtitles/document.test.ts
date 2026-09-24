import { describe, expect, it } from 'vitest';
import { duplicateCue, gridLines, insertAfter, joinWithNext, NEW_CUE, splitCue, type SubtitleDoc } from './document';

function doc(format: SubtitleDoc['format'] = 'srt'): SubtitleDoc {
	return {
		format,
		cues: [
			{ id: 1, start: 1000, end: 2000, text: 'One' },
			{ id: 2, start: 5000, end: 6000, text: 'Two', comment: true },
			{ id: 3, start: 3000, end: 4000, text: 'Three' },
		],
		ass: null,
		vttHeader: null,
	};
}

describe('line operations', () => {
	it('lists lines in file order without comments', () => {
		expect(gridLines(doc()).map((cue) => cue.id)).toEqual([1, 3]);
	});

	it('inserts a line after another, starting where it ends', () => {
		const result = insertAfter(doc(), 1);
		const cues = result.doc.cues;
		expect(cues[1]).toMatchObject({ id: result.id, start: 2000, end: 2000 + NEW_CUE, text: '' });
	});

	it('duplicates a line right after it', () => {
		const result = duplicateCue(doc(), 3);
		expect(result.doc.cues.at(-1)).toMatchObject({ id: result.id, start: 3000, text: 'Three' });
	});

	it('joins a line with the next shown one, skipping comments', () => {
		const joined = joinWithNext(doc(), 1);
		expect(joined.cues.map((cue) => cue.id)).toEqual([1, 2]);
		expect(joined.cues[0]).toMatchObject({ start: 1000, end: 4000, text: 'One\nThree' });
		expect(joinWithNext(doc('ass'), 1).cues[0]?.text).toBe('One\\NThree');
	});

	it('splits a line at a time and at the caret', () => {
		const source = { ...doc(), cues: [{ id: 1, start: 0, end: 4000, text: 'Hello there\nworld' }] };
		const result = splitCue(source, 1, 1500, 11);
		expect(result.doc.cues.map(({ start, end, text }) => ({ start, end, text }))).toEqual([
			{ start: 0, end: 1500, text: 'Hello there' },
			{ start: 1500, end: 4000, text: 'world' },
		]);
		// Too close to an edge: nothing to split.
		expect(splitCue(source, 1, 20, 3).doc).toBe(source);
	});
});
