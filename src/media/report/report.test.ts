import { describe, expect, it } from 'vitest';
import { NO_STREAM_HDR, readPacketHdr, type StreamHdr, unescapeRbsp } from './bitstream';
import { dtsExtension, eac3Atmos, flacDepth, trueHdAtmos, videoProfile } from './codec-details';
import { readContainerFacts } from './container';

const be16 = (value: number) => [value >> 8, value & 0xff];
const be32 = (value: number) => [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** Mastering display as SEI and `mdcv` write it: P3 D65, 1000 and 0.005 cd/m². */
const MASTERING = [
	...[13250, 34500, 7500, 3000, 34000, 16000, 15635, 16450].flatMap(be16),
	...be32(10_000_000),
	...be32(50),
];
/** Dolby Vision 8.1, level 6, base layer and RPU. */
const DVCC = [1, 0, (8 << 1) | 0, (6 << 3) | 0b101, 1 << 4, ...Array<number>(19).fill(0)];

function box(type: string, content: number[]): number[] {
	return [...be32(8 + content.length), ...ascii(type), ...content];
}

/** An MP4 whose HEVC sample entry carries Dolby Vision, mastering and light level boxes. */
function mp4(): Blob {
	const entry = box('hvc1', [
		...Array<number>(78).fill(0),
		...box('dvcC', DVCC),
		...box('mdcv', MASTERING),
		...box('clli', [...be16(1000), ...be16(400)]),
	]);
	const stsd = box('stsd', [0, 0, 0, 0, ...be32(1), ...entry]);
	const trak = box('trak', box('mdia', box('minf', box('stbl', stsd))));
	return new Blob([new Uint8Array([...box('ftyp', ascii('isom')), ...box('moov', trak)])]);
}

/** An EBML element with a one-byte size. */
function el(id: number[], content: number[]): number[] {
	return [...id, 0x80 | content.length, ...content];
}
/** An EBML element with an eight-byte size, as muxers write large masters. */
function big(id: number[], content: number[]): number[] {
	return [...id, 0x01, 0, 0, 0, ...be32(content.length), ...content];
}
const f32 = (value: number) => [...new Uint8Array(new Float32Array([value]).buffer)].reverse();

/** A Matroska file whose video track says Dolby Vision, mastering, light levels, with chapters. */
function mkv(): Blob {
	const colour = el(
		[0x55, 0xb0],
		[
			...el([0x55, 0xbc], be16(1000)),
			...el([0x55, 0xbd], be16(400)),
			...el([0x55, 0xd0], [...el([0x55, 0xd9], f32(1000)), ...el([0x55, 0xda], f32(0.005))]),
		],
	);
	const entry = el(
		[0xae],
		[
			...el([0xd7], [1]),
			...el([0x73, 0xc5], [0x42]),
			...el([0x55, 0xab], [1]),
			...el([0x83], [1]),
			...el([0xe0], colour),
			...el([0x41, 0xe4], [...el([0x41, 0xe7], ascii('dvcC')), ...el([0x41, 0xed], DVCC)]),
		],
	);
	const info = el(
		[0x15, 0x49, 0xa9, 0x66],
		[...el([0x4d, 0x80], ascii('libebml')), ...el([0x57, 0x41], ascii('mkvmerge'))],
	);
	const atom = (start: number, name: string) =>
		el([0xb6], [...el([0x91], be32(start)), ...el([0x80], el([0x85], ascii(name)))]);
	const chapters = el(
		[0x10, 0x43, 0xa7, 0x70],
		el([0x45, 0xb9], [...atom(0, 'Intro'), ...atom(1_000_000_000, 'Two')]),
	);
	const simple = (name: string, value: string) =>
		el([0x67, 0xc8], [...el([0x45, 0xa3], ascii(name)), ...el([0x44, 0x87], ascii(value))]);
	const tags = el(
		[0x12, 0x54, 0xc3, 0x67],
		el(
			[0x73, 0x73],
			[
				...el([0x63, 0xc0], el([0x63, 0xc5], [0x42])),
				...simple('BPS', '2500000'),
				...simple('DURATION', '01:02:03.500000000'),
			],
		),
	);
	const segment = big(
		[0x18, 0x53, 0x80, 0x67],
		[...info, ...big([0x16, 0x54, 0xae, 0x6b], entry), ...chapters, ...tags],
	);
	return new Blob([new Uint8Array([...el([0x1a, 0x45, 0xdf, 0xa3], []), ...segment])]);
}

describe('container facts', () => {
	it('reads Dolby Vision and HDR boxes of an MP4 sample entry', async () => {
		const facts = await readContainerFacts(mp4());
		expect(facts.dolbyVision).toEqual({
			profile: 8,
			level: 6,
			rpu: true,
			enhancementLayer: false,
			baseLayer: true,
			compatibility: 1,
		});
		expect(facts.mastering?.maxLuminance).toBe(1000);
		expect(facts.mastering?.minLuminance).toBeCloseTo(0.005);
		expect(facts.mastering?.primaries?.red[0]).toBeCloseTo(0.68);
		expect(facts.light).toEqual({ maxCll: 1000, maxFall: 400 });
	});

	it('reads Dolby Vision, colour and chapters of a Matroska file', async () => {
		const facts = await readContainerFacts(mkv());
		expect(facts.dolbyVision?.profile).toBe(8);
		expect(facts.dolbyVision?.compatibility).toBe(1);
		expect(facts.mastering?.maxLuminance).toBe(1000);
		expect(facts.mastering?.minLuminance).toBeCloseTo(0.005);
		expect(facts.light).toEqual({ maxCll: 1000, maxFall: 400 });
		expect(facts.muxingApp).toBe('libebml');
		expect(facts.writingApp).toBe('mkvmerge');
		expect(facts.chapters).toEqual([
			{ start: 0, name: 'Intro' },
			{ start: 1, name: 'Two' },
		]);
		expect(facts.tracks.get(1)).toEqual({
			duration: 3723.5,
			bitrate: 2_500_000,
			hearingImpaired: true,
			described: false,
		});
	});
});

describe('coded pictures', () => {
	/** An HEVC packet: prefix SEI with mastering, light level and HDR10+, then a Dolby Vision RPU. */
	function packet(): Uint8Array {
		const t35 = [0xb5, 0x00, 0x3c, 0x00, 0x01, 0x04, 0x01, 0x40];
		const sei = [
			39 << 1,
			1,
			137,
			24,
			...MASTERING,
			144,
			4,
			...be16(1000),
			...be16(400),
			4,
			t35.length,
			...t35,
			0x80,
		];
		const rpu = [62 << 1, 1, 0x19, 0x08];
		return new Uint8Array([...be32(sei.length), ...sei, ...be32(rpu.length), ...rpu]);
	}

	it('finds HDR SEI messages and Dolby Vision RPUs in HEVC', () => {
		const found: StreamHdr = { ...NO_STREAM_HDR };
		readPacketHdr(packet(), 'hevc', found);
		expect(found.hdr10Plus).toBe(true);
		expect(found.dolbyVisionRpu).toBe(true);
		expect(found.mastering?.maxLuminance).toBe(1000);
		expect(found.light).toEqual({ maxCll: 1000, maxFall: 400 });
	});

	it('takes emulation prevention bytes out', () => {
		expect([...unescapeRbsp(new Uint8Array([0, 0, 3, 1, 0, 0, 3, 0]))]).toEqual([0, 0, 1, 0, 0, 0]);
	});
});

describe('codec details', () => {
	it('names profiles and levels', () => {
		expect(videoProfile('hvc1.2.4.L153.B0')).toMatchObject({ profile: 'Main 10', tier: 'Main', level: '5.1' });
		expect(videoProfile('avc1.640028')).toMatchObject({ profile: 'High', level: '4' });
		expect(videoProfile('av01.0.08M.10')).toMatchObject({ profile: 'Main', level: '4.0', bitDepth: 10 });
		expect(videoProfile('vp09.02.10.10.01')).toMatchObject({ bitDepth: 10, chroma: '4:2:0' });
	});

	it('reads audio extensions', () => {
		const flac = new Uint8Array(38);
		// 24 bits per sample: (bps - 1) = 23 spread over bytes 12 and 13 of STREAMINFO.
		flac[4 + 12] = 0b0000_0001;
		flac[4 + 13] = 0b0111_0000;
		expect(flacDepth(flac)).toBe(24);
		expect(
			dtsExtension(new Uint8Array([0x7f, 0xfe, 0x80, 0x01, 0x64, 0x58, 0x20, 0x25, 0x41, 0xa2, 0x95, 0x47])),
		).toBe('MA');
		expect(dtsExtension(new Uint8Array([0x7f, 0xfe, 0x80, 0x01]))).toBeNull();
		// One independent substream with no dependents, then the JOC flag.
		expect(eac3Atmos(new Uint8Array([0x10, 0x00, 0x20, 0x0f, 0x00, 0x01, 0x10]))).toBe(true);
		const sync = [0xf8, 0x72, 0x6f, 0xba, 0x80, 0x07, 0x80, 0x0f, 0xb7, 0x52, 0, 0, 0, 0, 0x8d, 0x9a, 0x20];
		expect(trueHdAtmos(new Uint8Array([0, 0, 0, 0, ...sync, 0x3c, ...Array<number>(8).fill(0)]))).toBe(false);
		expect(trueHdAtmos(new Uint8Array([0, 0, 0, 0, ...sync, 0x84, ...Array<number>(8).fill(0)]))).toBe(true);
	});
});
