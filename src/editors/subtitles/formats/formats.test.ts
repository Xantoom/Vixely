import { describe, expect, it } from 'vitest';
import { addCue, retime, syncPoints } from '../document';
import { assTime } from './ass';
import { decodeText, detectEncoding } from './encoding';
import { droppedCues, parseSubtitles, toAssScript, writeSubtitles } from './index';
import { convertText, plainText } from './markup';
import { srtTime } from './srt';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello, <i>world</i>.

2
00:00:04,000 --> 00:00:06,000
Two lines
of text

3
00:01:02.5 --> 00:01:04,25
Dots and short fractions
`;

const VTT = `WEBVTT - some title
Kind: captions

STYLE
::cue { color: yellow }

NOTE a comment

intro
00:01.000 --> 00:02.500 line:0 align:start
Tom &amp; Jerry &lt;3

00:00:03.000 --> 00:00:04.000
<v Bob>Hi</v> <c.loud>there</c>
`;

const ASS = `[Script Info]
Title: Test
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1
Style: Sign,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}Hello{\\i0}, world\\Nsecond line
Comment: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,a note
Dialogue: 1,0:00:05.00,0:00:06.00,Sign,,0,0,0,,{\\pos(640,100)\\p1}m 0 0 l 100 0 100 100{\\p0}
Dialogue: 0,0:00:07.00,0:00:08.00,Default,Bob,0,0,0,,{\\b700\\c&H0000FF&}Red bold{\\r} plain

