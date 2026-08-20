/**
 * PGS (Presentation Graphic Stream), the subtitle format on Blu-ray discs.
 *
 * PGS carries *images*, not text: run-length encoded bitmaps with a palette,
 * split into display sets. There is no text anywhere in the file, which is why
 * timings, position, order and track selection are editable and the words are
 * not — recognising them would mean OCR, and that decision was made against
 * (ADR 004c). Decoding the RLE is what lets the editor show the subtitle
 * correctly rather than as an opaque blob.
 */

export type PgsSegmentType = "PDS" | "ODS" | "PCS" | "WDS" | "END" | "unknown";

export type PgsSegment = {
	readonly type: PgsSegmentType;
	readonly presentationTimeMs: number;
	readonly decodingTimeMs: number;
	readonly data: Uint8Array;
};

export type PgsWindow = {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type PgsCompositionObject = {
	readonly objectId: number;
	readonly windowId: number;
	readonly x: number;
	readonly y: number;
};

export type PgsDisplaySet = {
	readonly presentationTimeMs: number;
	readonly windows: readonly PgsWindow[];
	readonly objects: readonly PgsObject[];
	readonly palette: Uint8ClampedArray;
	readonly compositions: readonly PgsCompositionObject[];
	/** A set with no objects clears the screen: it ends the previous subtitle. */
	readonly isClear: boolean;
};

export type PgsObject = {
	readonly id: number;
	readonly width: number;
	readonly height: number;
	/** Palette indices, one byte per pixel, `width * height` long. */
	readonly indices: Uint8Array;
};

export class PgsParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PgsParseError";
	}
}

const SEGMENT_TYPES: Record<number, PgsSegmentType> = {
	0x14: "PDS",
	0x15: "ODS",
	0x16: "PCS",
	0x17: "WDS",
	0x80: "END",
};

/** The 90 kHz clock the format uses for both timestamps. */
const CLOCK_HZ = 90_000;

/**
 * Splits a `.sup` file into segments.
 *
 * A `.sup` is segments prefixed with `PG` and two timestamps; the same segments
 * appear inside a Matroska block without that prefix.
 */
export function parseSupSegments(bytes: Uint8Array): readonly PgsSegment[] {
	const segments: PgsSegment[] = [];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let position = 0;

	while (position + 13 <= bytes.length) {
		if (bytes[position] !== 0x50 || bytes[position + 1] !== 0x47) {
			throw new PgsParseError(`expected the PG magic at offset ${position}`);
		}

		const presentation = view.getUint32(position + 2);
		const decoding = view.getUint32(position + 6);
		const type = SEGMENT_TYPES[bytes[position + 10] ?? 0] ?? "unknown";
		const size = view.getUint16(position + 11);
		const start = position + 13;

		if (start + size > bytes.length) break;

		segments.push({
			type,
			presentationTimeMs: (presentation / CLOCK_HZ) * 1000,
			decodingTimeMs: (decoding / CLOCK_HZ) * 1000,
			data: bytes.subarray(start, start + size),
		});

		position = start + size;
	}

	return segments;
}

/** Groups segments into display sets, each ending at an END segment. */
export function buildDisplaySets(segments: readonly PgsSegment[]): readonly PgsDisplaySet[] {
	const sets: PgsDisplaySet[] = [];

	let windows: PgsWindow[] = [];
	let objects: PgsObject[] = [];
	let compositions: PgsCompositionObject[] = [];
	let palette = defaultPalette();
	let presentationTimeMs = 0;
	let hasComposition = false;

	for (const segment of segments) {
		switch (segment.type) {
			case "PCS": {
				presentationTimeMs = segment.presentationTimeMs;
				compositions = parseCompositions(segment.data);
				hasComposition = true;
				break;
			}
			case "WDS": {
				windows = parseWindows(segment.data);
				break;
			}
			case "PDS": {
				palette = parsePalette(segment.data, palette);
				break;
			}
			case "ODS": {
				const object = parseObject(segment.data);
				if (object !== null) objects.push(object);
				break;
			}
			case "END": {
				if (hasComposition) {
					sets.push({
						presentationTimeMs,
						windows,
						objects,
						palette,
						compositions,
						// No composition object means "clear the screen", which is
						// how PGS ends a subtitle rather than by carrying a duration.
						isClear: compositions.length === 0,
					});
				}
				objects = [];
				compositions = [];
				hasComposition = false;
				break;
			}
			default:
				break;
		}
	}

	return sets;
}

