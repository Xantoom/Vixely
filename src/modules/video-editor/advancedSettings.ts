import { AUDIO_CODECS, isValidAudioCombo, isValidCombo, VIDEO_CODECS } from '@/config/codecs.ts';
import type { AdvancedVideoSettings } from '@/stores/videoEditor.ts';

export function codecSupportsQp(codec: string): boolean {
	return codec === 'libx264' || codec === 'libx265';
}

/** Apply a single advanced-settings field update while keeping codec/container/audio combos valid. */
export function applyAdvancedUpdate(
	settings: AdvancedVideoSettings,
	key: keyof AdvancedVideoSettings,
	value: AdvancedVideoSettings[keyof AdvancedVideoSettings],
): AdvancedVideoSettings {
	const next = { ...settings, [key]: value };
	if (key === 'codec' && typeof value === 'string' && !isValidCombo(value, next.container)) {
		const codec = VIDEO_CODECS.find((c) => c.encoderId === value);
		if (codec) next.container = codec.containers[0]!;
	}
	if (key === 'container' && typeof value === 'string' && !isValidCombo(next.codec, value)) {
		const validCodec = VIDEO_CODECS.find((c) => c.containers.includes(value));
		if (validCodec) next.codec = validCodec.encoderId;
	}
	if (key === 'container' && typeof value === 'string' && !isValidAudioCombo(next.audioCodec, value)) {
		const validAudio = AUDIO_CODECS.find((c) => c.encoderId !== 'none' && c.containers.includes(value));
		if (validAudio) next.audioCodec = validAudio.encoderId;
	}
	if (!codecSupportsQp(next.codec) && next.rateControl === 'qp') {
		next.rateControl = 'crf';
	}
	return next;
}
