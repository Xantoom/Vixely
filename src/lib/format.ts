/** Thin space, used as a thousands separator in technical values (`12 000 kb/s`). */
const THIN_SPACE = ' ';

export function groupDigits(value: number): string {
	return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/** Decimal units, like operating systems show file sizes: 1 MB = 1 000 000 bytes. */
export function formatBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1000;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit += 1;
	}
	return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Editing timecode `HH:MM:SS:FF`, with frames counted at the given rate. */
export function formatTimecode(seconds: number, fps = 30): string {
	const safe = Math.max(0, seconds);
	const frames = Math.floor((safe % 1) * Math.round(fps) + 1e-6);
	const whole = Math.floor(safe);
	const parts = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60, frames];
	return parts.map((part) => String(part).padStart(2, '0')).join(':');
}

/** Ruler labels: `0:40`, `1:04`, `1:02:10`. */
export function formatClock(seconds: number): string {
	const whole = Math.max(0, Math.round(seconds));
	const h = Math.floor(whole / 3600);
	const mm = Math.floor(whole / 60) % 60;
	const ss = String(whole % 60).padStart(2, '0');
	return h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/**
 * Millisecond time, for audio where there are no frames: `0:04.250`, `12:30.000`, `1:02:10.500`.
 * Rounded to the millisecond first, so 59.9996 reads `1:00.000` rather than `0:60.000`.
 */
export function formatPreciseTime(seconds: number): string {
	const ms = Math.round(Math.max(0, seconds) * 1000);
	const whole = Math.floor(ms / 1000);
	const h = Math.floor(whole / 3600);
	const mm = Math.floor(whole / 60) % 60;
	const ss = `${String(whole % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
	return h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/**
 * Reads a time typed by the user: `1:04.25`, `64.25`, `64,25`, `1:02:03`. Returns null when the
 * text is not a time.
 */
export function parseTime(text: string): number | null {
	const parts = text.trim().replace(',', '.').split(':');
	if (parts.length > 3 || parts.some((part) => !/^\d*\.?\d*$/.test(part) || part === '' || part === '.')) {
		return null;
	}
	return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** Common broadcast rates are shown the way editors write them: 29.97, 23.976, 60. */
export function formatFrameRate(fps: number): string {
	const known = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
	const match = known.find((rate) => Math.abs(rate - fps) < 0.02);
	const value = match ?? Math.round(fps * 100) / 100;
	return `${value} fps`;
}

export function formatSampleRate(hz: number): string {
	return `${groupDigits(hz)} Hz`;
}

const CODEC_NAMES: Record<string, string> = {
	avc: 'H.264',
	hevc: 'HEVC',
	vp8: 'VP8',
	vp9: 'VP9',
	av1: 'AV1',
	prores: 'ProRes',
	aac: 'AAC',
	opus: 'Opus',
	mp3: 'MP3',
	vorbis: 'Vorbis',
	flac: 'FLAC',
	ac3: 'AC-3',
	eac3: 'E-AC-3',
	dts: 'DTS',
};

export function codecName(codec: string): string {
	if (codec in CODEC_NAMES) return CODEC_NAMES[codec] ?? codec;
	if (codec.startsWith('pcm-')) return `PCM ${codec.slice(4).toUpperCase()}`;
	return codec.toUpperCase();
}

/** Shutter speed as photographers write it: `1/250 s`, `0.5 s` is `1/2 s`, long exposures `2 s`. */
export function formatShutter(seconds: number): string {
	if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`;
	return `1/${Math.round(1 / seconds)} s`;
}

export function formatAperture(fNumber: number): string {
	return `f/${Math.round(fNumber * 10) / 10}`;
}

export function formatFocalLength(millimetres: number): string {
	return `${Math.round(millimetres * 10) / 10} mm`;
}

/** EXIF dates (`2026:07:14 18:32:05`, local time of the camera) in the user's language. */
export function formatExifDate(value: string, locale: string): string {
	const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
	if (!match) return value;
	const [, y, mo, d, h, mi] = match.map(Number);
	const date = new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatCoordinates(latitude: number, longitude: number): string {
	const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'S' : 'N'}`;
	const lon = `${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'W' : 'E'}`;
	return `${lat}, ${lon}`;
}
