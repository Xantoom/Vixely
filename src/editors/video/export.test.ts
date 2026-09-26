import { describe, expect, it } from 'vitest';
import { createImageDoc } from '../image/document';
import type { SubtitleDoc } from '../subtitles/document';
import { mergeParts } from './copy-tracks';
import {
	bitrateForSize,
	outputSize,
	presetSettings,
	resolveAudio,
	readMeta,
	settingsFromSource,
	type VideoSource,
	writeMeta,
} from './export';
import { cutSubtitles } from './mux';

const source: VideoSource = {
	container: 'mkv',
	codec: 'hevc',
	frameRate: 23.976,
	bitrate: 4200,
	audioCodec: 'aac',
	audioBitrate: 192,
	turn: { rotation: 0, flip: false },
	meta: { title: '', artist: '', comment: '', date: '', cover: null },
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

describe('size limit', () => {
	it('leaves the pictures what the sound does not take, with a margin', () => {
		// 10 MB over 60 s with 96 kb/s of sound: 10e6 × 8 × 0.94 / 1000 / 60 − 96.
		expect(bitrateForSize(10, 60, 96)).toBe(1157);
		expect(bitrateForSize(1, 600, 128)).toBe(50);
	});
});

describe('presets', () => {
	it('never enlarge the pictures nor speed them up', () => {
		const discord = presetSettings('discord', { ...source, frameRate: 59.94 }, ['avc'], 1080);
		expect(discord).toMatchObject({ container: 'mp4', codec: 'avc', height: 720, frameRate: 30, sizeLimit: 10 });
		const small = presetSettings('discord', source, ['avc'], 480);
		expect(small).toMatchObject({ height: null, frameRate: null });
		expect(presetSettings('youtube', source, ['avc'], 1080).bitrate).toBe(8000);
		expect(presetSettings('web', source, ['avc', 'av1'], 1080).codec).toBe('av1');
	});
});

describe('video metadata', () => {
	it("reads the fields shown and writes the edited ones over the file's", () => {
		const cover = { data: new Uint8Array([1, 2]), mimeType: 'image/jpeg' };
		const tags = {
			title: ' Holiday ',
			albumArtist: 'Ana',
			date: new Date('2024-07-14T10:00:00Z'),
			images: [{ ...cover, kind: 'coverFront' as const }],
			raw: { '©nam': 'Holiday' },
		};
		const meta = readMeta(tags);
		expect(meta).toEqual({ title: 'Holiday', artist: 'Ana', comment: '', date: '2024-07-14', cover });
		const written = writeMeta(tags, { ...meta, title: 'Summer', cover: null });
		expect(written.title).toBe('Summer');
		expect(written.images).toEqual([]);
		expect(written.raw).toEqual({});
		expect(written.date?.toISOString()).toBe('2024-07-14T00:00:00.000Z');
		expect(writeMeta(tags, null)).toBe(tags);
	});
});
