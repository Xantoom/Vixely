import { describe, expect, it } from 'vitest';
import type { SubtitleDoc } from './document';
import { defaultAssHeader } from './formats/ass';
import { assColor, deleteStyle, duplicateStyle, readStyles, toAssColor, toAssDoc, updateStyle } from './styles';

const header = defaultAssHeader('Test');
const head = `${header.head}\nStyle: Sign,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,10,10,10,1\n\n[Fonts]\nfontname: x.ttf\n`;
const doc: SubtitleDoc = {
	format: 'ass',
	cues: [
		{ id: 1, start: 0, end: 1000, text: 'Hello', fields: { style: 'Default' } },
		{ id: 2, start: 1000, end: 2000, text: 'EXIT', fields: { style: 'Sign' } },
	],
	ass: { ...header, head, styles: ['Default', 'Sign'] },
	vttHeader: null,
};

describe('ASS styles', () => {
	it('reads every style with its fields', () => {
		const { styles } = readStyles(head);
		expect(styles.map((style) => style.name)).toEqual(['Default', 'Sign']);
		expect(styles[1]?.bold).toBe('-1');
		expect(styles[1]?.alignment).toBe('8');
	});

	it('renames a style, and the lines using it follow', () => {
		const next = updateStyle(doc, 1, { name: 'Signs', fontsize: '48' });
		expect(next.ass?.styles).toEqual(['Default', 'Signs']);
		expect(readStyles(next.ass?.head ?? '').styles[1]?.fontsize).toBe('48');
		expect(next.cues[1]?.fields?.style).toBe('Signs');
		// The sections after the styles stay.
		expect(next.ass?.head).toContain('[Fonts]\nfontname: x.ttf');
	});

	it('duplicates and deletes, never the last one', () => {
		const copied = duplicateStyle(doc, 0);
		expect(copied.ass?.styles).toEqual(['Default', 'Default 2', 'Sign']);
		const deleted = deleteStyle(doc, 1);
		expect(deleted.ass?.styles).toEqual(['Default']);
		expect(deleted.cues[1]?.fields?.style).toBe('Default');
		expect(deleteStyle(deleted, 0)).toBe(deleted);
	});

	it('converts colours both ways', () => {
		expect(assColor('&H80FF8000')).toEqual({ hex: '#0080ff', opacity: 0.5 });
		expect(toAssColor('#0080ff', 1)).toBe('&H00FF8000');
	});

	it('makes SRT into ASS with its italics', () => {
		const srt: SubtitleDoc = {
			format: 'srt',
			cues: [{ id: 5, start: 0, end: 900, text: '<i>Hi</i>' }],
			ass: null,
			vttHeader: null,
		};
		const ass = toAssDoc(srt, 'Film');
		expect(ass.format).toBe('ass');
		expect(ass.ass?.styles).toEqual(['Default']);
		expect(ass.cues[0]?.text).toBe('{\\i1}Hi{\\i0}');
	});
});
