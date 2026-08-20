/**
 * EBML reading.
 *
 * Matroska is EBML: nested elements, each a variable-length id, a
 * variable-length size, then its content. This reader walks that tree and does
 * one thing with it — find subtitle tracks and their blocks. It never looks at
 * video or audio: Mediabunny reads the same file for those, in parallel.
 *
 * The whole module is designed to be deleted (ADR 004e).
 */

export class EbmlParseError extends Error {
	constructor(
		message: string,
		readonly offset: number,
	) {
		super(`${message} at byte ${offset}`);
		this.name = "EbmlParseError";
	}
}

export type EbmlElement = {
	readonly id: number;
	readonly size: number;
	/** Offset of the content, not of the element header. */
	readonly contentOffset: number;
	readonly headerSize: number;
};

/** The element ids this reader needs. Anything else is skipped by size. */
export const EBML_IDS = {
	Segment: 0x18_53_80_67,
	Tracks: 0x16_54_ae_6b,
	TrackEntry: 0xae,
	TrackNumber: 0xd7,
	TrackType: 0x83,
	CodecID: 0x86,
	CodecPrivate: 0x63_a2,
	Language: 0x22_b5_9c,
	LanguageBCP47: 0x22_b5_9d,
	Name: 0x53_6e,
	FlagDefault: 0x88,
	FlagForced: 0x55_aa,
	Info: 0x15_49_a9_66,
	TimestampScale: 0x2a_d7_b1,
	Duration: 0x44_89,
	Cluster: 0x1f_43_b6_75,
	Timestamp: 0xe7,
	SimpleBlock: 0xa3,
	BlockGroup: 0xa0,
	Block: 0xa1,
	BlockDuration: 0x9b,
} as const;

/** Track type 0x11 is "subtitle" — the only one this module cares about. */
export const TRACK_TYPE_SUBTITLE = 0x11;

export class EbmlReader {
	readonly #view: DataView;
	readonly #bytes: Uint8Array;

	constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	get length(): number {
		return this.#bytes.length;
	}

	/** Reads an element header: its id, its size and where its content starts. */
	readElement(offset: number): EbmlElement {
		const id = this.readId(offset);
		const idLength = lengthOf(this.#bytes[offset] ?? 0);
		const sizeOffset = offset + idLength;
		const { value: size, length: sizeLength } = this.readSize(sizeOffset);

		return {
			id,
			size,
			contentOffset: sizeOffset + sizeLength,
			headerSize: idLength + sizeLength,
		};
	}

	/** Ids keep their length marker, which is what makes them comparable. */
	readId(offset: number): number {
		const first = this.#bytes[offset];
		if (first === undefined) throw new EbmlParseError("unexpected end of file", offset);
		const length = lengthOf(first);

		let id = 0;
		for (let index = 0; index < length; index++) {
			id = (id << 8) | (this.#bytes[offset + index] ?? 0);
		}
		// Bit-shifting a four-byte id overflows into a negative number.
		return id >>> 0;
	}

	/** Sizes drop their length marker, unlike ids. */
	readSize(offset: number): { value: number; length: number } {
		const first = this.#bytes[offset];
		if (first === undefined) throw new EbmlParseError("unexpected end of file", offset);
		const length = lengthOf(first);

		// All value bits set means "unknown size", used by live streams.
		let allOnes = (first & (0xff >> length)) === 0xff >> length;
		let value = first & (0xff >> length);

		for (let index = 1; index < length; index++) {
			const byte = this.#bytes[offset + index] ?? 0;
			if (byte !== 0xff) allOnes = false;
			value = value * 256 + byte;
		}

		return { value: allOnes ? Number.POSITIVE_INFINITY : value, length };
	}

	readUint(offset: number, size: number): number {
		let value = 0;
		for (let index = 0; index < size; index++) {
			value = value * 256 + (this.#bytes[offset + index] ?? 0);
		}
		return value;
	}

	readInt(offset: number, size: number): number {
		if (size === 0) return 0;
		let value = this.#bytes[offset] ?? 0;
		if ((value & 0x80) !== 0) value -= 0x100;
		for (let index = 1; index < size; index++) {
			value = value * 256 + (this.#bytes[offset + index] ?? 0);
		}
		return value;
	}

	readFloat(offset: number, size: number): number {
		if (size === 4) return this.#view.getFloat32(offset);
		if (size === 8) return this.#view.getFloat64(offset);
		return 0;
	}

	readString(offset: number, size: number): string {
		return new TextDecoder("utf-8").decode(this.#bytes.subarray(offset, offset + size));
	}

	readBytes(offset: number, size: number): Uint8Array {
		return this.#bytes.subarray(offset, offset + size);
	}

	/**
	 * Walks the direct children of a container.
	 *
	 * An unknown-size element (a live-streamed Segment or Cluster) is treated
	 * as running to the end of what is available rather than rejected: those
	 * files are common and perfectly readable.
	 */
	*children(contentOffset: number, size: number): Generator<EbmlElement, void, unknown> {
		const end = Number.isFinite(size) ? contentOffset + size : this.#bytes.length;
		let offset = contentOffset;

		while (offset < end && offset < this.#bytes.length) {
			const element = this.readElement(offset);
			yield element;

			const contentSize = Number.isFinite(element.size)
				? element.size
				: this.#bytes.length - element.contentOffset;
			offset = element.contentOffset + contentSize;
		}
	}
}

/** The leading one-bit says how many bytes the id or size occupies. */
function lengthOf(first: number): number {
	for (let length = 1; length <= 8; length++) {
		if ((first & (0x80 >> (length - 1))) !== 0) return length;
	}
	return 8;
}

/** Writes an EBML variable-length integer, used by the muxer. */
export function writeVint(value: number, minimumLength = 0): Uint8Array {
	let length = Math.max(1, minimumLength);
	while (length < 8 && value >= 2 ** (7 * length) - 1) length += 1;

	const bytes = new Uint8Array(length);
	let remaining = value;
	for (let index = length - 1; index >= 0; index--) {
		bytes[index] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}
	// The length marker goes in the top bits of the first byte.
	bytes[0] = (bytes[0] ?? 0) | (0x80 >> (length - 1));
	return bytes;
}

/** Writes an id, which already carries its own length marker. */
export function writeId(id: number): Uint8Array {
	const bytes: number[] = [];
	let remaining = id;
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining = Math.floor(remaining / 256);
	}
	return Uint8Array.from(bytes.length === 0 ? [0] : bytes);
}

export function writeUint(value: number, minimumLength = 1): Uint8Array {
	const bytes: number[] = [];
	let remaining = Math.max(0, Math.round(value));
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining = Math.floor(remaining / 256);
	}
	while (bytes.length < minimumLength) bytes.unshift(0);
	return Uint8Array.from(bytes);
}

export function writeInt(value: number): Uint8Array {
	const bytes: number[] = [];
	let remaining = Math.round(value);
	const negative = remaining < 0;

	if (negative) remaining = -remaining - 1;
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining = Math.floor(remaining / 256);
	}
	if (bytes.length === 0) bytes.push(0);
	// One more byte if the sign bit would be misread.
	if (((bytes[0] ?? 0) & 0x80) !== 0) bytes.unshift(0);
	if (negative) {
		for (const [index, byte] of bytes.entries()) bytes[index] = ~byte & 0xff;
	}

	return Uint8Array.from(bytes);
}

export function writeFloat64(value: number): Uint8Array {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setFloat64(0, value);
	return bytes;
}
