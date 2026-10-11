import { describe, expect, it } from 'vitest';
import { assFontEntry, attachmentsElement, withAssFonts, woffToSfnt } from './font-attach';
import { fontFamilies } from './font-names';

/** Reads back what `assFontEntry` wrote, as libass does. */
function decode(entry: string): Uint8Array {
	const text = entry.split('\n').slice(1).join('');
	const values = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index) - 33);
	const out: number[] = [];
	for (let index = 0; index < values.length; index += 4) {
		const group = values.slice(index, index + 4);
		const value = group.reduce((sum, part, at) => sum | (part << (18 - at * 6)), 0);
		out.push((value >> 16) & 255);
		if (group.length > 2) out.push((value >> 8) & 255);
		if (group.length > 3) out.push(value & 255);
	}
	return Uint8Array.from(out);
}

describe('assFontEntry', () => {
	it.each([0, 1, 2, 3, 100, 301])('writes %i bytes that read back the same', (length) => {
		const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 255);
		const entry = assFontEntry({ name: 'x.ttf', bytes });
		expect(entry.startsWith('fontname: x.ttf')).toBe(true);
		expect(
			entry
				.split('\n')
				.slice(1)
				.every((line) => line.length <= 80),
		).toBe(true);
		expect(decode(entry)).toEqual(bytes);
	});
});

describe('withAssFonts', () => {
	const script = '[Script Info]\nTitle: t\n\n[V4+ Styles]\nStyle: a\n\n[Events]\nDialogue: x\n';
	const font = { name: 'a.ttf', bytes: Uint8Array.of(1, 2, 3) };

	it('makes a [Fonts] section before the events', () => {
		expect(withAssFonts(script, [font])).toBe(
			'[Script Info]\nTitle: t\n\n[V4+ Styles]\nStyle: a\n\n[Fonts]\nfontname: a.ttf\n!1)$\n\n[Events]\nDialogue: x\n',
		);
	});

	it('adds to the section there, leaving fonts it has', () => {
		const once = withAssFonts(script, [font]);
		expect(withAssFonts(once, [font])).toBe(once);
		const twice = withAssFonts(once, [{ name: 'b.ttf', bytes: Uint8Array.of(4) }]);
		expect(twice).toContain('[Fonts]\nfontname: b.ttf\n"!\nfontname: a.ttf');
	});
});

describe('attachmentsElement', () => {
	it('keeps the files there and adds the fonts', () => {
		const existing = attachmentsElement(null, [{ name: 'old.ttf', bytes: Uint8Array.of(9) }]);
		const element = attachmentsElement(existing, [{ name: 'new.otf', bytes: Uint8Array.of(7, 7) }]);
		expect([...element.subarray(0, 4)]).toEqual([0x19, 0x41, 0xa4, 0x69]);
		const text = new TextDecoder('latin1').decode(element);
		expect(text.indexOf('old.ttf')).toBeLessThan(text.indexOf('new.otf'));
		expect(text).toContain('font/otf');
		const size = new DataView(element.buffer, 4, 8).getBigUint64(0) & 0x00ff_ffff_ffff_ffffn;
		expect(Number(size)).toBe(element.length - 12);
	});
});

describe('woffToSfnt', () => {
	const folders: [family: string, folder: string][] = [
		['Arimo', 'arimo'],
		['Tinos', 'tinos'],
		['Cousine', 'cousine'],
		['Gelasio', 'gelasio'],
		['Carlito', 'carlito'],
		['Comic Neue', 'comic-neue'],
		['Geist', 'geist'],
		['Geist Mono', 'geist-mono'],
		['Playfair Display', 'playfair-display'],
		['Anton', 'anton'],
		['Bebas Neue', 'bebas-neue'],
		['Oswald', 'oswald'],
		['Caveat', 'caveat'],
		['Pacifico', 'pacifico'],
		['Permanent Marker', 'permanent-marker'],
	];

	// Each font's regular Latin face, as a data address.
	const files = import.meta.glob<string>('/node_modules/@fontsource/*/files/*-latin-400-normal.woff', {
		query: '?inline',
		import: 'default',
		eager: true,
	});

	it.each(folders)('turns %s into a font that has its name', async (family, folder) => {
		const data = files[`/node_modules/@fontsource/${folder}/files/${folder}-latin-400-normal.woff`] ?? '';
		const woff = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (char) => char.charCodeAt(0));
		const sfnt = await woffToSfnt(woff);
		expect(sfnt).not.toBeNull();
		expect(fontFamilies(sfnt ?? new Uint8Array())).toContain(family);
	});
});