[Fonts]
fontname: x.ttf
ABCDEF
`;

describe('SRT', () => {
	it('reads cues, forgiving dots and short fractions', () => {
		const doc = parseSubtitles(SRT);
		expect(doc?.format).toBe('srt');
		expect(doc?.cues.map((cue) => [cue.start, cue.end, cue.text])).toEqual([
			[1000, 3500, 'Hello, <i>world</i>.'],
			[4000, 6000, 'Two lines\nof text'],
			[62_500, 64_250, 'Dots and short fractions'],
		]);
	});

	it('reads cues without numbers and with CRLF', () => {
		const doc = parseSubtitles('00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n00:00:03,000 --> 00:00:04,000\r\nB\r\n');
		expect(doc?.cues.map((cue) => cue.text)).toEqual(['A', 'B']);
	});

	it('writes numbered cues with CRLF', () => {
		const doc = parseSubtitles(SRT);
		if (!doc) throw new Error('no doc');
		const out = writeSubtitles(doc, 'srt', 'x');
		expect(out.startsWith('1\r\n00:00:01,000 --> 00:00:03,500\r\nHello, <i>world</i>.\r\n\r\n2\r\n')).toBe(true);
		expect(parseSubtitles(out)?.cues.map((cue) => cue.text)).toEqual(doc.cues.map((cue) => cue.text));
	});

	it('formats times', () => {
		expect(srtTime(3_723_456)).toBe('01:02:03,456');
		expect(assTime(3_723_456)).toBe('1:02:03.46');
	});
});

describe('WebVTT', () => {
	it('reads cues, identifiers, settings and header blocks', () => {
		const doc = parseSubtitles(VTT);
		expect(doc?.format).toBe('vtt');
		expect(doc?.cues).toHaveLength(2);
		expect(doc?.cues[0]).toMatchObject({
			start: 1000,
			end: 2500,
			vtt: { id: 'intro', settings: 'line:0 align:start' },
		});
		expect(doc?.vttHeader).toBe('WEBVTT - some title\nKind: captions\n\nSTYLE\n::cue { color: yellow }');
	});

	it('writes WebVTT back with its header and settings', () => {
		const doc = parseSubtitles(VTT);
		if (!doc) throw new Error('no doc');
		const out = writeSubtitles(doc, 'vtt', 'x');
		expect(out).toContain('STYLE\n::cue { color: yellow }');
		expect(out).toContain('intro\n00:00:01.000 --> 00:00:02.500 line:0 align:start\nTom &amp; Jerry &lt;3\n');
	});

	it('decodes entities and drops voices when converting to SRT', () => {
		const doc = parseSubtitles(VTT);
		if (!doc) throw new Error('no doc');
		const srt = parseSubtitles(writeSubtitles(doc, 'srt', 'x'));
		expect(srt?.cues.map((cue) => cue.text)).toEqual(['Tom & Jerry <3', 'Hi there']);
	});
});

describe('ASS', () => {
	it('reads events, text with commas, comments and header details', () => {
		const doc = parseSubtitles(ASS);
		expect(doc?.format).toBe('ass');
		expect(doc?.cues).toHaveLength(4);
		expect(doc?.cues[0]).toMatchObject({ start: 1000, end: 2500, text: '{\\i1}Hello{\\i0}, world\\Nsecond line' });
		expect(doc?.cues[1]?.comment).toBe(true);
		expect(doc?.cues[3]?.fields).toMatchObject({ style: 'Default', name: 'Bob', layer: '0' });
		expect(doc?.ass).toMatchObject({
			title: 'Test',
			playRes: { width: 1280, height: 720 },
			styles: ['Default', 'Sign'],
		});
	});

	it('writes the file back unchanged apart from line endings', () => {
		const doc = parseSubtitles(ASS);
		if (!doc) throw new Error('no doc');
		expect(writeSubtitles(doc, 'ass', 'x')).toBe(ASS.replace(/\n/g, '\r\n'));
	});

	it('reads SSA events, whose first field is Marked', () => {
		const ssa = ASS.replace('ScriptType: v4.00+', 'ScriptType: v4.00')
			.replace('Format: Layer,', 'Format: Marked,')
			.replace('Dialogue: 0,0:00:01.00', 'Dialogue: Marked=0,0:00:01.00');
		const doc = parseSubtitles(ssa);
		expect(doc?.cues[0]?.fields?.marked).toBe('Marked=0');
		expect(doc?.ass?.scriptType).toBe('v4.00');
	});

	it('converts to SRT: styles kept, drawings and comments dropped', () => {
		const doc = parseSubtitles(ASS);
		if (!doc) throw new Error('no doc');
		expect(droppedCues(doc, 'srt')).toBe(2);
		const srt = parseSubtitles(writeSubtitles(doc, 'srt', 'x'));
		expect(srt?.cues.map((cue) => cue.text)).toEqual([
			'<i>Hello</i>, world\nsecond line',
			'<b><font color="#ff0000">Red bold</font></b> plain',
		]);
	});
});

describe('markup', () => {
	it('converts SRT to ASS, keeping ASS blocks written in SRT', () => {
		expect(convertText('{\\an8}<i>Top</i>\nline', 'srt', 'ass')).toBe('{\\an8\\i1}Top{\\i0}\\Nline');
		expect(convertText('<font color="red">x</font>', 'srt', 'ass')).toBe('{\\c&H0000FF&}x{\\c}');
	});

	it('escapes WebVTT and keeps tags nested', () => {
		expect(convertText('a < b & c', 'srt', 'vtt')).toBe('a &lt; b &amp; c');
		expect(convertText('{\\i1}a{\\b1}b{\\i0}c{\\b0}', 'ass', 'srt')).toBe('<i>a<b>b</b></i><b>c</b>');
	});

	it('treats unknown SRT tags as text', () => {
		expect(plainText('1 <3 you, <i>x</i>', 'srt')).toBe('1 <3 you, x');
	});

	it('gives SRT files a default ASS style for preview', () => {
		const doc = parseSubtitles(SRT);
		if (!doc) throw new Error('no doc');
		const script = toAssScript(doc, 'Film', { width: 1280, height: 720 });
		expect(script).toContain('PlayResY: 720');
		expect(script).toContain('Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello, {\\i1}world{\\i0}.');
	});
});

describe('timing', () => {
	it('shifts and rescales, never before zero', () => {
		const doc = parseSubtitles(SRT);
		if (!doc) throw new Error('no doc');
		expect(retime(doc, 1, -1500).cues.map((cue) => [cue.start, cue.end])).toEqual([
			[0, 2000],
			[2500, 4500],
			[61_000, 62_750],
		]);
		const fps = retime(doc, 25 / (24000 / 1001), 0);
		expect(fps.cues[1]?.start).toBe(4171);
	});

	it('finds the retiming from two cues', () => {
		const sync = syncPoints([1000, 61_000], [2000, 62_000 + 600]);
		expect(sync?.scale).toBeCloseTo(1.01);
		expect(sync?.offset).toBeCloseTo(990);
		expect(syncPoints([5000, 5000], [1, 2])).toBeNull();
	});

	it('adds a cue that stops before the next one', () => {
		const doc = parseSubtitles(SRT);
		if (!doc) throw new Error('no doc');
		const { doc: next, id } = addCue(doc, 3000);
		const cue = next.cues.find((c) => c.id === id);
		expect([cue?.start, cue?.end]).toEqual([3000, 4000]);
		expect(next.cues.indexOf(cue ?? next.cues[0]!)).toBe(1);
	});
});

describe('encoding', () => {
	it('recognises UTF-8, Windows-1252 and UTF-16', () => {
		const utf8 = new TextEncoder().encode('Café');
		expect(detectEncoding(utf8)).toBe('utf-8');
		const latin = Uint8Array.from([0x43, 0x61, 0x66, 0xe9]);
		expect(detectEncoding(latin)).toBe('windows-1252');
		expect(decodeText(latin, 'windows-1252')).toBe('Café');
		const utf16 = Uint8Array.from([0xff, 0xfe, 0x43, 0, 0xe9, 0]);
		expect(detectEncoding(utf16)).toBe('utf-16le');
		expect(decodeText(utf16, 'utf-16le')).toBe('Cé');
	});
});
