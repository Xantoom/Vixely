/**
 * What MP4 and Matroska headers say beyond what Mediabunny reads: Dolby Vision configuration,
 * HDR static metadata, the application that wrote the file, and Matroska chapters.
 */
import type { VideoTrackMetadata } from 'mediabunny';
import { type ContentLight, type MasteringDisplay, readContentLight, readMasteringDisplay } from './bitstream';

/** Dolby Vision decoder configuration (`dvcC`, `dvvC`, `dvwC`). */
export interface DolbyVision {
	profile: number;
	level: number;
	rpu: boolean;
	enhancementLayer: boolean;
	baseLayer: boolean;
	/** What a player without Dolby Vision shows: 0 none, 1 HDR10, 2 SDR, 4 HLG, 6 Blu-ray HDR10. */
	compatibility: number;
}

export interface Chapter {
	/** Seconds. */
	start: number;
	name: string;
}

/** The Dolby Vision configuration as stored, to be written again unchanged. */
export interface DolbyVisionRecord {
	box: 'dvcC' | 'dvvC' | 'dvwC';
	record: Uint8Array;
}

export interface ContainerFacts {
	dolbyVision: DolbyVision | null;
	dolbyVisionRecord: DolbyVisionRecord | null;
	mastering: MasteringDisplay | null;
	light: ContentLight | null;
	/** The muxer, as Matroska's MuxingApp says it. */
	muxingApp: string | null;
	/** The program that wrote the file, as Matroska's WritingApp or MP4's `©too` say it. */
	writingApp: string | null;
	created: Date | null;
	chapters: Chapter[];
	/** What Matroska says of each track beyond Mediabunny, by track number. */
	tracks: Map<number, TrackFacts>;
}

/** A Matroska track's statistics, as mkvmerge writes them in tags, and its accessibility flags. */
export interface TrackFacts {
	duration: number | null;
	bitrate: number | null;
	hearingImpaired: boolean;
	/** Made for the visually impaired: audio description, or subtitles describing the sound. */
	described: boolean;
}

export const NO_CONTAINER_FACTS: ContainerFacts = {
	dolbyVision: null,
	dolbyVisionRecord: null,
	mastering: null,
	light: null,
	muxingApp: null,
	writingApp: null,
	created: null,
	chapters: [],
	tracks: new Map(),
};

export function readDolbyVision(record: Uint8Array): DolbyVision | null {
	if (record.length < 5) return null;
	const [, , b2 = 0, b3 = 0, b4 = 0] = record;
	return {
		profile: b2 >> 1,
		level: ((b2 & 1) << 5) | (b3 >> 3),
		rpu: Boolean(b3 & 4),
		enhancementLayer: Boolean(b3 & 2),
		baseLayer: Boolean(b3 & 1),
		compatibility: b4 >> 4,
	};
}

