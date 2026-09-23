import { describe, expect, it } from 'vitest';
import { createAudioDoc } from './document';
import {
	type AudioExportSettings,
	copyBlocker,
	outputChannels,
	outputRate,
	settingsFromSource,
	type SourceFormat,
} from './export';

function source(sampleRate: number, channels = 2): SourceFormat {
	return { codec: 'mp3', sampleRate, channels, bitrate: 256, bitDepth: 16 };
}

const base: AudioExportSettings = {
	mode: 'encode',
	format: 'mp3',
	bitrate: 192,
	sampleRate: null,
	channels: 'keep',
	bitDepth: 16,
	tags: { title: '', artist: '', album: '' },
	cover: 'keep',
};

describe('audio export settings', () => {
	it('keeps the source rate when it is 44.1 or 48 kHz', () => {
		expect(outputRate(base, source(44_100))).toBe(44_100);
		expect(outputRate(base, source(48_000))).toBe(48_000);
		// Other rates go to the nearest standard one at or above, or 48 kHz.
		expect(outputRate(base, source(96_000))).toBe(48_000);
		expect(outputRate(base, source(22_050))).toBe(44_100);
		// Opus always runs at 48 kHz.
		expect(outputRate({ ...base, format: 'opus' }, source(44_100))).toBe(48_000);
		expect(outputRate({ ...base, sampleRate: 48_000 }, source(44_100))).toBe(48_000);
	});

	it('folds wide layouts to stereo for lossy formats only', () => {
		const surround = source(48_000, 6);
		expect(outputChannels(base, surround)).toBe(2);
		expect(outputChannels({ ...base, format: 'flac' }, surround)).toBe(6);
		expect(outputChannels({ ...base, channels: 'mono' }, surround)).toBe(1);
	});

	it('starts from the source: original encoding, same format and bitrate', () => {
		const settings = settingsFromSource(
			{ codec: 'aac', sampleRate: 44_100, channels: 2, bitrate: 250, bitDepth: 16 },
			base,
		);
		expect(settings).toMatchObject({
			mode: 'copy',
			format: 'aac',
			bitrate: 256,
			sampleRate: null,
			channels: 'keep',
		});
		const wav = settingsFromSource(
			{ codec: 'pcm-s24', sampleRate: 96_000, channels: 2, bitrate: null, bitDepth: 24 },
			base,
		);
		expect(wav).toMatchObject({ format: 'wav', bitDepth: 24 });
		expect(settingsFromSource({ ...source(44_100), codec: 'vorbis' }, base).format).toBe('opus');
	});

	it('keeps the original encoding only when the sound is unchanged', () => {
		const doc = createAudioDoc(60);
		expect(copyBlocker(doc, source(44_100))).toBeNull();
		expect(copyBlocker({ ...doc, trim: { start: 5, end: 50 } }, source(44_100))).toBeNull();
		expect(copyBlocker({ ...doc, gain: 2 }, source(44_100))).toBe('volume');
		expect(copyBlocker({ ...doc, normalize: -14 }, source(44_100))).toBe('volume');
		expect(copyBlocker({ ...doc, fadeIn: 1 }, source(44_100))).toBe('volume');
		expect(copyBlocker(doc, { ...source(44_100), codec: null })).toBe('codec');
	});
});
