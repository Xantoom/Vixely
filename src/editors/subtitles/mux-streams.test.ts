import { describe, expect, it, vi } from 'vitest';
import { applyTiming, outputFormat, useSubtitleBatch } from './batch';
import type { SubtitleDoc } from './document';
import { parseAss } from './formats/ass';
import { matroskaStream, timedTextStream, trackCodec } from './mux-streams';

vi.mock('@/wasm/subs', () => ({ loadSubs: vi.fn() }));

const decoder = new TextDecoder();

function lines(stream: { offsets: Uint32Array; data: Uint8Array }): string[] {
	return Array.from({ length: stream.offsets.length - 1 }, (_, k) =>
		decoder.decode(stream.data.subarray(stream.offsets[k], stream.offsets[k + 1])),
	);
}

const srt: SubtitleDoc = {
	format: 'srt',
	cues: [
		{ id: 1, start: 1000, end: 2500, text: '<i>Hello</i>\nthere' },
		{ id: 2, start: 3000, end: 3500, text: '  ' },
	],
	ass: null,
	vttHeader: null,
};

describe('subtitle tracks for video files', () => {
	it('writes SRT text as it is, empty lines left out', async () => {
		const stream = await matroskaStream(srt);
		expect(stream.codec).toBe('S_TEXT/UTF8');
		expect(lines(stream)).toEqual(['<i>Hello</i>\nthere']);
		expect([...stream.starts, ...stream.durations]).toEqual([1000, 1500]);
	});

	it('writes ASS events in read order with the header as codec setup', async () => {
		const doc = parseAss(
			'[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nStyle: Top,Arial,40\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 1,0:00:02.00,0:00:03.00,Top,Bob,0,0,0,,Second\\Nline\nComment: 0,0:00:04.00,0:00:05.00,Top,,0,0,0,,note\nDialogue: 0,0:00:01.00,0:00:02.00,Top,,0,0,0,,First\n',
		);
		if (!doc) throw new Error('unreadable');
		expect(trackCodec(doc)).toBe('S_TEXT/ASS');
		const stream = await matroskaStream(doc);
		expect(lines(stream)).toEqual(['0,1,Top,Bob,0,0,0,,Second\\Nline', '1,0,Top,,0,0,0,,First']);
		const setup = decoder.decode(stream.private);
		expect(setup).toContain('[V4+ Styles]');
		expect(
			setup.endsWith(
				'[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n',
			),
		).toBe(true);
	});

	it('writes MP4 timed text as plain lines', () => {
		expect(lines(timedTextStream(srt))).toEqual(['Hello\nthere']);
	});
});

describe('subtitle batches', () => {
	it('converts the frame rate, then shifts', () => {
		const settings = {
			...useSubtitleBatch.getState(),
			shift: 1000,
			fromRate: '25' as const,
			toRate: '23.976' as const,
		};
		const moved = applyTiming(srt, settings);
		expect(moved.cues[0]?.start).toBe(Math.round(1000 * (25 / (24000 / 1001))) + 1000);
	});

	it('keeps pictures as pictures whatever the format asked', () => {
		const settings = { ...useSubtitleBatch.getState(), format: 'srt' as const };
		expect(outputFormat({ ...srt, format: 'pgs' }, settings)).toBe('pgs');
		expect(outputFormat({ ...srt, format: 'vtt' }, settings)).toBe('srt');
	});
});
