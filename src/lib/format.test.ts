import { describe, expect, it } from 'vitest';
import {
	codecName,
	formatAperture,
	formatBytes,
	formatClock,
	formatCoordinates,
	formatExifDate,
	formatFocalLength,
	formatFrameRate,
	formatPreciseTime,
	formatShutter,
	formatTimecode,
	groupDigits,
	parseTime,
} from './format';

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

	it('formats and reads millisecond times', () => {
		expect(formatPreciseTime(4.25)).toBe('0:04.250');
		expect(formatPreciseTime(59.9996)).toBe('1:00.000');
		expect(formatPreciseTime(3730.5)).toBe('1:02:10.500');
		expect(parseTime('1:04.25')).toBe(64.25);
		expect(parseTime('64,5')).toBe(64.5);
		expect(parseTime('1:02:03')).toBe(3723);
		expect(parseTime(' 12 ')).toBe(12);
		expect(parseTime('1:x')).toBeNull();
		expect(parseTime('')).toBeNull();
		expect(parseTime('1::2')).toBeNull();
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

	it('formats exposure values like photographers', () => {
		expect(formatShutter(0.004)).toBe('1/250 s');
		expect(formatShutter(0.5)).toBe('1/2 s');
		expect(formatShutter(2)).toBe('2 s');
		expect(formatAperture(2.8)).toBe('f/2.8');
		expect(formatFocalLength(35)).toBe('35 mm');
	});

	it('formats EXIF dates and coordinates', () => {
		expect(formatExifDate('2026:07:14 18:32:05', 'en-GB')).toBe('14 Jul 2026, 18:32');
		expect(formatExifDate('not a date', 'en-GB')).toBe('not a date');
		expect(formatCoordinates(48.85821, -2.29449)).toBe('48.8582° N, 2.2945° W');
	});
});
