import type { InputAudioTrack } from 'mediabunny';

/**
 * Sound codecs browsers don't decode, common in films: Dolby Digital (AC-3, E-AC-3) and DTS, read
 * by FFmpeg's decoders built for WebAssembly, and Dolby TrueHD, by vixely-truehd. Each is loaded
 * the first time a track needs it, in the page or worker that reads the track.
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
	truehd: async () => {
		(await import('./truehd')).registerTrueHdDecoder();
	},
};

/** The codecs' names in WebCodecs, to ask the browser whether it has a decoder of its own. */
const WEB_CODECS: Record<string, string> = { ac3: 'ac-3', eac3: 'ec-3', dts: 'dtsc', truehd: 'mlpa' };

const loaded = new Map<string, Promise<void>>();

/** Loads the decoder a codec needs when the browser has none; nothing for the others. */
async function ensureDecoder(codec: string | null): Promise<void> {
	const load = codec ? EXTENSIONS[codec] : undefined;
	if (!codec || !load) return;
	// AC-3 and E-AC-3 share one package: registered once.
	const key = codec === 'eac3' ? 'ac3' : codec;
	let pending = loaded.get(key);
	if (!pending) {
		pending = (async () => {
			// Safari decodes Dolby Digital itself.
			const native = await AudioDecoder.isConfigSupported({
				codec: WEB_CODECS[codec] ?? codec,
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
