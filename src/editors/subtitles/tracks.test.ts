import { describe, expect, it, vi } from 'vitest';
import type { ExtractedTrack, SubtitleTrackInfo } from '@/media/subtitle-source';
import { preferredTrack, timedText, trackDoc, webvttCues } from './tracks';

vi.mock('@/wasm/subs', () => ({ loadSubs: vi.fn() }));

const encoder = new TextEncoder();

function track(
	packets: { start: number; duration?: number; data: Uint8Array | string }[],
	codecPrivate = '',
): ExtractedTrack {
	const chunks = packets.map((p) => (typeof p.data === 'string' ? encoder.encode(p.data) : p.data));
	const offsets = [0];
	for (const chunk of chunks) offsets.push((offsets.at(-1) ?? 0) + chunk.length);
	const data = new Uint8Array(offsets.at(-1) ?? 0);
	chunks.forEach((chunk, k) => {
		data.set(chunk, offsets[k]);
	});
	return {
		starts: Float64Array.from(packets.map((p) => p.start)),
		durations: Float64Array.from(packets.map((p) => p.duration ?? Number.NaN)),
		offsets: Uint32Array.from(offsets),
		data,
		codecPrivate: encoder.encode(codecPrivate),
	};
}

function info(codec: string, extra: Partial<SubtitleTrackInfo> = {}): SubtitleTrackInfo {
	return { id: 3, codec, language: 'eng', name: '', default: false, forced: false, readable: true, ...extra };
}

function box(type: string, content: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + content.length);
	new DataView(out.buffer).setUint32(0, out.length);
	out.set(encoder.encode(type), 4);
	out.set(content, 8);
	return out;
}

describe('tracks', () => {
	it('reads Matroska SRT, ending a line without duration at the next one', async () => {
		const doc = await trackDoc(
			info('S_TEXT/UTF8'),
			track([
				{ start: 1000, data: 'Hello\r\n' },
				{ start: 4000, duration: 1500, data: '<i>Bye</i>' },
			]),
		);
		expect(doc?.cues.map((c) => [c.start, c.end, c.text])).toEqual([
			[1000, 4000, 'Hello'],
			[4000, 5500, '<i>Bye</i>'],
		]);
	});

	it('reads Matroska ASS events in read order, commas kept in the text', async () => {
		const header =
			'[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nStyle: Default,Arial,40\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
		const doc = await trackDoc(
			info('S_TEXT/ASS'),
			track(
				[
					{ start: 1000, duration: 500, data: '1,0,Default,,0,0,0,,Second, with comma' },
					{ start: 1000, duration: 500, data: '0,1,Default,Bob,0,0,0,,{\\i1}First' },
				],
				header,
			),
		);
		expect(doc?.format).toBe('ass');
		expect(doc?.cues.map((c) => c.text)).toEqual(['{\\i1}First', 'Second, with comma']);
		expect(doc?.cues[0]?.fields).toMatchObject({ layer: '1', style: 'Default', name: 'Bob' });
	});

	it('reads MP4 timed text and WebVTT boxes', async () => {
		const tx3g = Uint8Array.from([0, 5, ...encoder.encode('Hello'), 0, 0, 0, 8]);
		expect(timedText(tx3g)).toBe('Hello');
		const cue = box(
			'vttc',
			new Uint8Array([
				...box('iden', encoder.encode('a')),
				...box('sttg', encoder.encode('line:0')),
				...box('payl', encoder.encode('Hi')),
			]),
		);
		expect(webvttCues(new Uint8Array([...cue, ...box('vtte', new Uint8Array())]))).toEqual([
			{ text: 'Hi', settings: 'line:0', id: 'a' },
		]);
		const doc = await trackDoc(info('wvtt'), track([{ start: 0, duration: 1000, data: cue }]));
		expect(doc?.cues[0]).toMatchObject({ text: 'Hi', vtt: { id: 'a', settings: 'line:0' } });
	});

	it('picks the default complete track first', () => {
		const tracks = [
			info('S_VOBSUB', { id: 1, default: true }),
			info('S_TEXT/ASS', { id: 2, forced: true }),
			info('S_TEXT/UTF8', { id: 3 }),
		];
		expect(preferredTrack(tracks)?.id).toBe(3);
		expect(preferredTrack([info('S_VOBSUB')])).toBeNull();
	});
});
