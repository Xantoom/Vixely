import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	assColourToCss,
	buildDisplaySets,
	charactersPerSecond,
	codecIdFor,
	conversionLosses,
	convertTrack,
	cssColourToAss,
	decodeRle,
	decodeSubtitleText,
	detectFormat,
	encodeRle,
	findOverlaps,
	formatAssTime,
	formatForCodecId,
	formatSrtTime,
	parseAss,
	parseAssTime,
	parseSrt,
	parseSupSegments,
	parseVtt,
	renderDisplaySet,
	serialiseAss,
	serialiseSrt,
	serialiseVtt,
	shiftCues,
	sortCues,
	stripAssTags,
	textToAss,
	ycrcbToRgb,
} from "~/core/subtitles";

function fixture(name: string): string {
	return readFileSync(new URL(`../fixtures/subtitles/${name}`, import.meta.url), "utf8");
}

function fixtureBytes(name: string): Uint8Array {
	return new Uint8Array(readFileSync(new URL(`../fixtures/subtitles/${name}`, import.meta.url)));
}

describe("SRT", () => {
	it("parses the reference fixture", () => {
		const track = parseSrt(fixture("basic.srt"));
		expect(track.cues).toHaveLength(2);
		expect(track.cues[0]).toMatchObject({
			startMs: 1000,
			endMs: 3500,
			text: "The first line.",
		});
		expect(track.cues[1]?.text).toBe("A second line,\nsplit across two rows.");
	});

	it("round-trips without loss", () => {
		const original = fixture("basic.srt");
		const once = parseSrt(original);
		const written = serialiseSrt(once);
		const twice = parseSrt(written);
		expect(twice.cues).toEqual(once.cues);
	});

	it("reads a file with a UTF-8 BOM", () => {
		const track = parseSrt(fixture("bom-utf8.srt"));
		expect(track.cues).toHaveLength(2);
		expect(track.cues[0]?.text).toBe("The first line.");
	});

	it("accepts a dot as the decimal separator", () => {
		const track = parseSrt("1\n00:00:01.500 --> 00:00:02.750\nDot separated.\n");
		expect(track.cues[0]?.startMs).toBe(1500);
		expect(track.cues[0]?.endMs).toBe(2750);
	});

	it("accepts a missing cue index", () => {
		const track = parseSrt("00:00:01,000 --> 00:00:02,000\nNo index here.\n");
		expect(track.cues).toHaveLength(1);
		expect(track.cues[0]?.text).toBe("No index here.");
	});

	it("reads a two-digit fraction as hundredths, not as milliseconds", () => {
		const track = parseSrt("1\n00:00:01,50 --> 00:00:02,25\nShort fraction.\n");
		expect(track.cues[0]?.startMs).toBe(1500);
		expect(track.cues[0]?.endMs).toBe(2250);
	});

	it("rejects a file whose timing line is unreadable", () => {
		expect(() => parseSrt("1\nnot a timing line\nText\n")).toThrow(/expected a timing line/);
	});

	it("formats times the way the format expects", () => {
		expect(formatSrtTime(0)).toBe("00:00:00,000");
		expect(formatSrtTime(3_661_500)).toBe("01:01:01,500");
	});
});

describe("WebVTT", () => {
	it("parses cue settings rather than discarding them", () => {
		const track = parseVtt(fixture("positioned.vtt"));
		expect(track.cues).toHaveLength(2);
		expect(track.cues[0]?.marginVertical).toBe(90);
		expect(track.cues[1]?.marginLeft).toBe(10);
	});

	it("skips NOTE blocks", () => {
		const track = parseVtt(fixture("positioned.vtt"));
		expect(track.cues.some((cue) => cue.text.includes("NOTE"))).toBe(false);
	});

	it("round-trips without loss", () => {
		const once = parseVtt(fixture("positioned.vtt"));
		const twice = parseVtt(serialiseVtt(once));
		expect(twice.cues).toEqual(once.cues);
	});

	it("requires the signature", () => {
		expect(() => parseVtt("00:00:01.000 --> 00:00:02.000\nText")).toThrow(/must start with WEBVTT/);
	});

	it("accepts a timing line without an hour field", () => {
		const track = parseVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nShort form.\n");
		expect(track.cues[0]?.startMs).toBe(1000);
	});
});