function parseCompositions(data: Uint8Array): PgsCompositionObject[] {
	if (data.length < 11) return [];
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const count = data[10] ?? 0;
	const objects: PgsCompositionObject[] = [];

	let position = 11;
	for (let index = 0; index < count && position + 8 <= data.length; index++) {
		const cropped = ((data[position + 3] ?? 0) & 0x40) !== 0;
		objects.push({
			objectId: view.getUint16(position),
			windowId: data[position + 2] ?? 0,
			x: view.getUint16(position + 4),
			y: view.getUint16(position + 6),
		});
		position += cropped ? 16 : 8;
	}

	return objects;
}

function parseWindows(data: Uint8Array): PgsWindow[] {
	if (data.length === 0) return [];
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const count = data[0] ?? 0;
	const windows: PgsWindow[] = [];

	let position = 1;
	for (let index = 0; index < count && position + 9 <= data.length; index++) {
		windows.push({
			id: data[position] ?? 0,
			x: view.getUint16(position + 1),
			y: view.getUint16(position + 3),
			width: view.getUint16(position + 5),
			height: view.getUint16(position + 7),
		});
		position += 9;
	}

	return windows;
}

/**
 * PGS palettes are YCrCb with alpha, so entries are converted to RGBA once
 * here rather than at every draw.
 */
function parsePalette(data: Uint8Array, previous: Uint8ClampedArray): Uint8ClampedArray {
	const palette = new Uint8ClampedArray(previous);

	let position = 2;
	while (position + 5 <= data.length) {
		const entry = data[position] ?? 0;
		const y = data[position + 1] ?? 0;
		const cr = data[position + 2] ?? 0;
		const cb = data[position + 3] ?? 0;
		const alpha = data[position + 4] ?? 0;

		const [r, g, b] = ycrcbToRgb(y, cr, cb);
		palette[entry * 4] = r;
		palette[entry * 4 + 1] = g;
		palette[entry * 4 + 2] = b;
		palette[entry * 4 + 3] = alpha;

		position += 5;
	}

	return palette;
}

/** BT.709 limited range, which is what Blu-ray uses. */
export function ycrcbToRgb(y: number, cr: number, cb: number): [number, number, number] {
	const luma = (y - 16) * 1.164_383;
	const r = luma + 1.792_741 * (cr - 128);
	const g = luma - 0.213_249 * (cb - 128) - 0.532_909 * (cr - 128);
	const b = luma + 2.112_402 * (cb - 128);
	return [clamp(r), clamp(g), clamp(b)];
}

