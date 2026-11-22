/**
 * What the coded pictures say about themselves: the HDR metadata carried in HEVC and H.264 SEI
 * messages and AV1 metadata OBUs, and the depth and chroma of their decoder configurations.
 */

/** Static HDR metadata: the display the film was graded on (SMPTE ST 2086). */
export interface MasteringDisplay {
	/** cd/m². */
	minLuminance: number;
	maxLuminance: number;
	/** Chromaticities of the red, green and blue primaries and of white, as x, y pairs. */
	primaries: {
		red: [number, number];
		green: [number, number];
		blue: [number, number];
		white: [number, number];
	} | null;
}

/** Brightest pixel and brightest frame average of the whole film, in cd/m² (CTA-861.3). */
export interface ContentLight {
	maxCll: number;
	maxFall: number;
}

/** HDR facts found in the pictures. */
export interface StreamHdr {
	mastering: MasteringDisplay | null;
	light: ContentLight | null;
	/** HDR10+ dynamic metadata (SMPTE ST 2094-40) in some picture. */
	hdr10Plus: boolean;
	/** Dolby Vision reshaping data (RPU) in some picture. */
	dolbyVisionRpu: boolean;
}

export const NO_STREAM_HDR: StreamHdr = { mastering: null, light: null, hdr10Plus: false, dolbyVisionRpu: false };

/** Bytes with the emulation prevention bytes (`00 00 03`) taken out, as the payload was written. */
export function unescapeRbsp(data: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.length);
	let length = 0;
	let zeros = 0;
	for (const byte of data) {
		if (zeros >= 2 && byte === 3) {
			zeros = 0;
			continue;
		}
		out[length++] = byte;
		zeros = byte === 0 ? zeros + 1 : 0;
	}
	return out.subarray(0, length);
}

const u16 = (data: Uint8Array, at: number) => ((data[at] ?? 0) << 8) | (data[at + 1] ?? 0);
const u32 = (data: Uint8Array, at: number) => u16(data, at) * 65536 + u16(data, at + 2);

/**
 * Mastering display colour volume as SEI and the ISO `mdcv` box write it: primaries in the order
 * green, blue, red, in units of 0.00002, luminance in units of 0.0001 cd/m².
 */
export function readMasteringDisplay(data: Uint8Array): MasteringDisplay | null {
	if (data.length < 24) return null;
	const point = (at: number): [number, number] => [u16(data, at) * 0.00002, u16(data, at + 2) * 0.00002];
	return {
		primaries: { green: point(0), blue: point(4), red: point(8), white: point(12) },
		maxLuminance: u32(data, 16) * 0.0001,
		minLuminance: u32(data, 20) * 0.0001,
	};
}

/** Content light level as SEI and the ISO `clli` box write it. */
export function readContentLight(data: Uint8Array): ContentLight | null {
	if (data.length < 4) return null;
	return { maxCll: u16(data, 0), maxFall: u16(data, 2) };
}

/** ITU-T T.35 header of HDR10+: United States, Samsung, its oriented code, application 4. */
const HDR10_PLUS = [0xb5, 0x00, 0x3c, 0x00, 0x01, 0x04];

function isHdr10Plus(t35: Uint8Array): boolean {
	return HDR10_PLUS.every((byte, index) => t35[index] === byte);
}

/** Reads the SEI messages of one SEI NAL unit's payload into `found`. */
function readSei(payload: Uint8Array, found: StreamHdr) {
	const data = unescapeRbsp(payload);
	let at = 0;
	// The last byte is the trailing bits.
	while (at < data.length - 1) {
		let type = 0;
		while (data[at] === 0xff) {
			type += 255;
			at++;
		}
		type += data[at++] ?? 0;
		let size = 0;
		while (data[at] === 0xff) {
			size += 255;
			at++;
		}
		size += data[at++] ?? 0;
		const message = data.subarray(at, at + size);
		at += size;
		if (type === 137) found.mastering ??= readMasteringDisplay(message);
		else if (type === 144) found.light ??= readContentLight(message);
		else if (type === 4 && isHdr10Plus(message)) found.hdr10Plus = true;
	}
}

/** One NAL unit of HEVC (two-byte header) or H.264 (one byte). */
function readNal(nal: Uint8Array, codec: 'hevc' | 'avc', found: StreamHdr) {
	if (codec === 'hevc') {
		const type = ((nal[0] ?? 0) >> 1) & 0x3f;
		if (type === 39 || type === 40) readSei(nal.subarray(2), found);
		// Dolby Vision's RPU travels in an unspecified NAL type of its own.
		else if (type === 62) found.dolbyVisionRpu = true;
	} else if (((nal[0] ?? 0) & 0x1f) === 6) {
		readSei(nal.subarray(1), found);
	}
}