describe("ASS", () => {
	it("parses styles and dialogue from the reference fixture", () => {
		const track = parseAss(fixture("styled.ass"));
		expect(track.styles).toHaveLength(2);
		expect(track.styles[0]?.name).toBe("Default");
		expect(track.styles[1]?.bold).toBe(true);
		expect(track.cues).toHaveLength(3);
		expect(track.scriptInfo["PlayResX"]).toBe("1920");
	});

	it("keeps commas inside the text field", () => {
		const track = parseAss(fixture("styled.ass"));
		const withOverride = track.cues[1];
		expect(withOverride?.text).toContain("{\\i1}");
		expect(withOverride?.text).toContain("then normal.");
	});

	it("reads a layer and a positioned sign", () => {
		const track = parseAss(fixture("styled.ass"));
		expect(track.cues[2]?.layer).toBe(1);
		expect(track.cues[2]?.styleName).toBe("Sign");
		expect(track.cues[2]?.text).toContain("\\pos(960,120)");
	});

	it("round-trips styles, timings and text", () => {
		const once = parseAss(fixture("styled.ass"));
		const twice = parseAss(serialiseAss(once));
		expect(twice.cues).toEqual(once.cues);
		expect(twice.styles).toEqual(once.styles);
	});

	it("round-trips karaoke timing untouched", () => {
		const once = parseAss(fixture("karaoke.ass"));
		expect(once.cues[0]?.text).toContain("{\\k30}");
		const twice = parseAss(serialiseAss(once));
		expect(twice.cues[0]?.text).toBe(once.cues[0]?.text);
	});

	it("reads fields by name, not by position", () => {
		const reordered = [
			"[Script Info]",
			"ScriptType: v4.00+",
			"",
			"[Events]",
			"Format: Start, End, Style, Layer, Name, MarginL, MarginR, MarginV, Effect, Text",
			"Dialogue: 0:00:01.00,0:00:02.00,Sign,3,,0,0,0,,Reordered fields.",
		].join("\n");

		const track = parseAss(reordered);
		expect(track.cues[0]?.startMs).toBe(1000);
		expect(track.cues[0]?.styleName).toBe("Sign");
		expect(track.cues[0]?.layer).toBe(3);
		expect(track.cues[0]?.text).toBe("Reordered fields.");
	});

	it("handles centisecond timings", () => {
		expect(parseAssTime("0:00:01.50")).toBe(1500);
		expect(parseAssTime("1:02:03.25")).toBe(3_723_250);
		expect(formatAssTime(1500)).toBe("0:00:01.50");
		// Rounding down, so a cue cannot be pushed past its neighbour.
		expect(formatAssTime(1599)).toBe("0:00:01.59");
	});

	it("rejects a file with no sections", () => {
		expect(() => parseAss("just some text\n")).toThrow(/no ASS section header/);
	});

	it("converts colours both ways", () => {
		expect(assColourToCss("&H00FFFFFF")).toBe("#ffffff");
		// ASS is &HAABBGGRR: blue and red are swapped relative to CSS.
		expect(assColourToCss("&H000000FF")).toBe("#ff0000");
		expect(cssColourToAss("#ff0000")).toBe("&H000000FF");
		expect(assColourToCss("&H80000000")).toMatch(/rgba/);
	});

	it("strips override tags and rewrites line breaks", () => {
		expect(stripAssTags("{\\i1}Hello{\\i0}\\Nworld")).toBe("Hello\nworld");
	});

	it("turns inline HTML markup into ASS overrides", () => {
		expect(textToAss("<i>Hello</i>\nworld")).toBe("{\\i1}Hello{\\i0}\\Nworld");
	});
});

describe("encoding detection", () => {
	it("reads a UTF-8 file as UTF-8", () => {
		const result = decodeSubtitleText(fixtureBytes("basic.srt"));
		expect(result.encoding).toBe("utf-8");
	});

	it("falls back to Windows-1252 rather than producing replacement characters", () => {
		const result = decodeSubtitleText(fixtureBytes("cp1252.srt"));
		expect(result.encoding).toBe("windows-1252");
		expect(result.text).toContain("Déjà vu");
		expect(result.text).not.toContain("�");
	});
});