/** Reads `[start, start + length)` of the file. */
async function bytes(file: Blob, start: number, length: number): Promise<Uint8Array> {
	return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

const text = (data: Uint8Array) => new TextDecoder().decode(data).replace(/\0+$/, '').trim();

/* ISO BMFF (MP4, MOV) */

interface Box {
	type: string;
	/** Start of the box's content, after its header. */
	start: number;
	end: number;
}

function boxes(data: Uint8Array, from: number, to: number): Box[] {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const found: Box[] = [];
	let at = from;
	while (at + 8 <= to) {
		let size = view.getUint32(at);
		const type = String.fromCharCode(...data.subarray(at + 4, at + 8));
		let header = 8;
		if (size === 1 && at + 16 <= to) {
			size = Number(view.getBigUint64(at + 8));
			header = 16;
		} else if (size === 0) size = to - at;
		if (size < header || at + size > to) break;
		found.push({ type, start: at + header, end: at + size });
		at += size;
	}
	return found;
}

/** Size of a visual sample entry's fields before its child boxes. */
const VISUAL_ENTRY = 78;

/** The `moov` box, wherever it lies, read whole up to 64 MB. */
async function readMoov(file: Blob): Promise<Uint8Array | null> {
	let at = 0;
	while (at + 8 <= file.size) {
		// Each box header says where the next one starts.
		// oxlint-disable-next-line no-await-in-loop
		const head = await bytes(file, at, 16);
		const view = new DataView(head.buffer);
		let size = view.getUint32(0);
		const type = String.fromCharCode(...head.subarray(4, 8));
		if (size === 1) size = Number(view.getBigUint64(8));
		else if (size === 0) size = file.size - at;
		if (size < 8) return null;
		if (type === 'moov') return size > 64 << 20 ? null : bytes(file, at, size);
		at += size;
	}
	return null;
}

function readIsoFacts(moov: Uint8Array): ContainerFacts {
	const facts: ContainerFacts = { ...NO_CONTAINER_FACTS, chapters: [], tracks: new Map() };
	const inside = (box: Box, type: string) => boxes(moov, box.start, box.end).filter((child) => child.type === type);
	const [root] = boxes(moov, 0, moov.length);
	if (!root) return facts;
	for (const trak of inside(root, 'trak')) {
		for (const mdia of inside(trak, 'mdia'))
			for (const minf of inside(mdia, 'minf'))
				for (const stbl of inside(minf, 'stbl'))
					for (const stsd of inside(stbl, 'stsd')) {
						for (const entry of boxes(moov, stsd.start + 8, stsd.end)) {
							for (const child of boxes(moov, entry.start + VISUAL_ENTRY, entry.end)) {
								const content = moov.subarray(child.start, child.end);
								if (child.type === 'dvcC' || child.type === 'dvvC' || child.type === 'dvwC') {
									facts.dolbyVision ??= readDolbyVision(content);
									facts.dolbyVisionRecord ??= { box: child.type, record: content.slice() };
								} else if (child.type === 'mdcv') facts.mastering ??= readMasteringDisplay(content);
								else if (child.type === 'clli') facts.light ??= readContentLight(content);
							}
						}
					}
	}
	// The encoder, as iTunes-style metadata names it: moov/udta/meta/ilst/©too/data.
	for (const udta of inside(root, 'udta'))
		for (const meta of inside(udta, 'meta'))
			for (const ilst of boxes(moov, meta.start + 4, meta.end).filter((box) => box.type === 'ilst'))
				for (const tool of inside(ilst, '©too'))
					for (const data of inside(tool, 'data'))
						facts.writingApp ??= text(moov.subarray(data.start + 8, data.end));
	// When the file was made: mvhd counts seconds from 1904.
	const [mvhd] = inside(root, 'mvhd');
	if (mvhd) {
		const view = new DataView(moov.buffer, moov.byteOffset + mvhd.start);
		const seconds = moov[mvhd.start] === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4);
		if (seconds > 0) facts.created = new Date((seconds - 2_082_844_800) * 1000);
	}
	return facts;
}

/* Matroska */

/** An EBML element ID, with its length marker bits kept as Matroska writes them. */
function readId(data: Uint8Array, at: number): [id: number, next: number] | null {
	const first = data[at];
	if (first === undefined || first === 0) return null;
	const length = Math.clz32(first) - 23;
	if (length > 4) return null;
	let id = 0;
	for (let i = 0; i < length; i++) id = id * 256 + (data[at + i] ?? 0);
	return [id, at + length];
}

/** An EBML size; -1 for "unknown", which only a Segment or Cluster may have. */
function readSize(data: Uint8Array, at: number): [size: number, next: number] | null {
	const first = data[at];
	if (first === undefined || first === 0) return null;
	const length = Math.clz32(first) - 23;
	let size = first & (0xff >> length);
	let unknown = size === 0xff >> length;
	for (let i = 1; i < length; i++) {
		const byte = data[at + i] ?? 0;
		size = size * 256 + byte;
		if (byte !== 0xff) unknown = false;
	}
	return [unknown ? -1 : size, at + length];
}

interface Element {
	id: number;
	start: number;
	end: number;
}

function elements(data: Uint8Array, from: number, to: number): Element[] {
	const found: Element[] = [];
	let at = from;
	while (at < to) {
		const id = readId(data, at);
		if (!id) break;
		const size = readSize(data, id[1]);
		if (!size) break;
		const start = size[1];
		const end = size[0] < 0 ? to : Math.min(to, start + size[0]);
		found.push({ id: id[0], start, end });
		at = end;
	}
	return found;
}

