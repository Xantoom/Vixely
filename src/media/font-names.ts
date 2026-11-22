/**
 * The family names a font file declares, read from its `name` table: what subtitles call the font
 * by. TrueType and OpenType files, and each font of a collection (.ttc). Compressed web fonts
 * (WOFF, WOFF2) are not read: their names stay unknown.
 */

const TRUETYPE = 0x00010000;
const OPENTYPE = 0x4f54544f; // 'OTTO'
const TRUE = 0x74727565; // 'true', old Mac TrueType
const COLLECTION = 0x74746366; // 'ttcf'
const NAME_TABLE = 0x6e616d65; // 'name'

/** Family (1) and typographic family (16): the second groups more weights under one name. */
const FAMILY_IDS = new Set([1, 16]);

export function fontFamilies(bytes: Uint8Array): string[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.byteLength < 12) return [];
	const tag = view.getUint32(0);
	const offsets: number[] = [];
	if (tag === COLLECTION) {
		const count = view.getUint32(8);
		for (let index = 0; index < count && 12 + index * 4 + 4 <= bytes.byteLength; index++) {
			offsets.push(view.getUint32(12 + index * 4));
		}
	} else if (tag === TRUETYPE || tag === OPENTYPE || tag === TRUE) {
		offsets.push(0);
	}
	const names = new Set<string>();
	for (const offset of offsets) {
		for (const name of fontNames(view, offset)) names.add(name);
	}
	return [...names];
}

function fontNames(view: DataView, font: number): string[] {
	try {
		const tables = view.getUint16(font + 4);
		for (let index = 0; index < tables; index++) {
			const record = font + 12 + index * 16;
			if (view.getUint32(record) !== NAME_TABLE) continue;
			return nameTable(view, view.getUint32(record + 8));
		}
	} catch {
		// A file cut short or not a font: no names.
	}
	return [];
}

function nameTable(view: DataView, table: number): string[] {
	const count = view.getUint16(table + 2);
	const strings = table + view.getUint16(table + 4);
	const names: string[] = [];
	for (let index = 0; index < count; index++) {
		const record = table + 6 + index * 12;
		const platform = view.getUint16(record);
		const encoding = view.getUint16(record + 2);
		const id = view.getUint16(record + 6);
		if (!FAMILY_IDS.has(id)) continue;
		const length = view.getUint16(record + 8);
		const start = strings + view.getUint16(record + 10);
		const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
		// Windows and Unicode names are UTF-16; Mac Roman ones are close enough to Latin-1 for names.
		const text =
			platform === 3 || platform === 0
				? new TextDecoder('utf-16be').decode(bytes)
				: platform === 1 && encoding === 0
					? new TextDecoder('latin1').decode(bytes)
					: '';
		const name = text.replace(/\0/g, '').trim();
		if (name) names.push(name);
	}
	return names;
}
