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
}

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
	return all.map((codec) => ({ codec, decode: decodable.includes(codec), encode: encodable.includes(codec) }));
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
			webCodecs ? getEncodableAudioCodecs() : Promise.resolve([]),
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
