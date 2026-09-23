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