const EBML = {
	Segment: 0x18538067,
	SeekHead: 0x114d9b74,
	Seek: 0x4dbb,
	SeekID: 0x53ab,
	SeekPosition: 0x53ac,
	Info: 0x1549a966,
	MuxingApp: 0x4d80,
	WritingApp: 0x5741,
	DateUTC: 0x4461,
	Tracks: 0x1654ae6b,
	TrackEntry: 0xae,
	TrackType: 0x83,
	Video: 0xe0,
	Colour: 0x55b0,
	MaxCLL: 0x55bc,
	MaxFALL: 0x55bd,
	MasteringMetadata: 0x55d0,
	LuminanceMax: 0x55d9,
	LuminanceMin: 0x55da,
	PrimaryRChromaticityX: 0x55d1,
	BlockAdditionMapping: 0x41e4,
	BlockAddIDType: 0x41e7,
	BlockAddIDExtraData: 0x41ed,
	Chapters: 0x1043a770,
	EditionEntry: 0x45b9,
	ChapterAtom: 0xb6,
	ChapterTimeStart: 0x91,
	ChapterDisplay: 0x80,
	ChapString: 0x85,
	ChapterFlagHidden: 0x98,
	TrackNumber: 0xd7,
	TrackUID: 0x73c5,
	FlagHearingImpaired: 0x55ab,
	FlagVisualImpaired: 0x55ac,
	FlagTextDescriptions: 0x55ad,
	Tags: 0x1254c367,
	Tag: 0x7373,
	Targets: 0x63c0,
	TagTrackUID: 0x63c5,
	SimpleTag: 0x67c8,
	TagName: 0x45a3,
	TagString: 0x4487,
	Cluster: 0x1f43b675,
} as const;

function uint(data: Uint8Array, element: Element): number {
	let value = 0;
	for (let i = element.start; i < element.end; i++) value = value * 256 + (data[i] ?? 0);
	return value;
}

function float(data: Uint8Array, element: Element): number {
	const view = new DataView(data.buffer, data.byteOffset + element.start, element.end - element.start);
	if (view.byteLength === 4) return view.getFloat32(0);
	if (view.byteLength === 8) return view.getFloat64(0);
	return 0;
}

function child(data: Uint8Array, parent: Element, id: number): Element | undefined {
	return elements(data, parent.start, parent.end).find((element) => element.id === id);
}

const DOLBY_VISION_BOXES = new Map<number, DolbyVisionRecord['box']>([
	[0x64766343, 'dvcC'],
	[0x64767643, 'dvvC'],
	[0x64767743, 'dvwC'],
]);

function readVideoEntry(data: Uint8Array, entry: Element, facts: ContainerFacts) {
	for (const element of elements(data, entry.start, entry.end)) {
		if (element.id === EBML.BlockAdditionMapping) {
			const type = child(data, element, EBML.BlockAddIDType);
			const extra = child(data, element, EBML.BlockAddIDExtraData);
			// dvcC, dvvC and dvwC as big-endian numbers.
			const box = type && DOLBY_VISION_BOXES.get(uint(data, type));
			if (box && extra) {
				const record = data.slice(extra.start, extra.end);
				facts.dolbyVision ??= readDolbyVision(record);
				facts.dolbyVisionRecord ??= { box, record };
			}
		}
		if (element.id !== EBML.Video) continue;
		const colour = child(data, element, EBML.Colour);
		if (!colour) continue;
		const parts = elements(data, colour.start, colour.end);
		const cll = parts.find((part) => part.id === EBML.MaxCLL);
		const fall = parts.find((part) => part.id === EBML.MaxFALL);
		if (cll || fall) facts.light ??= { maxCll: cll ? uint(data, cll) : 0, maxFall: fall ? uint(data, fall) : 0 };
		const mastering = parts.find((part) => part.id === EBML.MasteringMetadata);
		if (!mastering) continue;
		const values = new Map(
			elements(data, mastering.start, mastering.end).map((part) => [part.id, float(data, part)]),
		);
		const at = (offset: number) => values.get(EBML.PrimaryRChromaticityX + offset) ?? 0;
		facts.mastering ??= {
			maxLuminance: values.get(EBML.LuminanceMax) ?? 0,
			minLuminance: values.get(EBML.LuminanceMin) ?? 0,
			primaries: values.has(EBML.PrimaryRChromaticityX)
				? { red: [at(0), at(1)], green: [at(2), at(3)], blue: [at(4), at(5)], white: [at(6), at(7)] }
				: null,
		};
	}
}

