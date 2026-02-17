const textDecoder = new TextDecoder('utf-8');

// ── EBML Element IDs ──
const EBML_ID_SEGMENT = 0x18538067;
const EBML_ID_TRACKS = 0x1654ae6b;
const EBML_ID_TRACK_ENTRY = 0xae;
const EBML_ID_TRACK_NUMBER = 0xd7;
const EBML_ID_TRACK_TYPE = 0x83;
const EBML_ID_CODEC_ID = 0x86;
const EBML_ID_CODEC_PRIVATE = 0x63a2;
const EBML_ID_LANGUAGE = 0x22b59c;
const EBML_ID_LANGUAGE_BCP47 = 0x22b59d;
const EBML_ID_NAME = 0x536e;
const EBML_ID_FLAG_DEFAULT = 0x88;
const EBML_ID_FLAG_FORCED = 0x55aa;
const EBML_ID_CLUSTER = 0x1f43b675;
const EBML_ID_TIMECODE = 0xe7;
const EBML_ID_SIMPLE_BLOCK = 0xa3;
const EBML_ID_BLOCK_GROUP = 0xa0;
const EBML_ID_BLOCK = 0xa1;
const EBML_ID_BLOCK_DURATION = 0x9b;
const EBML_ID_INFO = 0x1549a966;
const EBML_ID_TIMESTAMP_SCALE = 0x2ad7b1;

const TRACK_TYPE_SUBTITLE = 17;

export interface MkvSubtitleTrack {
	trackNumber: number;
	codecId: string;
	language?: string;
	name?: string;
	isDefault: boolean;
	isForced: boolean;
	codecPrivate?: string;
}

export interface MkvSubtitleCue {
	trackNumber: number;
	start: number;
	end: number;
	data: string;
}

export interface MkvSubtitleResult {
	tracks: MkvSubtitleTrack[];
	cues: MkvSubtitleCue[];
}

class EbmlReader {
	private view: DataView;
	private offset: number;
	private length: number;

	constructor(buffer: ArrayBuffer, offset = 0, length?: number) {
		this.view = new DataView(buffer);
		this.offset = offset;
		this.length = length ?? buffer.byteLength;
	}

	get pos(): number {
		return this.offset;
	}
	get remaining(): number {
		return this.length - this.offset;
	}

	readVarInt(): { value: number; size: number } | null {
		if (this.remaining < 1) return null;
		const first = this.view.getUint8(this.offset);
		if (first === 0) return null;
		let size = 1;
		let mask = 0x80;
		while (size <= 8 && (first & mask) === 0) {
			size++;
			mask >>= 1;
		}
		if (size > 8 || this.remaining < size) return null;
		let value = first & (mask - 1);
		for (let i = 1; i < size; i++) {
			value = value * 256 + this.view.getUint8(this.offset + i);
		}
		this.offset += size;
		return { value, size };
	}

	readElementId(): { id: number; size: number } | null {
		if (this.remaining < 1) return null;
		const first = this.view.getUint8(this.offset);
		if (first === 0) return null;
		let size = 1;
		let mask = 0x80;
		while (size <= 4 && (first & mask) === 0) {
			size++;
			mask >>= 1;
		}
		if (size > 4 || this.remaining < size) return null;
		let id = first;
		for (let i = 1; i < size; i++) {
			id = id * 256 + this.view.getUint8(this.offset + i);
		}
		this.offset += size;
		return { id, size };
	}

	readUint(byteLength: number): number {
		let value = 0;
		for (let i = 0; i < byteLength && this.offset < this.length; i++) {
			value = value * 256 + this.view.getUint8(this.offset++);
		}
		return value;
	}

	readSigned16(): number {
		if (this.remaining < 2) return 0;
		const val = this.view.getInt16(this.offset, false);
		this.offset += 2;
		return val;
	}

	readBytes(n: number): Uint8Array {
		const end = Math.min(this.offset + n, this.length);
		const bytes = new Uint8Array(this.view.buffer, this.offset, end - this.offset);
		this.offset = end;
		return bytes;
	}

	readString(n: number): string {
		return textDecoder.decode(this.readBytes(n));
	}

	skip(n: number): void {
		this.offset = Math.min(this.offset + n, this.length);
	}

	seek(pos: number): void {
		this.offset = Math.min(pos, this.length);
	}
}

