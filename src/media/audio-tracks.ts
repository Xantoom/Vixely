import { ALL_FORMATS, BlobSource, Input, type InputAudioTrack } from 'mediabunny';
import { canDecodeAudio } from './decoders';

/** An audio track of a file, as players list them. */
export interface AudioTrackInfo {
	/** Track ID in the file. */
	id: number;
	/** ISO 639-2, `und` when unknown. */
	language: string;
	name: string | null;
	codec: string | null;
	channels: number;
	sampleRate: number;
	default: boolean;
	commentary: boolean;
	/** Whether this browser can decode it. */
	playable: boolean;
}

/** The audio track with this ID, or the file's main one when no ID is given. */
export async function findAudioTrack(input: Input, id: number | null | undefined): Promise<InputAudioTrack | null> {
	if (id === null || id === undefined) return input.getPrimaryAudioTrack();
	const tracks = await input.getAudioTracks();
	return tracks.find((track) => track.id === id) ?? null;
}

/** What players show of an audio track. */
async function describe(track: InputAudioTrack, id = track.id): Promise<AudioTrackInfo> {
	const [language, name, codec, channels, sampleRate, disposition, playable] = await Promise.all([
		track.getLanguageCode(),
		track.getName(),
		track.getCodec(),
		track.getNumberOfChannels(),
		track.getSampleRate(),
		track.getDisposition(),
		canDecodeAudio(track),
	]);
	return {
		id,
		language,
		name,
		codec,
		channels,
		sampleRate,
		default: disposition.default,
		commentary: disposition.commentary,
		playable,
	};
}

export async function listAudioTracks(input: Input): Promise<AudioTrackInfo[]> {
	const tracks = await input.getAudioTracks();
	return Promise.all(tracks.map(async (track) => describe(track)));
}

/** The main audio track of another file, listed under `id`; null when it has no sound. */
export async function describeAudioFile(file: File, id: number): Promise<AudioTrackInfo | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryAudioTrack();
		return track ? await describe(track, id) : null;
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** Bitrates measured, per file and track: reading them takes a moment. */
const bitrates = new WeakMap<File, Map<number | null, Promise<number | null>>>();

/**
 * Average bitrate of an audio track in kb/s, read from its first packets, or null when it can't
 * be read; `id` null measures the file's main track. Measured once per file and track.
 */
export async function audioBitrate(file: File, id: number | null): Promise<number | null> {
	let known = bitrates.get(file);
	if (!known) {
		known = new Map();
		bitrates.set(file, known);
	}
	let measured = known.get(id);
	if (!measured) {
		measured = (async () => {
			const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
			try {
				const track = await findAudioTrack(input, id);
				const stats = track ? await track.computePacketStats(300) : null;
				return stats ? Math.round(stats.averageBitrate / 1000) || null : null;
			} catch {
				return null;
			} finally {
				input.dispose();
			}
		})();
		known.set(id, measured);
	}
	return measured;
}
