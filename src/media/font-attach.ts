/**
 * Fonts carried inside a subtitle file or a video, so players draw the subtitles with them: the
 * `[Fonts]` section of an ASS script, the attachments of a Matroska file. Players read TrueType and
 * OpenType there; web fonts are turned into TrueType first.
 */

export interface FontAttachment {
	/** File name, with its extension: players tell fonts by it. */
	name: string;
	bytes: Uint8Array;
}

// ── WOFF to TrueType ──

const WOFF = 0x774f4646; // 'wOFF'

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The TrueType (or OpenType) font inside a WOFF file: its tables, unpacked, behind a new table
 * directory. Null when the bytes aren't WOFF.
 */
export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array | null> {
	const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
	if (woff.byteLength < 44 || view.getUint32(0) !== WOFF) return null;
	const flavor = view.getUint32(4);
	const count = view.getUint16(12);
	const tables = await Promise.all(
		Array.from({ length: count }, async (_, index) => {
			const entry = 44 + index * 20;
			const offset = view.getUint32(entry + 4);
			const packed = view.getUint32(entry + 8);
			const length = view.getUint32(entry + 12);
			const stored = woff.subarray(offset, offset + packed);
			return {
				tag: view.getUint32(entry),
				checksum: view.getUint32(entry + 16),
				data: packed < length ? await inflate(stored) : stored,
			};
		}),
	);
	const padded = (length: number) => (length + 3) & ~3;
	const size = 12 + count * 16 + tables.reduce((sum, table) => sum + padded(table.data.byteLength), 0);
	const out = new Uint8Array(size);
	const write = new DataView(out.buffer);
	// Binary search fields of the table directory, as the format asks.
	const power = 2 ** Math.floor(Math.log2(count));
	write.setUint32(0, flavor);
	write.setUint16(4, count);
	write.setUint16(6, power * 16);
	write.setUint16(8, Math.log2(power));
	write.setUint16(10, count * 16 - power * 16);
	let at = 12 + count * 16;
	for (const [index, table] of tables.entries()) {
		const record = 12 + index * 16;
		write.setUint32(record, table.tag);
		write.setUint32(record + 4, table.checksum);
		write.setUint32(record + 8, at);
		write.setUint32(record + 12, table.data.byteLength);
		out.set(table.data, at);
		at += padded(table.data.byteLength);
	}
	return out;
}

// ── ASS ──

/** A font as the `[Fonts]` section of an ASS script stores it: its name, then its bytes in text. */
export function assFontEntry(font: FontAttachment): string {
	const { bytes } = font;
	let text = '';
	const char = (value: number) => String.fromCharCode(value + 33);
	let index = 0;
	for (; index + 3 <= bytes.length; index += 3) {
		const value = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
		text += char(value >> 18) + char((value >> 12) & 63) + char((value >> 6) & 63) + char(value & 63);
	}
	// One or two bytes left are written as two or three characters.
	const left = bytes.length - index;
	if (left > 0) {
		const value = ((bytes[index] ?? 0) << 16) | (left > 1 ? (bytes[index + 1] ?? 0) << 8 : 0);
		text += char(value >> 18) + char((value >> 12) & 63) + (left > 1 ? char((value >> 6) & 63) : '');
	}
	const lines = text.match(/.{1,80}/g) ?? [];
	return [`fontname: ${font.name}`, ...lines].join('\n');
}

/** `script` with `fonts` in its `[Fonts]` section, made before the events when it has none. */
export function withAssFonts(script: string, fonts: readonly FontAttachment[]): string {
	const present = new Set([...script.matchAll(/^fontname:\s*(.+?)\s*$/gim)].map((match) => match[1]?.toLowerCase()));
	const entries = fonts.filter((font) => !present.has(font.name.toLowerCase())).map(assFontEntry);
	if (entries.length === 0) return script;
	const newline = script.includes('\r\n') ? '\r\n' : '\n';
	const block = entries.join('\n').replaceAll('\n', newline) + newline;
	const section = /^\[Fonts\][^\S\r\n]*\r?\n/im.exec(script);
	if (section) {
		const at = section.index + section[0].length;
		return script.slice(0, at) + block + script.slice(at);
	}
	const events = /^\[Events\]/im.exec(script);
	const at = events ? events.index : script.length;
	return `${script.slice(0, at)}[Fonts]${newline}${block}${newline}${script.slice(at)}`;
}

// ── Matroska ──

const ATTACHMENTS = 0x1941a469;
const ATTACHED_FILE = 0x61a7;
const FILE_NAME = 0x466e;
const FILE_MEDIA_TYPE = 0x4660;
const FILE_DATA = 0x465c;
const FILE_UID = 0x46ae;

function idBytes(id: number): number[] {
	const bytes: number[] = [];
	for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 255);
	return bytes;
}

/** An EBML element: its ID, its size on eight bytes, its content. */
function element(id: number, content: Uint8Array): Uint8Array {
	const head = idBytes(id);
	const out = new Uint8Array(head.length + 8 + content.length);
	out.set(head);
	const size = new DataView(out.buffer, head.length, 8);
	size.setUint32(0, Math.floor(content.length / 2 ** 32));
	size.setUint32(4, content.length >>> 0);
	out[head.length] = 0x01;
	out.set(content, head.length + 8);
	return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function mediaType(name: string): string {
	const extension = name.toLowerCase().split('.').pop();
	if (extension === 'otf') return 'font/otf';
	if (extension === 'ttc') return 'font/collection';
	return 'font/ttf';
}

/** The content of an EBML element: what follows its ID and size. */
function contentOf(element: Uint8Array): Uint8Array {
	let at = 0;
	// The ID's length is told by its first byte's leading zeros, and so is the size's.
	const width = (byte: number) => Math.clz32(byte) - 23;
	at += width(element[0] ?? 0);
	const sizeWidth = width(element[at] ?? 0);
	return element.subarray(at + sizeWidth);
}

/**
 * An Attachments element holding the files of `existing` (an Attachments element from the source,
 * kept as it is) and `fonts`.
 */
export function attachmentsElement(existing: Uint8Array | null, fonts: readonly FontAttachment[]): Uint8Array {
	const encoder = new TextEncoder();
	const files = fonts.map((font) => {
		const uid = new Uint8Array(8);
		crypto.getRandomValues(uid);
		uid[0] = (uid[0] ?? 0) | 1;
		return element(
			ATTACHED_FILE,
			concat([
				element(FILE_NAME, encoder.encode(font.name)),
				element(FILE_MEDIA_TYPE, encoder.encode(mediaType(font.name))),
				element(FILE_DATA, font.bytes),
				element(FILE_UID, uid),
			]),
		);
	});
	return element(ATTACHMENTS, concat([...(existing ? [contentOf(existing)] : []), ...files]));
}