function isUnknownSize(value: number, sizeOfSize: number): boolean {
	// EBML unknown size: all data bits set to 1
	// For sizes 1-4, (1 << (7 * size)) - 1 works; for larger sizes use 2** to avoid overflow
	const maxForSize = sizeOfSize <= 4 ? (1 << (7 * sizeOfSize)) - 1 : 2 ** (7 * sizeOfSize) - 1;
	return value === maxForSize;
}

export async function parseMkvSubtitles(
	file: File,
	options?: { tracksOnly?: boolean; targetTrackNumber?: number },
): Promise<MkvSubtitleResult> {
	const tracksOnly = options?.tracksOnly ?? false;
	const targetTrack = options?.targetTrackNumber;
	const subtitleTracks = new Map<number, MkvSubtitleTrack>();
	const cues: MkvSubtitleCue[] = [];
	let timestampScale = 1_000_000;

	const HEADER_CHUNK = 64 * 1024;
	const headerBuf = await readFileSlice(file, 0, Math.min(file.size, HEADER_CHUNK));
	const headerReader = new EbmlReader(headerBuf);

	// Skip EBML header
	const ebmlHead = headerReader.readElementId();
	if (!ebmlHead) return { tracks: [], cues: [] };
	const ebmlHeadSize = headerReader.readVarInt();
	if (!ebmlHeadSize) return { tracks: [], cues: [] };
	headerReader.skip(ebmlHeadSize.value);

	// Segment
	const segmentId = headerReader.readElementId();
	if (!segmentId || segmentId.id !== EBML_ID_SEGMENT) return { tracks: [], cues: [] };
	headerReader.readVarInt(); // segment size (usually unknown)
	const segmentDataStart = headerReader.pos;

	// Scan for Tracks, Info, and first Cluster within header range
	let tracksFound = false;
	let infoFound = false;
	let firstClusterOffset = -1;

	while (headerReader.remaining > 0) {
		const elemStart = headerReader.pos;
		const elemId = headerReader.readElementId();
		if (!elemId) break;
		const elemSize = headerReader.readVarInt();
		if (!elemSize) break;
		const unknown = isUnknownSize(elemSize.value, elemSize.size);

		if (elemId.id === EBML_ID_INFO && !unknown) {
			infoFound = true;
			parseInfoElement(headerReader, elemSize.value, (scale) => {
				timestampScale = scale;
			});
		} else if (elemId.id === EBML_ID_TRACKS && !unknown) {
			tracksFound = true;
			parseTracksElement(headerReader, elemSize.value, subtitleTracks);
		} else if (elemId.id === EBML_ID_CLUSTER) {
			firstClusterOffset = elemStart;
			break;
		} else if (!unknown) {
			headerReader.skip(elemSize.value);
		} else {
			break;
		}
	}

	// If we didn't find tracks or the first cluster in the first chunk, read more header data
	if (!tracksFound || !infoFound || firstClusterOffset < 0) {
		const largerBuf = await readFileSlice(file, segmentDataStart, Math.min(file.size, 8 * 1024 * 1024));
		const scanReader = new EbmlReader(largerBuf);
		while (scanReader.remaining > 0) {
			const elemStart = scanReader.pos + segmentDataStart;
			const elemId = scanReader.readElementId();
			if (!elemId) break;
			const elemSize = scanReader.readVarInt();
			if (!elemSize) break;
			const unknown = isUnknownSize(elemSize.value, elemSize.size);

			if (elemId.id === EBML_ID_INFO && !infoFound && !unknown) {
				infoFound = true;
				parseInfoElement(scanReader, elemSize.value, (scale) => {
					timestampScale = scale;
				});
			} else if (elemId.id === EBML_ID_TRACKS && !tracksFound && !unknown) {
				tracksFound = true;
				parseTracksElement(scanReader, elemSize.value, subtitleTracks);
			} else if (elemId.id === EBML_ID_CLUSTER) {
				firstClusterOffset = elemStart;
				break;
			} else if (!unknown) {
				scanReader.skip(elemSize.value);
			} else {
				break;
			}
		}
	}

	const tracks = Array.from(subtitleTracks.values());
	if (tracksOnly || tracks.length === 0) return { tracks, cues: [] };

	const relevantTrackNumbers = new Set(targetTrack != null ? [targetTrack] : tracks.map((t) => t.trackNumber));

	// Read clusters for subtitle blocks
	if (firstClusterOffset < 0) return { tracks, cues: [] };
	const tsScaleSeconds = timestampScale / 1_000_000_000;

	const CLUSTER_READ_SIZE = 4 * 1024 * 1024;
	let fileOffset = firstClusterOffset;
	let currentClusterTimestamp = 0;

	while (fileOffset < file.size) {
		// eslint-disable-next-line no-await-in-loop
		const chunk = await readFileSlice(file, fileOffset, Math.min(file.size - fileOffset, CLUSTER_READ_SIZE));
		const reader = new EbmlReader(chunk);
		let lastCompletePos = 0;

		while (reader.remaining > 4) {
			const elemPos = reader.pos;
			const elemId = reader.readElementId();
			if (!elemId) break;
			const elemSize = reader.readVarInt();
			if (!elemSize) break;
			const unknown = isUnknownSize(elemSize.value, elemSize.size);
			const headerBytes = reader.pos - elemPos;

			if (elemId.id === EBML_ID_CLUSTER) {
				lastCompletePos = reader.pos;
				continue;
			}

			if (unknown) {
				lastCompletePos = reader.pos;
				continue;
			}

			if (reader.remaining < elemSize.value) {
				// Element doesn't fit in current chunk — skip it by jumping past it in the file
				const skipTarget = elemPos + headerBytes + elemSize.value;
				fileOffset += skipTarget;
				lastCompletePos = -1; // signal that we already advanced fileOffset
				break;
			}

			if (elemId.id === EBML_ID_TIMECODE) {
				currentClusterTimestamp = reader.readUint(elemSize.value) * tsScaleSeconds;
				lastCompletePos = reader.pos;
				continue;
			}

			if (elemId.id === EBML_ID_SIMPLE_BLOCK) {
				parseSimpleBlock(
					reader,
					elemSize.value,
					relevantTrackNumbers,
					currentClusterTimestamp,
					tsScaleSeconds,
					cues,
				);
				lastCompletePos = reader.pos;
				continue;
			}

			if (elemId.id === EBML_ID_BLOCK_GROUP) {
				parseBlockGroup(
					reader,
					elemSize.value,
					relevantTrackNumbers,
					currentClusterTimestamp,
					tsScaleSeconds,
					cues,
				);
				lastCompletePos = reader.pos;
				continue;
			}

			reader.skip(elemSize.value);
			lastCompletePos = reader.pos;
		}

		if (lastCompletePos === -1) continue; // fileOffset already advanced by skip logic
		const bytesConsumed = lastCompletePos > 0 ? lastCompletePos : reader.pos;
		if (bytesConsumed === 0) break;
		fileOffset += bytesConsumed;
	}

	cues.sort((a, b) => a.start - b.start);
	return { tracks, cues };
}

