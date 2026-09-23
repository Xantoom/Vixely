import { describe, expect, it } from 'vitest';
import { codecName, formatBytes, formatClock, formatFrameRate, formatTimecode, groupDigits } from './format';

describe('format', () => {
	it('groups digits with thin spaces', () => {
		expect(groupDigits(2500)).toBe('2 500');
		expect(groupDigits(48000)).toBe('48 000');
		expect(groupDigits(999)).toBe('999');
	});

	it('formats sizes in decimal units', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(11_917_000)).toBe('11.9 MB');
		expect(formatBytes(245_000_000)).toBe('245 MB');
		expect(formatBytes(4_300_000_000)).toBe('4.3 GB');
	});

	it('formats timecodes with frames', () => {
		expect(formatTimecode(26.4)).toBe('00:00:26:12');
		expect(formatTimecode(64)).toBe('00:01:04:00');
		expect(formatTimecode(3725.5, 25)).toBe('01:02:05:12');
		expect(formatTimecode(-1)).toBe('00:00:00:00');
	});

	it('formats ruler clocks', () => {
		expect(formatClock(64)).toBe('1:04');
		expect(formatClock(3730)).toBe('1:02:10');
	});

	it('names frame rates like editors do', () => {
		expect(formatFrameRate(29.97002997)).toBe('29.97 fps');
		expect(formatFrameRate(23.976)).toBe('23.976 fps');
		expect(formatFrameRate(12.5)).toBe('12.5 fps');
	});

	it('names codecs', () => {
		expect(codecName('avc')).toBe('H.264');
		expect(codecName('pcm-s16')).toBe('PCM S16');
		expect(codecName('something')).toBe('SOMETHING');
	});
});