function readChapters(data: Uint8Array, chapters: Element): Chapter[] {
	const found: Chapter[] = [];
	for (const edition of elements(data, chapters.start, chapters.end)) {
		if (edition.id !== EBML.EditionEntry) continue;
		for (const atom of elements(data, edition.start, edition.end)) {
			if (atom.id !== EBML.ChapterAtom) continue;
			const parts = elements(data, atom.start, atom.end);
			const hidden = parts.find((part) => part.id === EBML.ChapterFlagHidden);
			if (hidden && uint(data, hidden) === 1) continue;
			const start = parts.find((part) => part.id === EBML.ChapterTimeStart);
			const display = parts.find((part) => part.id === EBML.ChapterDisplay);
			const name = display && child(data, display, EBML.ChapString);
			found.push({
				start: start ? uint(data, start) / 1e9 : 0,
				name: name ? text(data.subarray(name.start, name.end)) : '',
			});
		}
		// The first edition is the one played.
		if (found.length > 0) break;
	}
	return found;
}

/** `01:58:32.123456789`, as mkvmerge writes a track's DURATION tag. */
function tagDuration(value: string): number | null {
	const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
	if (!match) return null;
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** The statistics tags of each track: its duration and bitrate, keyed by the track's UID. */
function readTags(data: Uint8Array, tags: Element): Map<number, { duration: number | null; bitrate: number | null }> {
	const found = new Map<number, { duration: number | null; bitrate: number | null }>();
	for (const tag of elements(data, tags.start, tags.end)) {
		if (tag.id !== EBML.Tag) continue;
		const parts = elements(data, tag.start, tag.end);
		const targets = parts.find((part) => part.id === EBML.Targets);
		const uid = targets && child(data, targets, EBML.TagTrackUID);
		if (!uid) continue;
		const values = new Map<string, string>();
		for (const simple of parts) {
			if (simple.id !== EBML.SimpleTag) continue;
			const name = child(data, simple, EBML.TagName);
			const value = child(data, simple, EBML.TagString);
			if (name && value)
				values.set(text(data.subarray(name.start, name.end)), text(data.subarray(value.start, value.end)));
		}
		const duration = values.has('DURATION') ? tagDuration(values.get('DURATION') ?? '') : null;
		const bps = Number(values.get('BPS'));
		found.set(uint(data, uid), { duration, bitrate: Number.isFinite(bps) && bps > 0 ? bps : null });
	}
	return found;
}

/** Top-level elements of the Segment are read from the head, or where the SeekHead points. */
const HEAD = 1 << 20;

async function readMatroskaFacts(file: Blob): Promise<ContainerFacts> {
	const facts: ContainerFacts = { ...NO_CONTAINER_FACTS, chapters: [], tracks: new Map() };
	const head = await bytes(file, 0, HEAD);
	const segment = elements(head, 0, head.length).find((element) => element.id === EBML.Segment);
	if (!segment) return facts;
	const wanted = new Set<number>([EBML.Info, EBML.Tracks, EBML.Chapters, EBML.Tags]);
	// Tags name tracks by UID; tracks are known by number.
	const numbers = new Map<number, number>();
	let stats = new Map<number, { duration: number | null; bitrate: number | null }>();
	const handle = (data: Uint8Array, element: Element) => {
		if (element.id === EBML.Info) {
			for (const part of elements(data, element.start, element.end)) {
				const value = data.subarray(part.start, part.end);
				if (part.id === EBML.MuxingApp) facts.muxingApp = text(value);
				else if (part.id === EBML.WritingApp) facts.writingApp = text(value);
				else if (part.id === EBML.DateUTC) {
					// Nanoseconds from 2001-01-01, signed.
					const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
					if (value.byteLength === 8)
						facts.created = new Date(978_307_200_000 + Number(view.getBigInt64(0) / 1_000_000n));
				}
			}
		} else if (element.id === EBML.Tracks) {
			for (const entry of elements(data, element.start, element.end)) {
				if (entry.id !== EBML.TrackEntry) continue;
				const parts = elements(data, entry.start, entry.end);
				const value = (id: number) => {
					const part = parts.find((found) => found.id === id);
					return part ? uint(data, part) : null;
				};
				if (value(EBML.TrackType) === 1) readVideoEntry(data, entry, facts);
				const number = value(EBML.TrackNumber);
				if (number === null) continue;
				const uid = value(EBML.TrackUID);
				if (uid !== null) numbers.set(uid, number);
				facts.tracks.set(number, {
					duration: null,
					bitrate: null,
					hearingImpaired: value(EBML.FlagHearingImpaired) === 1,
					described: value(EBML.FlagVisualImpaired) === 1 || value(EBML.FlagTextDescriptions) === 1,
				});
			}
		} else if (element.id === EBML.Chapters) {
			facts.chapters = readChapters(data, element);
		} else if (element.id === EBML.Tags) {
			stats = readTags(data, element);
		}
		wanted.delete(element.id);
	};
	const positions = new Map<number, number>();
	for (const element of elements(head, segment.start, head.length)) {
		if (element.id === EBML.Cluster) break;
		if (element.id === EBML.SeekHead) {
			for (const seek of elements(head, element.start, element.end)) {
				const id = seek.id === EBML.Seek ? child(head, seek, EBML.SeekID) : undefined;
				const position = seek.id === EBML.Seek ? child(head, seek, EBML.SeekPosition) : undefined;
				if (id && position) positions.set(uint(head, id), segment.start + uint(head, position));
			}
		}
		// Only elements read whole in the head count; a longer one is read on its own below.
		if (wanted.has(element.id) && (element.end < head.length || head.length >= file.size)) handle(head, element);
	}
	// What the head didn't hold, chapters written at the end for instance, is read where it is.
	const read = await Promise.all(
		[...wanted].map(async (id) => {
			const position = positions.get(id);
			if (position === undefined || position >= file.size) return null;
			const start = await bytes(file, position, 16);
			const size = readId(start, 0) && readSize(start, readId(start, 0)?.[1] ?? 0);
			if (!size || size[0] < 0 || size[0] > 16 << 20) return null;
			const data = await bytes(file, position, size[1] + size[0]);
			const [element] = elements(data, 0, data.length);
			return element?.id === id ? { data, element } : null;
		}),
	);
	for (const found of read) if (found) handle(found.data, found.element);
	for (const [uid, { duration, bitrate }] of stats) {
		const track = facts.tracks.get(numbers.get(uid) ?? -1);
		if (track) Object.assign(track, { duration, bitrate });
	}
	return facts;
}

/** What the headers of an MP4, MOV or Matroska file say; nothing for other formats. */
export async function readContainerFacts(file: Blob): Promise<ContainerFacts> {
	const head = await bytes(file, 0, 12);
	const fourcc = String.fromCharCode(...head.subarray(4, 8));
	try {
		if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
			return await readMatroskaFacts(file);
		if (['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(fourcc)) {
			const moov = await readMoov(file);
			return moov ? readIsoFacts(moov) : NO_CONTAINER_FACTS;
		}
	} catch {
		// A damaged header is not worth failing the panel over.
	}
	return NO_CONTAINER_FACTS;
}

/**
 * The HDR metadata a copy of `file`'s video keeps in its container: the Dolby Vision
 * configuration, mastering display and light levels, as they are. Undefined when there are none.
 */
export async function containerHdr(file: Blob): Promise<VideoTrackMetadata['hdr']> {
	const facts = await readContainerFacts(file);
	if (!facts.dolbyVisionRecord && !facts.mastering && !facts.light) return undefined;
	return {
		dolbyVision: facts.dolbyVisionRecord ?? undefined,
		mastering: facts.mastering ?? undefined,
		contentLight: facts.light ?? undefined,
	};
}