function parseInfoElement(reader: EbmlReader, size: number, onTimestampScale: (scale: number) => void): void {
	const end = reader.pos + size;
	while (reader.pos < end) {
		const elemId = reader.readElementId();
		if (!elemId) break;
		const elemSize = reader.readVarInt();
		if (!elemSize) break;
		if (elemId.id === EBML_ID_TIMESTAMP_SCALE) {
			onTimestampScale(reader.readUint(elemSize.value));
		} else {
			reader.skip(elemSize.value);
		}
	}
	reader.seek(end);
}

function parseTracksElement(reader: EbmlReader, size: number, tracks: Map<number, MkvSubtitleTrack>): void {
	const end = reader.pos + size;
	while (reader.pos < end) {
		const elemId = reader.readElementId();
		if (!elemId) break;
		const elemSize = reader.readVarInt();
		if (!elemSize) break;
		if (elemId.id === EBML_ID_TRACK_ENTRY) {
			parseTrackEntry(reader, elemSize.value, tracks);
		} else {
			reader.skip(elemSize.value);
		}
	}
	reader.seek(end);
}

function parseTrackEntry(reader: EbmlReader, size: number, tracks: Map<number, MkvSubtitleTrack>): void {
	const end = reader.pos + size;
	let trackNumber = 0;
	let trackType = 0;
	let codecId = '';
	let language: string | undefined;
	let name: string | undefined;
	let isDefault = true; // MKV spec: FlagDefault defaults to 1
	let isForced = false;
	let codecPrivate: Uint8Array | undefined;

	while (reader.pos < end) {
		const elemId = reader.readElementId();
		if (!elemId) break;
		const elemSize = reader.readVarInt();
		if (!elemSize) break;

		switch (elemId.id) {
			case EBML_ID_TRACK_NUMBER:
				trackNumber = reader.readUint(elemSize.value);
				break;
			case EBML_ID_TRACK_TYPE:
				trackType = reader.readUint(elemSize.value);
				break;
			case EBML_ID_CODEC_ID:
				codecId = reader.readString(elemSize.value);
				break;
			case EBML_ID_LANGUAGE:
				language = reader.readString(elemSize.value).replaceAll('\0', '');
				break;
			case EBML_ID_LANGUAGE_BCP47:
				language = reader.readString(elemSize.value).replaceAll('\0', '');
				break;
			case EBML_ID_NAME:
				name = reader.readString(elemSize.value).replaceAll('\0', '');
				break;
			case EBML_ID_FLAG_DEFAULT:
				isDefault = reader.readUint(elemSize.value) !== 0;
				break;
			case EBML_ID_FLAG_FORCED:
				isForced = reader.readUint(elemSize.value) !== 0;
				break;
			case EBML_ID_CODEC_PRIVATE:
				codecPrivate = reader.readBytes(elemSize.value);
				break;
			default:
				reader.skip(elemSize.value);
				break;
		}
	}

	reader.seek(end);

	if (trackType === TRACK_TYPE_SUBTITLE && trackNumber > 0) {
		tracks.set(trackNumber, {
			trackNumber,
			codecId,
			language: language && language !== 'und' ? language : undefined,
			name: name || undefined,
			isDefault,
			isForced,
			codecPrivate: codecPrivate ? textDecoder.decode(codecPrivate) : undefined,
		});
	}
}

