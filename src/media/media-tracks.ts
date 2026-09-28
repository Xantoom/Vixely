import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { codecName } from '@/lib/format';
import type { MediaTrackInfo } from './subtitle-source';

/**
 * The video and audio tracks of a file vixely-subs doesn't read, such as MPEG-TS and Blu-ray
 * M2TS, as Mediabunny lists them: the export keeps them. Empty when the file can't be read.
 */
export async function probeMediaTracks(file: File): Promise<MediaTrackInfo[]> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const tracks = (await input.getTracks()).filter((track) => track.isVideoTrack() || track.isAudioTrack());
		return await Promise.all(
			tracks.map(async (track) => {
				const [codec, language, name, disposition] = await Promise.all([
					track.getCodec(),
					track.getLanguageCode(),
					track.getName(),
					track.getDisposition(),
				]);
				return {
					id: track.id,
					kind: track.isVideoTrack() ? 'video' : 'audio',
					codec: codec ? codecName(codec) : '',
					language,
					name: name ?? '',
					default: disposition.default,
				} satisfies MediaTrackInfo;
			}),
		);
	} catch {
		return [];
	} finally {
		input.dispose();
	}
}
