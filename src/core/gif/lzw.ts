/**
 * GIF LZW compression.
 *
 * Written here rather than pulled in: it is under 150 lines, and the anti-goal
 * about dependencies exists precisely for code of this size. The algorithm is
 * the one the GIF89a specification describes — variable-width codes from
 * `minimumCodeSize + 1` bits, a dictionary reset when it fills, and output
 * packed LSB-first into sub-blocks of at most 255 bytes.
 */

const MAX_CODE = 4095;

/** Packs codes of a growing bit width, least significant bit first. */
class BitWriter {
	readonly #bytes: number[] = [];
	#current = 0;
	#bits = 0;

	write(code: number, width: number): void {
		this.#current |= code << this.#bits;
		this.#bits += width;
		while (this.#bits >= 8) {
			this.#bytes.push(this.#current & 0xff);
			this.#current >>= 8;
			this.#bits -= 8;
		}
	}

	finish(): number[] {
		if (this.#bits > 0) {
			this.#bytes.push(this.#current & 0xff);
			this.#current = 0;
			this.#bits = 0;
		}
		return this.#bytes;
	}
}

export function lzwEncode(indices: Uint8Array, minimumCodeSize: number): Uint8Array {
	const clearCode = 1 << minimumCodeSize;
	const endCode = clearCode + 1;

	let codeWidth = minimumCodeSize + 1;
	let nextCode = endCode + 1;
	let dictionary = new Map<string, number>();

	const writer = new BitWriter();
	writer.write(clearCode, codeWidth);

	if (indices.length === 0) {
		writer.write(endCode, codeWidth);
		return packSubBlocks(writer.finish());
	}

	let prefix = String(indices[0]);

	for (let position = 1; position < indices.length; position++) {
		const value = indices[position] ?? 0;
		const candidate = `${prefix},${value}`;
		const known = dictionary.get(candidate);

		if (known !== undefined) {
			prefix = candidate;
			continue;
		}

		writer.write(codeFor(prefix, dictionary), codeWidth);
		dictionary.set(candidate, nextCode);
		nextCode += 1;

		if (nextCode > MAX_CODE) {
			// The dictionary is full: reset it rather than stop growing, which
			// is what keeps long animations from degrading into raw output.
			writer.write(clearCode, codeWidth);
			dictionary = new Map();
			nextCode = endCode + 1;
			codeWidth = minimumCodeSize + 1;
		} else if (nextCode - 1 === 1 << codeWidth && codeWidth < 12) {
			codeWidth += 1;
		}

		prefix = String(value);
	}

	writer.write(codeFor(prefix, dictionary), codeWidth);
	writer.write(endCode, codeWidth);

	return packSubBlocks(writer.finish());
}

/** Single values are their own code; longer runs come from the dictionary. */
function codeFor(sequence: string, dictionary: ReadonlyMap<string, number>): number {
	const known = dictionary.get(sequence);
	if (known !== undefined) return known;
	return Number(sequence.includes(",") ? sequence.split(",").pop() : sequence);
}

/** GIF stores image data as length-prefixed blocks of at most 255 bytes. */
function packSubBlocks(bytes: readonly number[]): Uint8Array {
	const output: number[] = [];
	for (let offset = 0; offset < bytes.length; offset += 255) {
		const chunk = bytes.slice(offset, offset + 255);
		output.push(chunk.length, ...chunk);
	}
	output.push(0);
	return Uint8Array.from(output);
}

/**
 * Decompresses LZW data. Used by the tests to prove the encoder round-trips,
 * and by the decoder fallback where `ImageDecoder` is unavailable.
 */
export function lzwDecode(
	data: Uint8Array,
	minimumCodeSize: number,
	pixelCount: number,
): Uint8Array {
	const clearCode = 1 << minimumCodeSize;
	const endCode = clearCode + 1;

	const output = new Uint8Array(pixelCount);
	let written = 0;

	let dictionary: number[][] = [];
	const resetDictionary = () => {
		dictionary = Array.from({ length: clearCode + 2 }, (_, index) =>
			index < clearCode ? [index] : [],
		);
	};
	resetDictionary();

	let codeWidth = minimumCodeSize + 1;
	let previous: number[] | null = null;
	let bitBuffer = 0;
	let bitCount = 0;
	let position = 0;

	while (position < data.length || bitCount >= codeWidth) {
		while (bitCount < codeWidth && position < data.length) {
			bitBuffer |= (data[position] ?? 0) << bitCount;
			bitCount += 8;
			position += 1;
		}
		if (bitCount < codeWidth) break;

		const code = bitBuffer & ((1 << codeWidth) - 1);
		bitBuffer >>= codeWidth;
		bitCount -= codeWidth;

		if (code === clearCode) {
			resetDictionary();
			codeWidth = minimumCodeSize + 1;
			previous = null;
			continue;
		}
		if (code === endCode) break;

		const known = dictionary[code];
		let entry: number[];
		if (known !== undefined) {
			entry = known;
		} else if (previous !== null) {
			entry = [...previous, previous[0] ?? 0];
		} else {
			break;
		}

		for (const value of entry) {
			if (written < output.length) output[written++] = value;
		}

		if (previous !== null) {
			dictionary.push([...previous, entry[0] ?? 0]);
			if (dictionary.length === 1 << codeWidth && codeWidth < 12) codeWidth += 1;
		}
		previous = entry;
	}

	return output;
}

/** Strips the sub-block framing, which is what `lzwDecode` expects. */
export function unpackSubBlocks(data: Uint8Array): Uint8Array {
	const output: number[] = [];
	let position = 0;
	while (position < data.length) {
		const length = data[position] ?? 0;
		if (length === 0) break;
		for (let offset = 1; offset <= length; offset++) {
			output.push(data[position + offset] ?? 0);
		}
		position += length + 1;
	}
	return Uint8Array.from(output);
}
