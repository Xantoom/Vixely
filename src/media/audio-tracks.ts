import type { Input, InputAudioTrack } from 'mediabunny';

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

export async function listAudioTracks(input: Input): Promise<AudioTrackInfo[]> {
	const tracks = await input.getAudioTracks();
	return Promise.all(
		tracks.map(async (track) => {
			const [language, name, codec, channels, sampleRate, disposition, playable] = await Promise.all([
				track.getLanguageCode(),
				track.getName(),
				track.getCodec(),
				track.getNumberOfChannels(),
				track.getSampleRate(),
				track.getDisposition(),
				track.canDecode(),
			]);
			return {
				id: track.id,
				language,
				name,
				codec,
				channels,
				sampleRate,
				default: disposition.default,
				commentary: disposition.commentary,
				playable,
			};
		}),
	);
}
