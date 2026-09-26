import type { InputAudioTrack } from 'mediabunny';

/**
 * Sound codecs browsers don't decode, read by FFmpeg's decoders built for WebAssembly: Dolby
 * Digital (AC-3, E-AC-3) and DTS, common in films. Each is loaded the first time a track needs it,
 * in the page or worker that reads the track.
 */
const EXTENSIONS: Record<string, () => Promise<void>> = {
	ac3: async () => {
		(await import('@mediabunny/ac3')).registerAc3Decoder();
	},
	eac3: async () => {
		(await import('@mediabunny/ac3')).registerAc3Decoder();
	},
	dts: async () => {
		(await import('@mediabunny/dts')).registerDtsDecoder();
	},
};

const loaded = new Map<string, Promise<void>>();

/** Loads the decoder a codec needs when the browser has none; nothing for the others. */
export async function ensureDecoder(codec: string | null): Promise<void> {
	const load = codec ? EXTENSIONS[codec] : undefined;
	if (!codec || !load) return;
	// AC-3 and E-AC-3 share one package: registered once.
	const key = codec === 'eac3' ? 'ac3' : codec;
	let pending = loaded.get(key);
	if (!pending) {
		pending = (async () => {
			// Safari decodes Dolby Digital itself.
			const native = await AudioDecoder.isConfigSupported({
				codec: codec === 'dts' ? 'dtsc' : codec === 'eac3' ? 'ec-3' : 'ac-3',
				numberOfChannels: 2,
				sampleRate: 48_000,
			}).catch(() => ({ supported: false }));
			if (!native.supported) await load();
		})();
		loaded.set(key, pending);
	}
	await pending.catch(() => undefined);
}

/** Whether the track can be decoded here, with the extension decoders when needed. */
export async function canDecodeAudio(track: InputAudioTrack): Promise<boolean> {
	await ensureDecoder(await track.getCodec());
	return track.canDecode();
}
