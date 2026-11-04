import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';

/**
 * Codecs browsers don't decode: Dolby Digital (AC-3, E-AC-3) and DTS, read by FFmpeg's decoders
 * built for WebAssembly, Dolby TrueHD, by vixely-truehd, and ProRes. Each is loaded the first time
 * a track needs it, in the page or worker that reads the track.
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
	prores: async () => {
		(await import('@mediabunny/prores')).registerProresDecoder();
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
			const name = WEB_CODECS[codec];
			const native =
				name &&
				(await AudioDecoder.isConfigSupported({ codec: name, numberOfChannels: 2, sampleRate: 48_000 }).catch(
					() => ({ supported: false }),
				));
			if (!native || !native.supported) await load();
		})();
		loaded.set(key, pending);
	}
	await pending.catch(() => undefined);
}

/** Whether the track can be decoded here, with the extension decoders when needed. */
export async function canDecode(track: InputAudioTrack | InputVideoTrack): Promise<boolean> {
	await ensureDecoder(await track.getCodec());
	return track.canDecode();
}
