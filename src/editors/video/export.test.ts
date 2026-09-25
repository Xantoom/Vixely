import { describe, expect, it } from 'vitest';
import { createImageDoc } from '../image/document';
import type { SubtitleDoc } from '../subtitles/document';
import { mergeParts } from './copy-tracks';
import { outputSize, resolveAudio, settingsFromSource, type VideoSource } from './export';
import { cutSubtitles } from './mux';

const source: VideoSource = {
	container: 'mkv',
	codec: 'hevc',
	frameRate: 23.976,
	bitrate: 4200,
	audioCodec: 'aac',
	audioBitrate: 192,
};

describe('video export settings', () => {
	it('start from the source, with a codec this browser encodes', () => {
		const settings = settingsFromSource(source, ['avc', 'vp9']);
		expect(settings).toMatchObject({ mode: 'copy', container: 'mkv', codec: 'avc', bitrate: 4200, audio: 'copy' });
		expect(settingsFromSource(source, ['avc', 'hevc']).codec).toBe('hevc');
	});

	it('copy the sound only where it fits and nothing was cut', () => {
		const settings = settingsFromSource(source, ['avc']);
		expect(resolveAudio(settings, source, false)).toBe('copy');
		expect(resolveAudio(settings, source, true)).toBe('aac');
		expect(resolveAudio({ ...settings, container: 'webm' }, source, false)).toBe('opus');
		expect(resolveAudio({ ...settings, audio: 'aac', container: 'webm' }, source, false)).toBe('opus');
	});

	it('keep even sizes, never larger than the crop', () => {
		const picture = { ...createImageDoc(), crop: { x: 10, y: 10, width: 1001, height: 563 } };
		expect(outputSize(picture, { width: 1920, height: 1080 }, null)).toEqual({ width: 1002, height: 564 });
		expect(outputSize(picture, { width: 1920, height: 1080 }, 360)).toEqual({ width: 640, height: 360 });
		expect(outputSize(createImageDoc(), { width: 1920, height: 1080 }, 2160)).toEqual({
			width: 1920,
			height: 1080,
		});
	});
});

describe('subtitles of a cut video', () => {
	const doc: SubtitleDoc = {
		format: 'srt',
		ass: null,
		vttHeader: null,
		cues: [
			{ id: 1, start: 1000, end: 2000, text: 'before' },
			{ id: 2, start: 11_000, end: 12_000, text: 'removed' },
			{ id: 3, start: 9500, end: 11_300, text: 'across' },
			{ id: 4, start: 21_000, end: 22_000, text: 'after' },
		],
	};

	it('drop lines in removed passages and move the others up', () => {
		const cues = cutSubtitles(doc, [
			{ start: 0, end: 10 },
			{ start: 20, end: 60 },
		]).cues.map((cue) => [cue.text, cue.start, cue.end]);
		expect(cues).toEqual([
			['before', 1000, 2000],
			['across', 9500, 10_000],
			['after', 11_000, 12_000],
		]);
	});
});

describe('mergeParts', () => {
	it('merges parts widened onto each other', () => {
		expect(
			mergeParts([
				{ start: 20, end: 32.9, stop: 33 },
				{ start: 0, end: 12, stop: 12 },
				{ start: 30, end: 60, stop: 60 },
			]),
		).toEqual([
			{ start: 0, end: 12, stop: 12 },
			{ start: 20, end: 60, stop: 60 },
		]);
	});
});
