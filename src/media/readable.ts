/**
 * Audio files browsers can't read, turned into WAV as they are opened: AIFF, the Mac's WAV, and
 * Apple Lossless (ALAC) in M4A files. The WAV keeps the file's name, tags and cover, so the
 * editors, exports and batches read it like any other file.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	Input,
	type MetadataTags,
	Output,
	WavOutputFormat,
} from 'mediabunny';
import { loadAudio } from '@/wasm/audio';

/** Files formats that may hold Apple Lossless. */
const MP4_FORMATS = new Set(['m4a', 'mp4', 'mov']);
/** Apple Lossless is decoded in memory: past this, the file is left as it is. */
const ALAC_LIMIT = 2_000_000_000;

const converted = new WeakMap<File, Promise<File>>();

/** The file as the editors can read it: itself, or a WAV made from it. */
export async function readableFile(file: File, format: string): Promise<File> {
	if (format !== 'aiff' && !MP4_FORMATS.has(format)) return file;
	let pending = converted.get(file);
	if (!pending) {
		pending = format === 'aiff' ? aiffToWav(file) : alacToWav(file).then((wav) => wav ?? file);
		converted.set(file, pending);
	}
	return pending;
}

async function bytes(file: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function ascii(data: Uint8Array, at: number): string {
	return String.fromCharCode(...data.subarray(at, at + 4));
}

/** A RIFF chunk: its id, its size, then its data padded to an even length. */
function riffChunk(id: string, data: Blob): BlobPart[] {
	const head = new Uint8Array(8);
	for (let k = 0; k < 4; k++) head[k] = id.charCodeAt(k);
	new DataView(head.buffer).setUint32(4, data.size, true);
	return data.size % 2 ? [head, data, new Uint8Array(1)] : [head, data];
}

/**
 * AIFF: its sound data, byte-swapped a piece at a time, after a WAV header. Its ID3 tags, where
 * music software keeps the title, artist and cover, go along as the WAV's own.
 */
async function aiffToWav(file: File): Promise<File> {
	const compressed = ascii(await bytes(file, 8, 12), 0) === 'AIFC';
	let comm: Uint8Array | null = null;
	let sound: { start: number; length: number } | null = null;
	let tags: Blob | null = null;
	for (let at = 12; at + 8 <= file.size;) {
		// Sequential on purpose: each chunk says where the next starts. A file has only a few.
		// oxlint-disable-next-line no-await-in-loop
		const head = await bytes(file, at, at + 8);
		const size = new DataView(head.buffer).getUint32(4);
		const body = at + 8;
		const id = ascii(head, 0);
		if (id === 'COMM') {
			// oxlint-disable-next-line no-await-in-loop
			comm = await bytes(file, body, body + size);
		} else if (id === 'SSND') {
			// oxlint-disable-next-line no-await-in-loop
			const offset = new DataView((await bytes(file, body, body + 4)).buffer).getUint32(0);
			const start = body + 8 + offset;
			sound = { start, length: Math.min(size - 8 - offset, file.size - start) };
		} else if (id === 'ID3 ' || id === 'id3 ') {
			tags = file.slice(body, body + size);
		}
		at = body + size + (size % 2);
	}
	if (!comm || !sound) throw new Error('AIFF: no sound');
	const audio = await loadAudio();
	const trailing = tags ? 8 + tags.size + (tags.size % 2) : 0;
	const converter = new audio.AiffWav(comm, compressed, sound.length, trailing);
	try {
		const length = converter.data_length();
		const parts: BlobPart[] = [converter.header().slice()];
		const piece = converter.sample_bytes() << 20;
		for (let at = 0; at < length; at += piece) {
			// oxlint-disable-next-line no-await-in-loop
			const data = await bytes(file, sound.start + at, sound.start + Math.min(length, at + piece));
			converter.convert(data);
			parts.push(data);
		}
		if (length % 2) parts.push(new Uint8Array(1));
		if (tags) parts.push(...riffChunk('ID3 ', tags));
		return new File(parts, file.name, { type: 'audio/wav', lastModified: file.lastModified });
	} finally {
		converter.free();
	}
}

/**
 * Apple Lossless, decoded into a WAV with the file's tags and cover. Null when the file holds no
 * Apple Lossless: other MP4 files are read as they are.
 */
async function alacToWav(file: File): Promise<File | null> {
	if (file.size > ALAC_LIMIT) return null;
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	let tags: MetadataTags;
	try {
		const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
		if (video || !audio || (await audio.getCodec()) !== null || audio.internalCodecId !== 'alac') return null;
		tags = await input.getMetadataTags().catch((): MetadataTags => ({}));
	} catch {
		return null;
	} finally {
		input.dispose();
	}

	const decoder = await loadAudio();
	const pcm = decoder.decode_alac(new Uint8Array(await file.arrayBuffer()));
	const [channels, rate, bits, data] = [pcm.channels(), pcm.rate(), pcm.bits(), pcm.take_data()];
	pcm.free();

	const codec = bits === 16 ? 'pcm-s16' : bits === 24 ? 'pcm-s24' : 'pcm-s32';
	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat({ large: data.length > 4_000_000_000, metadataFormat: 'id3' }),
		target,
	});
	const source = new EncodedAudioPacketSource(codec);
	output.addAudioTrack(source);
	output.setMetadataTags(tags);
	await output.start();
	// A second of sound per packet.
	const block = (channels * bits) / 8;
	for (let frame = 0; frame * block < data.length; frame += rate) {
		const piece = data.subarray(frame * block, Math.min(data.length, (frame + rate) * block));
		const packet = new EncodedPacket(piece, 'key', frame / rate, piece.length / block / rate);
		// oxlint-disable-next-line no-await-in-loop -- packets go in order
		await source.add(
			packet,
			frame === 0 ? { decoderConfig: { codec, numberOfChannels: channels, sampleRate: rate } } : undefined,
		);
	}
	source.close();
	await output.finalize();
	if (!target.buffer) return null;
	return new File([target.buffer], file.name, { type: 'audio/wav', lastModified: file.lastModified });
}