/** The NAL units of a packet: length-prefixed as in MP4 and Matroska, or Annex B as in MPEG-TS. */
function splitNals(packet: Uint8Array, lengthSize = 4): Uint8Array[] {
	const annexB =
		(packet[0] === 0 && packet[1] === 0 && packet[2] === 1) ||
		(packet[0] === 0 && packet[1] === 0 && packet[2] === 0 && packet[3] === 1);
	const nals: Uint8Array[] = [];
	if (annexB) {
		let start = -1;
		for (let i = 0; i + 2 < packet.length; i++) {
			if (packet[i] === 0 && packet[i + 1] === 0 && packet[i + 2] === 1) {
				if (start >= 0) nals.push(packet.subarray(start, packet[i - 1] === 0 ? i - 1 : i));
				start = i + 3;
				i += 2;
			}
		}
		if (start >= 0) nals.push(packet.subarray(start));
		return nals;
	}
	let at = 0;
	while (at + lengthSize <= packet.length) {
		let size = 0;
		for (let i = 0; i < lengthSize; i++) size = size * 256 + (packet[at + i] ?? 0);
		at += lengthSize;
		if (size === 0 || at + size > packet.length) break;
		nals.push(packet.subarray(at, at + size));
		at += size;
	}
	return nals;
}

/** AV1 sizes: little-endian groups of seven bits. */
function leb128(data: Uint8Array, at: number): [value: number, next: number] {
	let value = 0;
	for (let i = 0; i < 8; i++) {
		const byte = data[at + i] ?? 0;
		value += (byte & 0x7f) * 2 ** (7 * i);
		if (!(byte & 0x80)) return [value, at + i + 1];
	}
	return [value, at + 8];
}

/** The metadata OBUs of an AV1 temporal unit. */
function readAv1(packet: Uint8Array, found: StreamHdr) {
	let at = 0;
	while (at < packet.length) {
		const header = packet[at] ?? 0;
		const type = (header >> 3) & 0x0f;
		const extension = (header >> 2) & 1;
		const hasSize = (header >> 1) & 1;
		at += 1 + extension;
		let size = packet.length - at;
		if (hasSize) [size, at] = leb128(packet, at);
		const obu = packet.subarray(at, at + size);
		at += size;
		if (type !== 5) continue;
		const [kind, start] = leb128(obu, 0);
		const body = obu.subarray(start);
		if (kind === 1) found.light ??= readContentLight(body);
		else if (kind === 2) {
			// AV1 writes primaries red, green, blue in 0.16 fixed point, luminance in 24.8 and 18.14.
			const point = (index: number): [number, number] => [
				u16(body, index * 4) / 65536,
				u16(body, index * 4 + 2) / 65536,
			];
			if (body.length >= 24)
				found.mastering ??= {
					primaries: { red: point(0), green: point(1), blue: point(2), white: point(3) },
					maxLuminance: u32(body, 16) / 256,
					minLuminance: u32(body, 20) / 16384,
				};
		} else if (kind === 4 && isHdr10Plus(body)) found.hdr10Plus = true;
	}
}

/** Adds what one coded picture carries to `found`. */
export function readPacketHdr(packet: Uint8Array, codec: 'hevc' | 'avc' | 'av1', found: StreamHdr, lengthSize = 4) {
	if (codec === 'av1') {
		readAv1(packet, found);
		return;
	}
	for (const nal of splitNals(packet, lengthSize)) readNal(nal, codec, found);
}

/** Depth and chroma read from a decoder configuration record. */
export interface CodedFormat {
	bitDepth: number | null;
	/** `4:2:0`, `4:2:2`, `4:4:4`, `4:0:0`. */
	chroma: string | null;
	/** Size of the NAL length prefixes in packets. */
	lengthSize: number;
}

const CHROMA = ['4:0:0', '4:2:0', '4:2:2', '4:4:4'];

/** The HEVCDecoderConfigurationRecord (`hvcC`), and the SEI it may hold, into `found`. */
export function readHvcc(record: Uint8Array, found: StreamHdr): CodedFormat {
	if (record.length < 23) return { bitDepth: null, chroma: null, lengthSize: 4 };
	const format = {
		chroma: CHROMA[(record[16] ?? 0) & 3] ?? null,
		bitDepth: ((record[17] ?? 0) & 7) + 8,
		lengthSize: ((record[21] ?? 0) & 3) + 1,
	};
	let at = 23;
	for (let array = 0; array < (record[22] ?? 0) && at + 3 <= record.length; array++) {
		const count = u16(record, at + 1);
		at += 3;
		for (let i = 0; i < count && at + 2 <= record.length; i++) {
			const size = u16(record, at);
			readNal(record.subarray(at + 2, at + 2 + size), 'hevc', found);
			at += 2 + size;
		}
	}
	return format;
}

/** The AVCDecoderConfigurationRecord (`avcC`): its high profiles give depth and chroma at the end. */
export function readAvcc(record: Uint8Array): CodedFormat {
	const lengthSize = ((record[4] ?? 3) & 3) + 1;
	const profile = record[1] ?? 0;
	let at = 6;
	for (let i = 0; i < ((record[5] ?? 0) & 0x1f); i++) at += 2 + u16(record, at);
	const pps = record[at] ?? 0;
	at += 1;
	for (let i = 0; i < pps; i++) at += 2 + u16(record, at);
	if ([100, 110, 122, 144].includes(profile) && at + 3 <= record.length) {
		return { chroma: CHROMA[(record[at] ?? 0) & 3] ?? null, bitDepth: ((record[at + 1] ?? 0) & 7) + 8, lengthSize };
	}
	// Other profiles are 8-bit 4:2:0.
	return { chroma: '4:2:0', bitDepth: 8, lengthSize };
}
