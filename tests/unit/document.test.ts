import { describe, expect, it } from "vitest";
import {
	assertSerializable,
	createAudioDocument,
	createGifDocument,
	createImageDocument,
	createSubtitleDocument,
	createVideoDocument,
	documentsEqual,
	isIdentityFilters,
	NEUTRAL_FILTERS,
	parseDocument,
	stringifyDocument,
	type AnyDocument,
	type SourceRef,
} from "~/core/document";

const SOURCE: SourceRef = {
	id: "0198c0de-0000-7000-8000-000000000000",
	name: "sample.png",
	byteLength: 1024,
	mimeType: "image/png",
};

const DOCUMENTS: readonly AnyDocument[] = [
	createImageDocument(SOURCE, 1920, 1080),
	createGifDocument(SOURCE, 480, 270),
	createAudioDocument(SOURCE, 61.5),
	createSubtitleDocument(SOURCE),
	createVideoDocument(SOURCE, 3600, 3840, 2160),
];

describe("document serialisation (D4)", () => {
	it.each(DOCUMENTS.map((document) => [document.kind, document] as const))(
		"%s survives a JSON round trip unchanged",
		(_kind, document) => {
			expect(parseDocument(stringifyDocument(document))).toEqual(document);
		},
	);

	it.each(DOCUMENTS.map((document) => [document.kind, document] as const))(
		"%s contains nothing JSON cannot represent",
		(_kind, document) => {
			expect(() => assertSerializable(document)).not.toThrow();
		},
	);

	it("rejects a class instance", () => {
		expect(() => assertSerializable({ when: new Date() })).toThrow(/not serializable/);
	});

	it("rejects a Map", () => {
		expect(() => assertSerializable({ tracks: new Map() })).toThrow(/not serializable/);
	});

	it("rejects undefined", () => {
		expect(() => assertSerializable({ crop: undefined })).toThrow(/undefined/);
	});

	it("rejects NaN, which JSON turns into null", () => {
		expect(() => assertSerializable({ width: Number.NaN })).toThrow(/non-finite/);
	});

	it("rejects an unknown document kind", () => {
		expect(() => parseDocument('{"kind":"spreadsheet"}')).toThrow(/unknown document kind/);
	});

	it("compares documents structurally", () => {
		const [first] = DOCUMENTS;
		expect(documentsEqual(first!, createImageDocument(SOURCE, 1920, 1080))).toBe(true);
		expect(documentsEqual(first!, createImageDocument(SOURCE, 1920, 1081))).toBe(false);
	});
});

describe("filter defaults", () => {
	it("treats the neutral set as identity", () => {
		expect(isIdentityFilters(NEUTRAL_FILTERS)).toBe(true);
	});

	it("detects any single adjustment", () => {
		expect(isIdentityFilters({ ...NEUTRAL_FILTERS, contrast: 0.01 })).toBe(false);
		expect(isIdentityFilters({ ...NEUTRAL_FILTERS, gamma: 1.001 })).toBe(false);
	});
});