describe("format detection", () => {
	it.each([
		["basic.srt", "srt"],
		["positioned.vtt", "vtt"],
		["styled.ass", "ass"],
	] as const)("recognises %s", (name, expected) => {
		expect(detectFormat(fixture(name), name)).toBe(expected);
	});

	it("falls back to the extension when the content is inconclusive", () => {
		expect(detectFormat("", "track.sup")).toBe("pgs");
		expect(detectFormat("", "unknown.bin")).toBeNull();
	});

	it("maps Matroska codec ids both ways", () => {
		expect(formatForCodecId("S_TEXT/ASS")).toBe("ass");
		expect(formatForCodecId("S_HDMV/PGS")).toBe("pgs");
		expect(formatForCodecId("S_TEXT/UTF8")).toBe("srt");
		expect(formatForCodecId("V_MPEG4/ISO/AVC")).toBeNull();
		expect(codecIdFor("ass")).toBe("S_TEXT/ASS");
		expect(codecIdFor("pgs")).toBe("S_HDMV/PGS");
	});
});

describe("conversion losses are stated, not applied silently", () => {
	it("lists what ASS loses on the way to SRT", () => {
		const track = parseAss(fixture("styled.ass"));
		const losses = conversionLosses("ass", "srt", track);
		expect(losses.map((loss) => loss.code)).toContain("styles");
		expect(losses.map((loss) => loss.code)).toContain("layers");
	});

	it("lists karaoke separately, because it is what people miss most", () => {
		const track = parseAss(fixture("karaoke.ass"));
		expect(conversionLosses("ass", "srt", track).map((loss) => loss.code)).toContain("karaoke");
	});

	it("says PGS cannot become text", () => {
		const losses = conversionLosses("pgs", "srt", { cues: [], styles: [] });
		expect(losses[0]?.code).toBe("images");
	});

	it("warns that converting to PGS makes the text uneditable", () => {
		const losses = conversionLosses("srt", "pgs", { cues: [], styles: [] });
		expect(losses[0]?.code).toBe("text-uneditable");
	});

	it("finds nothing to lose when the format does not change", () => {
		const track = parseAss(fixture("styled.ass"));
		expect(conversionLosses("ass", "ass", track)).toEqual([]);
	});

	it("actually strips the tags it says it will", () => {
		const track = parseAss(fixture("styled.ass"));
		const { track: converted, losses } = convertTrack(track, "srt");
		expect(losses.length).toBeGreaterThan(0);
		expect(converted.format).toBe("srt");
		expect(converted.cues.every((cue) => !cue.text.includes("{\\"))).toBe(true);
		expect(converted.styles).toEqual([]);
	});

	it("promotes SRT markup into ASS overrides on the way up", () => {
		const track = parseSrt("1\n00:00:01,000 --> 00:00:02,000\n<i>Italic</i>\n");
		const { track: converted } = convertTrack(track, "ass");
		expect(converted.cues[0]?.text).toBe("{\\i1}Italic{\\i0}");
	});
});

describe("cue analysis", () => {
	it("finds same-layer overlaps", () => {
		const track = parseSrt(fixture("overlapping.srt"));
		expect(findOverlaps(track.cues)).toHaveLength(1);
	});

	it("does not call different layers an overlap", () => {
		const track = parseAss(fixture("styled.ass"));
		// The sign is on layer 1 and deliberately coexists with the dialogue.
		expect(findOverlaps(track.cues)).toHaveLength(0);
	});

	it("measures reading speed without counting markup", () => {
		const plain = charactersPerSecond({
			id: "a",
			startMs: 0,
			endMs: 1000,
			text: "12345",
			styleName: null,
			layer: 0,
			marginLeft: null,
			marginRight: null,
			marginVertical: null,
			effect: null,
		});
		expect(plain).toBe(5);

		const tagged = charactersPerSecond({
			id: "b",
			startMs: 0,
			endMs: 1000,
			text: "{\\pos(10,10)}12345",
			styleName: null,
			layer: 0,
			marginLeft: null,
			marginRight: null,
			marginVertical: null,
			effect: null,
		});
		expect(tagged).toBe(5);
	});

	it("shifts and sorts cues", () => {
		const track = parseSrt(fixture("basic.srt"));
		const shifted = shiftCues(track.cues, 500);
		expect(shifted[0]?.startMs).toBe(1500);
		// A negative shift cannot push a cue before zero.
		expect(shiftCues(track.cues, -5000)[0]?.startMs).toBe(0);
		expect(sortCues(shifted).map((cue) => cue.startMs)).toEqual([1500, 4500]);
	});
});

