/**
 * Character sets of subtitle files. Recent files are UTF-8, but many older SRT files use the
 * Windows code page of their language, which nothing in the file names. The editor guesses, shows
 * its guess, and lets the user pick another when the text looks wrong.
 */

export const ENCODINGS = [
	{ id: 'utf-8', label: 'UTF-8' },
	{ id: 'utf-16le', label: 'UTF-16 LE' },
	{ id: 'utf-16be', label: 'UTF-16 BE' },
	{ id: 'windows-1252', label: 'Windows-1252 (Western Europe)' },
	{ id: 'windows-1250', label: 'Windows-1250 (Central Europe)' },
	{ id: 'windows-1251', label: 'Windows-1251 (Cyrillic)' },
	{ id: 'windows-1253', label: 'Windows-1253 (Greek)' },
	{ id: 'windows-1254', label: 'Windows-1254 (Turkish)' },
	{ id: 'windows-1255', label: 'Windows-1255 (Hebrew)' },
	{ id: 'windows-1256', label: 'Windows-1256 (Arabic)' },
	{ id: 'windows-1257', label: 'Windows-1257 (Baltic)' },
	{ id: 'windows-1258', label: 'Windows-1258 (Vietnamese)' },
	{ id: 'windows-874', label: 'Windows-874 (Thai)' },
	{ id: 'iso-8859-2', label: 'ISO-8859-2 (Central Europe)' },
	{ id: 'koi8-r', label: 'KOI8-R (Russian)' },
	{ id: 'shift_jis', label: 'Shift JIS (Japanese)' },
	{ id: 'euc-kr', label: 'EUC-KR (Korean)' },
	{ id: 'gbk', label: 'GBK (Simplified Chinese)' },
	{ id: 'big5', label: 'Big5 (Traditional Chinese)' },
] as const;

export type EncodingId = (typeof ENCODINGS)[number]['id'];

export function encodingLabel(id: EncodingId): string {
	return ENCODINGS.find((encoding) => encoding.id === id)?.label ?? id;
}

/**
 * The character set of a file: its byte order mark when there is one, UTF-16 when every other
 * byte is zero, UTF-8 when the bytes are valid UTF-8, Windows-1252 otherwise.
 */
export function detectEncoding(bytes: Uint8Array): EncodingId {
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
	const sample = bytes.subarray(0, 4096);
	let evenZeros = 0;
	let oddZeros = 0;
	for (let i = 0; i < sample.length; i++) {
		if (sample[i] !== 0) continue;
		if (i % 2 === 0) evenZeros++;
		else oddZeros++;
	}
	const half = sample.length / 2;
	if (oddZeros > half * 0.3 && evenZeros < half * 0.05) return 'utf-16le';
	if (evenZeros > half * 0.3 && oddZeros < half * 0.05) return 'utf-16be';
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		return 'utf-8';
	} catch {
		return 'windows-1252';
	}
}

/** Text of a file in a character set, byte order mark removed. */
export function decodeText(bytes: Uint8Array, encoding: EncodingId): string {
	return new TextDecoder(encoding).decode(bytes);
}
