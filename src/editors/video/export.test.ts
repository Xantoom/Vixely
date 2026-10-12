import { describe, expect, it } from 'vitest';
import { createImageDoc } from '../image/document';
import type { SubtitleDoc } from '../subtitles/document';
import { mergeParts } from './copy-tracks';
import {
	bitrateForSize,
	CONTAINERS,
	chooseEncoding,
	outputSize,
	planVideo,
	presetSettings,
	quantizerFor,
	resolveAudio,
	readMeta,
	settingsFromSource,
	type VideoCodecId,
	type VideoEncoders,
	type VideoExportSettings,
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

/** Encoders of a machine without a graphics card. */
const soft = (codecs: VideoCodecId[]): VideoEncoders => ({ gpu: [], software: codecs });

describe('video export settings', () => {
	it('start from the source, with a codec this browser encodes', () => {
		const settings = settingsFromSource(source, soft(['avc', 'vp9']));
		expect(settings).toMatchObject({
			mode: 'copy',
			container: 'mkv',
			codec: 'avc',
			rateControl: 'auto',
			audio: 'copy',
		});
		expect(settingsFromSource(source, soft(['avc', 'hevc'])).codec).toBe('hevc');
	});

	it('encode on the graphics card when it can, else on the processor', () => {
		const encoders: VideoEncoders = { gpu: ['avc', 'hevc'], software: ['avc', 'vp9', 'av1'] };
		const mp4 = CONTAINERS.mp4.codecs;
		expect(chooseEncoding(encoders, mp4, 'avc', null)).toEqual({ codec: 'avc', encoder: 'gpu' });
		expect(chooseEncoding(encoders, mp4, 'avc', 'software')).toEqual({ codec: 'avc', encoder: 'software' });
		// No AV1 on this card: the processor encodes it.
		expect(chooseEncoding(encoders, mp4, 'av1', 'gpu')).toEqual({ codec: 'av1', encoder: 'software' });
		// No HEVC on the processor: the card does.
		expect(chooseEncoding(encoders, mp4, 'hevc', 'software')).toEqual({ codec: 'hevc', encoder: 'gpu' });
		expect(chooseEncoding(encoders, CONTAINERS.webm.codecs, null, 'gpu')).toEqual({
			codec: 'vp9',
			encoder: 'software',
		});
		expect(settingsFromSource(source, encoders, 'software')).toMatchObject({ codec: 'hevc', encoder: 'gpu' });
	});

	it('copy the sound only where it fits and nothing was cut', () => {
		const settings = settingsFromSource(source, soft(['avc']));
		expect(resolveAudio(settings, source)).toBe('copy');
		expect(resolveAudio({ ...settings, container: 'webm' }, source)).toBe('opus');
		expect(resolveAudio({ ...settings, audio: 'aac', container: 'webm' }, source)).toBe('opus');
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
		const whatsapp = presetSettings('whatsapp', { ...source, frameRate: 59.94 }, soft(['avc']), 1080);
		expect(whatsapp).toMatchObject({ container: 'mp4', codec: 'avc', height: 720, frameRate: 30, sizeLimit: 16 });
		const small = presetSettings('discord', source, soft(['avc']), 480);
		expect(small).toMatchObject({ height: null, frameRate: null, adaptive: true });
		expect(presetSettings('youtube', source, soft(['avc']), 1080)).toMatchObject({
			rateControl: 'auto',
			bitrateCeiling: 8000,
			keyframes: 0.5,
		});
		expect(presetSettings('web', source, soft(['avc', 'av1']), 1080).codec).toBe('av1');
		expect(presetSettings('web', source, soft(['vp9']), 1080).codec).toBe('vp9');
	});
});

describe('video plan', () => {
	const upright = { width: 1920, height: 1080 };
	const picture = createImageDoc();
	const base = { ...settingsFromSource(source, soft(['avc', 'hevc'])), mode: 'encode' as const };
	const plan = (changes: Partial<VideoExportSettings>, seconds = 60, from = source) =>
		planVideo({ settings: { ...base, ...changes }, picture, upright, seconds, audio: 128, source: from });

	it('carry the source over to another codec and size', () => {
		// HEVC to H.264 takes half as many bits again; the same codec keeps the source's.
		expect(plan({ codec: 'hevc' }).bitrate).toBe(4200);
		expect(plan({ codec: 'avc' }).bitrate).toBe(Math.round(4200 / 0.65));
		// Half the pixels: about 60 % of the bits.
		expect(plan({ codec: 'hevc', height: 720 }).bitrate).toBe(
			Math.round(4200 * ((1280 * 720) / (1920 * 1080)) ** 0.75),
		);
		// A heavy source is not copied beyond what the codec can use.
		const heavy = plan({ codec: 'avc' }, 60, { ...source, codec: 'prores', bitrate: 150_000 });
		expect(heavy.bitrate).toBeLessThan(12_000);
	});

	it('keep a size limit as a ceiling, never a target', () => {
		const light = plan({ codec: 'hevc', sizeLimit: 500 });
		expect(light).toMatchObject({ bitrate: 4200, limited: false });
		const tight = plan({ codec: 'hevc', sizeLimit: 20 });
		expect(tight.limited).toBe(true);
		expect(tight.estimate).toBeLessThanOrEqual(20);
	});

	it('bring the picture down when a limit leaves it too few bits', () => {
		// A minute in 20 MB: about 2.5 Mb/s, too few for 1080p in H.264.
		const minute = plan({ codec: 'avc', sizeLimit: 20, adaptive: true });
		expect(minute.height).toBe(720);
		expect(minute.size).toEqual({ width: 1280, height: 720 });
		// Ten seconds keep the whole picture.
		expect(plan({ codec: 'avc', sizeLimit: 20, adaptive: true }, 10).height).toBeNull();
		// Not adaptive: the height stays, and the bits are told short.
		expect(plan({ codec: 'avc', sizeLimit: 8 }, 300).squeezed).toBe(true);
	});

	it('keep a quality level to a quantizer, of no known size', () => {
		const quality = plan({ codec: 'avc', rateControl: 'quality', quality: 0.75 });
		expect(quality).toMatchObject({ constantQuality: true, estimate: null });
		expect(quantizerFor('avc', 0.75)).toBe(22);
		expect(quantizerFor('av1', 1)).toBe(88);
		// Under a limit, the bitrate decides.
		expect(plan({ codec: 'avc', rateControl: 'quality', sizeLimit: 20 }).constantQuality).toBe(false);
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
