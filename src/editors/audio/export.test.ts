import { describe, expect, it } from 'vitest';
import { type AudioExportSettings, availableBitrates, outputBitrate, outputChannels, outputRate } from './export';

const base: AudioExportSettings = {
	format: 'mp3',
	bitrate: 192,
	sampleRate: null,
	channels: 'keep',
	bitDepth: 16,
	tags: { title: '', artist: '', album: '' },
	cover: 'keep',
};

describe('audio export settings', () => {
	it('keeps the source rate when the encoder accepts it', () => {
		expect(outputRate(base, { sampleRate: 44_100, channels: 2 })).toBe(44_100);
		// MP3 has no 96 kHz: the highest rate it has.
		expect(outputRate(base, { sampleRate: 96_000, channels: 2 })).toBe(48_000);
		// Opus always runs at 48 kHz.
		expect(outputRate({ ...base, format: 'opus' }, { sampleRate: 44_100, channels: 2 })).toBe(48_000);
		// An unusual rate goes up to the next one, so no frequency is lost.
		expect(outputRate({ ...base, format: 'flac' }, { sampleRate: 37_800, channels: 2 })).toBe(44_100);
		expect(outputRate({ ...base, sampleRate: 22_050 }, { sampleRate: 44_100, channels: 2 })).toBe(22_050);
	});

	it('folds wide layouts to stereo for lossy formats only', () => {
		const surround = { sampleRate: 48_000, channels: 6 };
		expect(outputChannels(base, surround)).toBe(2);
		expect(outputChannels({ ...base, format: 'flac' }, surround)).toBe(6);
		expect(outputChannels({ ...base, channels: 'mono' }, surround)).toBe(1);
	});

	it('offers only the MP3 bitrates a sample rate allows', () => {
		expect(availableBitrates('mp3', 44_100)).toContain(320);
		expect(Math.max(...availableBitrates('mp3', 22_050))).toBe(160);
		expect(Math.max(...availableBitrates('mp3', 8000))).toBe(64);
		expect(outputBitrate(base, 8000)).toBe(64);
		expect(outputBitrate(base, 44_100)).toBe(192);
	});
});
