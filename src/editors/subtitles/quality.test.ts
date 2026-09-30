import { describe, expect, test } from 'vitest';
import type { Cue, SubtitleDoc } from './document';
import { checkLines } from './quality';

let id = 0;
const cue = (start: number, end: number, text: string): Cue => ({ id: ++id, start, end, text });
const srt = (...cues: Cue[]): SubtitleDoc => ({ format: 'srt', cues, ass: null, vttHeader: null });

describe('line checks', () => {
	test('a well made line has nothing to say', () => {
		const line = cue(0, 2000, 'Silver and iron as elements.');
		expect(checkLines(srt(line)).get(line.id)).toBeUndefined();
	});

	test('three lines, a long line, a fast one', () => {
		const three = cue(0, 3000, 'One\nTwo\nThree');
		const long = cue(4000, 9000, 'This line is far too long to be read comfortably on one line');
		const fast = cue(10000, 11000, 'Far too many words for one second on screen.');
		const issues = checkLines(srt(three, long, fast));
		expect(issues.get(three.id)).toContain('lines');
		expect(issues.get(long.id)).toContain('length');
		expect(issues.get(fast.id)).toContain('speed');
	});

	test('timing: too short, too long, a flickering gap, joined lines', () => {
		const short = cue(0, 500, 'Hi.');
		const long = cue(1000, 9000, 'Long.');
		const flicker = cue(10000, 12000, 'First.');
		const after = cue(12150, 14000, 'Second.');
		const joined = cue(20000, 22000, 'Joined.');
		const next = cue(22000, 24000, 'Next.');
		const issues = checkLines(srt(short, long, flicker, after, joined, next));
		expect(issues.get(short.id)).toContain('short');
		expect(issues.get(long.id)).toContain('long');
		expect(issues.get(flicker.id)).toContain('gap');
		expect(issues.get(joined.id)).toBeUndefined();
	});

	test('two lines of two overlapping make four on screen', () => {
		const a = cue(0, 3000, 'One\nTwo');
		const b = cue(1000, 4000, 'Three\nFour');
		const issues = checkLines(srt(a, b));
		expect(issues.get(a.id)).toContain('stack');
		expect(issues.get(b.id)).toContain('stack');
	});

	test('ASS signs are checked for timing only', () => {
		const sign: Cue = cue(0, 9000, '{\\pos(960,100)}A very long sign that goes on and on across the screen');
		const doc: SubtitleDoc = { format: 'ass', cues: [sign], ass: null, vttHeader: null };
		expect(checkLines(doc).get(sign.id)).toBeUndefined();
	});
});
