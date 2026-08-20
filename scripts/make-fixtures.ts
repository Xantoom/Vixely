/**
 * Regenerates the deterministic fixtures.
 *
 * Text and raw-pixel fixtures are authored here so an addition stays
 * reproducible. Encoded media fixtures (H.264, AAC, DTS…) are NOT generated:
 * producing them needs an encoder this toolchain deliberately does not carry,
 * so they are committed as real short files instead. See docs/plan/04-testing.md §5.
 */
import { mkdir } from "node:fs/promises";

const ROOT = new URL("../tests/fixtures/", import.meta.url);

const SUBTITLES: Record<string, string> = {
	"basic.srt": [
		"1",
		"00:00:01,000 --> 00:00:03,500",
		"The first line.",
		"",
		"2",
		"00:00:04,000 --> 00:00:06,000",
		"A second line,",
		"split across two rows.",
		"",
	].join("\n"),

	"overlapping.srt": [
		"1",
		"00:00:01,000 --> 00:00:05,000",
		"Speaker A talks for a while.",
		"",
		"2",
		"00:00:03,000 --> 00:00:07,000",
		"Speaker B interrupts.",
		"",
	].join("\n"),

	"positioned.vtt": [
		"WEBVTT",
		"",
		"NOTE A cue with positioning, which SRT cannot carry.",
		"",
		"1",
		"00:00:01.000 --> 00:00:03.000 line:90% align:center",
		"Centred near the bottom.",
		"",
		"2",
		"00:00:04.000 --> 00:00:06.000 position:10% align:start",
		"Pinned to the left.",
		"",
	].join("\n"),

	"styled.ass": [
		"[Script Info]",
		"Title: Styled fixture",
		"ScriptType: v4.00+",
		"WrapStyle: 0",
		"PlayResX: 1920",
		"PlayResY: 1080",
		"ScaledBorderAndShadow: yes",
		"",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		"Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1",
		"Style: Sign,Arial,36,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,0,8,20,20,20,1",
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
		"Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Plain dialogue.",
		"Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,{\\i1}Italic override{\\i0} then normal.",
		"Dialogue: 1,0:00:04.00,0:00:06.00,Sign,,0,0,0,,{\\pos(960,120)}A positioned sign.",
		"",
	].join("\n"),

	"karaoke.ass": [
		"[Script Info]",
		"ScriptType: v4.00+",
		"PlayResX: 1280",
		"PlayResY: 720",
		"",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		"Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1",
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
		"Dialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,{\\k30}Ka{\\k25}ra{\\k30}o{\\k35}ke",
		"",
	].join("\n"),
};

/** A UTF-8 BOM in front of an SRT: common, and a classic parser trap. */
const BOM_SRT = `﻿${SUBTITLES["basic.srt"]}`;

/** Windows-1252 bytes, which is what a lot of older SRT files actually are. */
function cp1252Srt(): Uint8Array {
	const text = ["1", "00:00:01,000 --> 00:00:03,000", "Déjà vu, en français.", ""].join("\n");
	const map: Record<string, number> = { é: 0xe9, è: 0xe8, à: 0xe0, ç: 0xe7, ù: 0xf9 };
	const bytes: number[] = [];
	for (const char of text) {
		bytes.push(map[char] ?? char.codePointAt(0) ?? 0x3f);
	}
	return new Uint8Array(bytes);
}

/**
 * WAV fixtures, authored byte by byte.
 *
 * A 44-byte RIFF header plus PCM samples is the one media format that can be
 * produced without an encoder, and Mediabunny reads WAVE natively — which makes
 * these the fixtures that let the media tests run at all in a toolchain with no
 * ffmpeg. Everything encoded (H.264, AAC, DTS…) is committed instead.
 */
function wav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
	const channelCount = channels.length;
	const frames = channels[0]?.length ?? 0;
	const bytesPerSample = 2;
	const dataBytes = frames * channelCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);

	const ascii = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++) {
			view.setUint8(offset + index, text.codePointAt(index) ?? 0);
		}
	};

	ascii(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
	view.setUint16(32, channelCount * bytesPerSample, true);
	view.setUint16(34, 8 * bytesPerSample, true);
	ascii(36, "data");
	view.setUint32(40, dataBytes, true);

	let offset = 44;
	for (let frame = 0; frame < frames; frame++) {
		for (const channel of channels) {
			const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
			view.setInt16(offset, Math.round(sample * 32_767), true);
			offset += bytesPerSample;
		}
	}

	return new Uint8Array(buffer);
}

function tone(frequency: number, seconds: number, sampleRate: number, amplitude: number) {
	const samples = new Float32Array(Math.round(seconds * sampleRate));
	for (let index = 0; index < samples.length; index++) {
		samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
	}
	return samples;
}

async function writeAudioFixtures(): Promise<number> {
	await mkdir(new URL("audio/", ROOT), { recursive: true });

	// Two channels carrying different tones, so a channel mix-up is visible.
	await Bun.write(
		new URL("audio/stereo-44k.wav", ROOT),
		wav([tone(440, 1, 44_100, 0.5), tone(880, 1, 44_100, 0.5)], 44_100),
	);
	await Bun.write(new URL("audio/mono-48k.wav", ROOT), wav([tone(1000, 1, 48_000, 0.5)], 48_000));
	// Deliberately at full scale: this is the one that exercises normalisation.
	await Bun.write(new URL("audio/clipping.wav", ROOT), wav([tone(220, 1, 44_100, 1)], 44_100));
	await Bun.write(new URL("audio/silence.wav", ROOT), wav([new Float32Array(44_100)], 44_100));

	return 4;
}

async function main(): Promise<void> {
	await mkdir(new URL("subtitles/", ROOT), { recursive: true });

	for (const [name, content] of Object.entries(SUBTITLES)) {
		await Bun.write(new URL(`subtitles/${name}`, ROOT), content);
	}
	await Bun.write(new URL("subtitles/bom-utf8.srt", ROOT), BOM_SRT);
	await Bun.write(new URL("subtitles/cp1252.srt", ROOT), cp1252Srt());

	console.log(`wrote ${Object.keys(SUBTITLES).length + 2} subtitle fixtures`);
	console.log(`wrote ${await writeAudioFixtures()} audio fixtures`);
	console.log("Encoded media fixtures are committed, not generated — see the header.");
}

await main();