describe("PGS", () => {
	it("decodes a run-length line", () => {
		// Escape, then 5 pixels of colour 3; escape, end of line.
		const data = Uint8Array.from([0x00, 0x85, 0x03, 0x00, 0x00]);
		const decoded = decodeRle(data, 8, 1);
		expect([...decoded]).toEqual([3, 3, 3, 3, 3, 0, 0, 0]);
	});

	it("decodes single pixels written without an escape", () => {
		const data = Uint8Array.from([7, 8, 9, 0x00, 0x00]);
		expect([...decodeRle(data, 3, 1)]).toEqual([7, 8, 9]);
	});

	it("decodes a long run", () => {
		// 0x40 sets the long-run flag: count spans two bytes.
		const data = Uint8Array.from([0x00, 0xc0 | 0x01, 0x00, 0x05, 0x00, 0x00]);
		const decoded = decodeRle(data, 300, 1);
		expect(decoded[0]).toBe(5);
		expect(decoded[255]).toBe(5);
		expect(decoded[256]).toBe(0);
	});

	it("round-trips through its own encoder", () => {
		const width = 16;
		const height = 4;
		const indices = new Uint8Array(width * height);
		for (let index = 0; index < indices.length; index++) {
			indices[index] = index < 20 ? 0 : (index % 5) + 1;
		}
		const decoded = decodeRle(encodeRle(indices, width, height), width, height);
		expect([...decoded]).toEqual([...indices]);
	});

	it("converts BT.709 palette entries to RGB", () => {
		// Y=235 is nominal white in limited range.
		const [r, g, b] = ycrcbToRgb(235, 128, 128);
		expect(r).toBeGreaterThan(250);
		expect(g).toBeGreaterThan(250);
		expect(b).toBeGreaterThan(250);

		const [dr, dg, db] = ycrcbToRgb(16, 128, 128);
		expect(dr + dg + db).toBe(0);
	});

	it("rejects a stream without the PG magic", () => {
		expect(() => parseSupSegments(new Uint8Array(20))).toThrow(/PG magic/);
	});

	it("groups segments into display sets and renders one", () => {
		const bytes = buildSupFixture();
		const segments = parseSupSegments(bytes);
		expect(segments.map((segment) => segment.type)).toEqual(["PCS", "WDS", "PDS", "ODS", "END"]);

		const sets = buildDisplaySets(segments);
		expect(sets).toHaveLength(1);
		expect(sets[0]?.isClear).toBe(false);
		expect(sets[0]?.objects[0]?.width).toBe(4);

		const pixels = renderDisplaySet(sets[0]!, 8, 2);
		// The object is placed at (1, 0) and is opaque white in the palette.
		expect(pixels[(0 * 8 + 1) * 4 + 3]).toBe(255);
		expect(pixels[0 * 4 + 3]).toBe(0);
	});
});

/** A minimal but structurally real .sup: one 4×2 object on an 8×2 screen. */
function buildSupFixture(): Uint8Array {
	const bytes: number[] = [];

	const segment = (type: number, data: readonly number[], timeMs: number) => {
		const ticks = Math.round((timeMs / 1000) * 90_000);
		bytes.push(
			0x50,
			0x47,
			(ticks >>> 24) & 0xff,
			(ticks >>> 16) & 0xff,
			(ticks >>> 8) & 0xff,
			ticks & 0xff,
			0,
			0,
			0,
			0,
			type,
			(data.length >> 8) & 0xff,
			data.length & 0xff,
			...data,
		);
	};

	// PCS: width(2) height(2) frameRate(1) compositionNumber(2) state(1)
	// paletteUpdate(1) paletteId(1) objectCount(1), then one object: id(2)
	// windowId(1) flags(1) x(2) y(2). Object 1 is placed at (1, 0).
	segment(0x16, [0, 8, 0, 2, 0x10, 0, 0, 0x00, 0, 0, 1, 0, 1, 0, 0x00, 0, 1, 0, 0], 1000);
	// WDS: one window covering the screen.
	segment(0x17, [1, 0, 0, 0, 0, 0, 0, 8, 0, 2], 1000);
	// PDS: entry 1 is opaque white.
	segment(0x14, [0, 0, 1, 235, 128, 128, 255], 1000);
	// ODS: id(2) version(1) sequence(1) dataLength(3) width(2) height(2) then RLE.
	const rle = [0x00, 0x84, 0x01, 0x00, 0x00, 0x00, 0x84, 0x01, 0x00, 0x00];
	segment(0x15, [0, 1, 0, 0x80, ...intTo24(rle.length + 4), 0, 4, 0, 2, ...rle], 1000);
	segment(0x80, [], 1000);

	return Uint8Array.from(bytes);
}

function intTo24(value: number): number[] {
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