function clamp(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function defaultPalette(): Uint8ClampedArray {
	// 256 entries, fully transparent until a PDS says otherwise.
	return new Uint8ClampedArray(256 * 4);
}

function parseObject(data: Uint8Array): PgsObject | null {
	if (data.length < 11) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const id = view.getUint16(0);
	const width = view.getUint16(7);
	const height = view.getUint16(9);
	if (width === 0 || height === 0) return null;

	return {
		id,
		width,
		height,
		indices: decodeRle(data.subarray(11), width, height),
	};
}

/**
 * PGS run-length decoding.
 *
 * The encoding is byte-oriented with a `0x00` escape: a colour on its own is a
 * single pixel, and after the escape the next one or two bytes say how many
 * pixels of which colour follow, or end the line.
 */
export function decodeRle(data: Uint8Array, width: number, height: number): Uint8Array {
	const output = new Uint8Array(width * height);
	let position = 0;
	let x = 0;
	let y = 0;

	const emit = (color: number, count: number) => {
		for (let index = 0; index < count && x < width; index++) {
			if (y < height) output[y * width + x] = color;
			x += 1;
		}
	};

	while (position < data.length && y < height) {
		const first = data[position++] ?? 0;

		if (first !== 0) {
			emit(first, 1);
			continue;
		}

		const second = data[position++] ?? 0;
		if (second === 0) {
			// End of line: the rest of the row stays at colour 0.
			x = 0;
			y += 1;
			continue;
		}

		const longRun = (second & 0x40) !== 0;
		const coloured = (second & 0x80) !== 0;

		let count = second & 0x3f;
		if (longRun) count = (count << 8) | (data[position++] ?? 0);
		const color = coloured ? (data[position++] ?? 0) : 0;

		emit(color, count);
	}

	return output;
}

/** Encodes indices back to PGS RLE, for writing a track we have edited. */
export function encodeRle(indices: Uint8Array, width: number, height: number): Uint8Array {
	const output: number[] = [];

	for (let y = 0; y < height; y++) {
		let x = 0;
		while (x < width) {
			const color = indices[y * width + x] ?? 0;
			let run = 1;
			while (x + run < width && (indices[y * width + x + run] ?? 0) === color && run < 16_383) {
				run += 1;
			}

			if (color !== 0 && run === 1) {
				output.push(color);
			} else if (run <= 63) {
				output.push(0, (color === 0 ? 0 : 0x80) | run);
				if (color !== 0) output.push(color);
			} else {
				output.push(0, (color === 0 ? 0x40 : 0xc0) | ((run >> 8) & 0x3f), run & 0xff);
				if (color !== 0) output.push(color);
			}

			x += run;
		}
		output.push(0, 0);
	}

	return Uint8Array.from(output);
}

/** Composes a display set into RGBA pixels, ready to become a texture. */
export function renderDisplaySet(
	set: PgsDisplaySet,
	width: number,
	height: number,
): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(width * height * 4);

	for (const composition of set.compositions) {
		const object = set.objects.find((candidate) => candidate.id === composition.objectId);
		if (object === undefined) continue;

		for (let y = 0; y < object.height; y++) {
			const targetY = composition.y + y;
			if (targetY < 0 || targetY >= height) continue;

			for (let x = 0; x < object.width; x++) {
				const targetX = composition.x + x;
				if (targetX < 0 || targetX >= width) continue;

				const index = object.indices[y * object.width + x] ?? 0;
				const target = (targetY * width + targetX) * 4;
				pixels[target] = set.palette[index * 4] ?? 0;
				pixels[target + 1] = set.palette[index * 4 + 1] ?? 0;
				pixels[target + 2] = set.palette[index * 4 + 2] ?? 0;
				pixels[target + 3] = set.palette[index * 4 + 3] ?? 0;
			}
		}
	}

	return pixels;
}

export type PgsCue = {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly set: PgsDisplaySet;
};

/**
 * Pairs each display set with the clear that follows it.
 *
 * PGS states when a subtitle appears and when the screen is cleared, never a
 * duration, so the end of a cue is the start of the next clear.
 */
export function toCues(sets: readonly PgsDisplaySet[]): readonly PgsCue[] {
	const cues: PgsCue[] = [];

	for (const [index, set] of sets.entries()) {
		if (set.isClear) continue;
		const next = sets.slice(index + 1).find((candidate) => candidate.isClear || !candidate.isClear);
		cues.push({
			id: `pgs-${index}`,
			startMs: set.presentationTimeMs,
			endMs: next?.presentationTimeMs ?? set.presentationTimeMs + 3000,
			set,
		});
	}

	return cues;
}
