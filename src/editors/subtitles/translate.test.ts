import { describe, expect, it } from 'vitest';
import type { SubtitleDoc } from './document';
import { fileLanguage } from './project';
import { translationTrack, untranslated } from './translate';

const source: SubtitleDoc = {
	format: 'srt',
	cues: [
		{ id: 1, start: 1000, end: 2000, text: '<i>Bonjour</i>' },
		{ id: 2, start: 3000, end: 4000, text: 'Au revoir' },
	],
	ass: null,
	vttHeader: null,
};

describe('translation', () => {
	it('keeps every line with its times, empty, the original beside it', () => {
		const track = translationTrack(source, 'file', 'eng');
		expect(track.language).toBe('eng');
		expect(track.doc.cues.map((cue) => [cue.start, cue.end, cue.text])).toEqual([
			[1000, 2000, ''],
			[3000, 4000, ''],
		]);
		const texts = track.origin?.texts ?? new Map();
		expect([...texts.values()]).toEqual(['Bonjour', 'Au revoir']);
		expect(untranslated(track.doc, texts)).toBe(2);
		const [first, second] = track.doc.cues;
		const done = { ...track.doc, cues: [{ ...first!, text: 'Hello' }, second!] };
		expect(untranslated(done, texts)).toBe(1);
	});

	it('reads the language players read from subtitle file names', () => {
		expect(fileLanguage('film.fr.srt')).toBe('fre');
		expect(fileLanguage('film.eng.forced.srt')).toBe('eng');
		expect(fileLanguage('film.srt')).toBe('und');
	});
});