function parseSimpleBlock(
	reader: EbmlReader,
	size: number,
	relevantTracks: Set<number>,
	clusterTimestamp: number,
	tsScaleSeconds: number,
	cues: MkvSubtitleCue[],
): void {
	const end = reader.pos + size;
	const trackNum = reader.readVarInt();
	if (!trackNum) {
		reader.seek(end);
		return;
	}
	if (!relevantTracks.has(trackNum.value)) {
		reader.seek(end);
		return;
	}
	const relativeTimestamp = reader.readSigned16();
	reader.readUint(1); // flags

	const dataSize = end - reader.pos;
	if (dataSize <= 0) {
		reader.seek(end);
		return;
	}
	const data = reader.readString(dataSize);
	const start = clusterTimestamp + relativeTimestamp * tsScaleSeconds;
	cues.push({ trackNumber: trackNum.value, start, end: start + 5, data });
	reader.seek(end);
}

function parseBlockGroup(
	reader: EbmlReader,
	size: number,
	relevantTracks: Set<number>,
	clusterTimestamp: number,
	tsScaleSeconds: number,
	cues: MkvSubtitleCue[],
): void {
	const end = reader.pos + size;
	let blockData: { trackNumber: number; relativeTimestamp: number; data: string } | null = null;
	let blockDuration: number | null = null;

	while (reader.pos < end) {
		const elemId = reader.readElementId();
		if (!elemId) break;
		const elemSize = reader.readVarInt();
		if (!elemSize) break;

		if (elemId.id === EBML_ID_BLOCK) {
			const blockEnd = reader.pos + elemSize.value;
			const trackNum = reader.readVarInt();
			if (!trackNum || !relevantTracks.has(trackNum.value)) {
				reader.seek(blockEnd);
				continue;
			}
			const relTs = reader.readSigned16();
			reader.readUint(1); // flags
			const dataSize = blockEnd - reader.pos;
			const data = dataSize > 0 ? reader.readString(dataSize) : '';
			blockData = { trackNumber: trackNum.value, relativeTimestamp: relTs, data };
			reader.seek(blockEnd);
		} else if (elemId.id === EBML_ID_BLOCK_DURATION) {
			blockDuration = reader.readUint(elemSize.value);
		} else {
			reader.skip(elemSize.value);
		}
	}

	reader.seek(end);

	if (blockData) {
		const start = clusterTimestamp + blockData.relativeTimestamp * tsScaleSeconds;
		const durationSec = blockDuration != null ? blockDuration * tsScaleSeconds : 5;
		cues.push({ trackNumber: blockData.trackNumber, start, end: start + durationSec, data: blockData.data });
	}
}

async function readFileSlice(file: File, offset: number, size: number): Promise<ArrayBuffer> {
	const slice = file.slice(offset, offset + size);
	return slice.arrayBuffer();
}
