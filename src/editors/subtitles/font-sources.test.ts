import { describe, expect, it, vi } from 'vitest';
import { renameFonts, resolveFonts, scriptFamilies } from './font-sources';

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour
Style: Default,Arial,48,&H00FFFFFF
Style: Sign,Trebuchet MS,40,&H00FFFFFF
Style: Title, impact ,60,&H00FFFFFF

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fnCourier New\\b1}Typed{\\fn@Arial}up
Dialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,No tag, \\fnArial outside a block is text
`;

describe('scriptFamilies', () => {
	it('reads the fonts of styles and of \\fn tags, each once', () => {
		expect(scriptFamilies(SCRIPT)).toEqual(['Arial', 'Trebuchet MS', 'impact', 'Courier New']);
	});
});

describe('renameFonts', () => {
	it('renames styles and tags, keeping the rest of the line and the vertical mark', () => {
		const renamed = renameFonts(
			SCRIPT,
			new Map([
				['arial', 'Arimo'],
				['impact', 'Anton'],
			]),
		);
		expect(renamed).toContain('Style: Default,Arimo,48,&H00FFFFFF');
		expect(renamed).toContain('Style: Sign,Trebuchet MS,40,&H00FFFFFF');
		expect(renamed).toContain('Style: Title,Anton,60,&H00FFFFFF');
		expect(renamed).toContain('{\\fnCourier New\\b1}Typed{\\fn@Arimo}up');
		expect(renamed).toContain('\\fnArial outside');
	});

	it('leaves a script without renames as it is', () => {
		expect(renameFonts(SCRIPT, new Map())).toBe(SCRIPT);
	});
});

describe('resolveFonts', () => {
	vi.stubGlobal('location', { href: 'https://vixely.test/' });

	it('draws known names with Vixely fonts and says which are missing', async () => {
		const { choices, renames } = await resolveFonts(['Arial', 'Anton', 'Trebuchet MS'], []);
		expect(choices.map((choice) => choice.origin)).toEqual(['equivalent', 'vixely', 'missing']);
		expect(renames.get('arial')).toBe('Arimo');
	});
});
