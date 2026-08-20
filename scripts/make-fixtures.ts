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

async function main(): Promise<void> {
	await mkdir(new URL("subtitles/", ROOT), { recursive: true });

	for (const [name, content] of Object.entries(SUBTITLES)) {
		await Bun.write(new URL(`subtitles/${name}`, ROOT), content);
	}
	await Bun.write(new URL("subtitles/bom-utf8.srt", ROOT), BOM_SRT);
	await Bun.write(new URL("subtitles/cp1252.srt", ROOT), cp1252Srt());

	console.log(`wrote ${Object.keys(SUBTITLES).length + 2} subtitle fixtures`);
	console.log("Encoded media fixtures are committed, not generated — see the header.");
}

await main();
