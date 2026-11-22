import {
	AUDIO_CODECS,
	getDecodableAudioCodecs,
	getDecodableVideoCodecs,
	getEncodableAudioCodecs,
	getEncodableVideoCodecs,
	NON_PCM_AUDIO_CODECS,
	VIDEO_CODECS,
} from 'mediabunny';
import { simd, threads } from 'wasm-feature-detect';
import { loadCore } from '@/wasm/core';

export interface CodecSupport {
	codec: string;
	decode: boolean;
	encode: boolean;
	/** Decoded by Vixely itself where the browser can't (see decoders.ts). */
	decodedByVixely: boolean;
	/** Encoded by Vixely itself where the browser can't (the WebAssembly encoders of audio/export.ts). */
	encodedByVixely: boolean;
}

/** Codecs Vixely decodes itself when the browser doesn't: Dolby Digital, DTS, TrueHD, ProRes. */
const VIXELY_DECODES = new Set(['ac3', 'eac3', 'dts', 'truehd', 'prores']);
/** Sound codecs Vixely encodes itself when the browser doesn't: MP3, AAC, FLAC. */
const VIXELY_ENCODES = new Set(['mp3', 'aac', 'flac']);

export interface Capabilities {
	webCodecs: boolean;
	crossOriginIsolated: boolean;
	webgl2: boolean;
	offscreenCanvas: boolean;
	savePicker: boolean;
	opfs: boolean;
	wasmSimd: boolean;
	wasmThreads: boolean;
	coreVersion: string | null;
	video: CodecSupport[];
	audio: CodecSupport[];
}

function hasWebGl2(): boolean {
	try {
		return document.createElement('canvas').getContext('webgl2') !== null;
	} catch {
		return false;
	}
}

function merge(all: readonly string[], decodable: string[], encodable: string[]): CodecSupport[] {
	return all.map((codec) => {
		const browser = decodable.includes(codec);
		const vixely = !browser && VIXELY_DECODES.has(codec);
		const browserEncodes = encodable.includes(codec);
		const vixelyEncodes = !browserEncodes && VIXELY_ENCODES.has(codec);
		return {
			codec,
			decode: browser || vixely,
			encode: browserEncodes || vixelyEncodes,
			decodedByVixely: vixely,
			encodedByVixely: vixelyEncodes,
		};
	});
}

let detecting: Promise<Capabilities> | null = null;

/**
 * Detects what this browser can do. Codec support depends on the device (hardware encoders), so
 * the answer is computed once per session and shared by every editor.
 */
export async function detectCapabilities(): Promise<Capabilities> {
	detecting ??= (async () => {
		const webCodecs = typeof VideoDecoder !== 'undefined' && typeof AudioDecoder !== 'undefined';
		const [videoDecode, videoEncode, audioDecode, audioEncode, wasmSimd, wasmThreads, core] = await Promise.all([
			webCodecs ? getDecodableVideoCodecs() : Promise.resolve([]),
			webCodecs ? getEncodableVideoCodecs() : Promise.resolve([]),
			webCodecs ? getDecodableAudioCodecs() : Promise.resolve([]),
			// No encoder makes TrueHD, and asking about it throws.
			webCodecs
				? getEncodableAudioCodecs(AUDIO_CODECS.filter((codec) => codec !== 'truehd'))
				: Promise.resolve([]),
			simd(),
			threads(),
			loadCore().catch(() => null),
		]);
		const audioCodecs = AUDIO_CODECS.filter((codec) => (NON_PCM_AUDIO_CODECS as readonly string[]).includes(codec));

		return {
			webCodecs,
			crossOriginIsolated: globalThis.crossOriginIsolated,
			webgl2: hasWebGl2(),
			offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
			savePicker: 'showSaveFilePicker' in globalThis,
			opfs: typeof navigator.storage?.getDirectory === 'function',
			wasmSimd,
			wasmThreads,
			coreVersion: core?.version() ?? null,
			video: merge(VIDEO_CODECS, videoDecode, videoEncode),
			audio: merge(audioCodecs, audioDecode, audioEncode),
		};
	})();
	return detecting;
}
