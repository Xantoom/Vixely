/**
 * Fails the CI when the shipped bundle grows past its budget.
 *
 * Without an automatic ceiling, bundle size only ever goes up and the finding
 * always arrives too late. The entry budget is the one that matters: landing on
 * the home page must not pull in WebGL, Mediabunny or jassub.
 */
import { readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

type Budget = {
	readonly label: string;
	/** Named `matches` rather than `match` so it is not read as `String#match`. */
	readonly matches: (name: string) => boolean;
	/** Gzipped kilobytes. */
	readonly maxKb: number;
};

const BUDGETS: readonly Budget[] = [
	{
		label: "entry + router (first paint of a marketing page)",
		matches: (name) => /^(index|router|routes)-/u.test(name),
		maxKb: 120,
	},
	{
		label: "each editor chunk",
		matches: (name) => /^(image|video|gif|audio|subtitles)-/.test(name),
		maxKb: 90,
	},
	{
		label: "each locale chunk",
		matches: (name) => /^(en|fr|es|it|de|zh|ja)-/.test(name),
		maxKb: 12,
	},
	{
		label: "the shared Mediabunny chunk",
		// The core library, told apart from the extensions by name.
		matches: (name) => /^mediabunny-[A-Za-z0-9_-]{8}\.js$/u.test(name),
		maxKb: 160,
	},
	{
		label: "each codec extension",
		// These carry WASM codecs and are large by nature. What matters is that
		// they are separate chunks: opening the audio editor must not download
		// the DTS encoder, and nothing here may reach a marketing page.
		matches: (name) =>
			/^mediabunny-(aac-encoder|mp3-encoder|flac-encoder|ac3|dts|prores)-/u.test(name),
		maxKb: 450,
	},
	{ label: "stylesheet", matches: (name) => name.endsWith(".css"), maxKb: 40 },
];

/**
 * The ceiling on what a session actually downloads.
 *
 * Codec extensions are excluded: they carry WASM, they are separate chunks, and
 * nobody downloads all six — a user who never touches DTS never fetches it.
 * Counting them here would measure a session that cannot happen.
 */
const TOTAL_JS_BUDGET_KB = 700;

const isCodecExtension = (name: string) =>
	/^mediabunny-(aac-encoder|mp3-encoder|flac-encoder|ac3|dts|prores)-/u.test(name);

async function main(): Promise<void> {
	const assets = new URL("../dist/client/assets/", import.meta.url);
	let entries: string[];
	try {
		entries = await readdir(assets);
	} catch {
		console.error("dist/client/assets not found — run `bun run build` first.");
		process.exit(1);
	}

	const sizes = new Map<string, number>();
	let totalJs = 0;

	for (const name of entries) {
		const file = Bun.file(new URL(name, assets));
		const bytes = gzipSync(new Uint8Array(await file.arrayBuffer())).byteLength;
		sizes.set(name, bytes);
		if (name.endsWith(".js") && !isCodecExtension(name)) totalJs += bytes;
	}

	const failures: string[] = [];

	for (const budget of BUDGETS) {
		for (const [name, bytes] of sizes) {
			if (!budget.matches(name)) continue;
			const kb = bytes / 1024;
			const status = kb > budget.maxKb ? "OVER" : "ok";
			console.log(
				`  ${status.padEnd(4)} ${name.padEnd(44)} ${kb.toFixed(1)} kB gz / ${budget.maxKb} kB`,
			);
			if (kb > budget.maxKb) {
				failures.push(
					`${name} is ${kb.toFixed(1)} kB gz, over the ${budget.maxKb} kB budget for ${budget.label}`,
				);
			}
		}
	}

	// The budget that matters most: arriving on a marketing page must not pull
	// in Mediabunny, WebGL or jassub.
	const entry = [...sizes.keys()].find((name) => /^index-.*\.js$/u.test(name));
	if (entry !== undefined) {
		const source = await Bun.file(new URL(entry, assets)).text();
		for (const forbidden of ["MatroskaOutputFormat", "EncodedPacketSink", "jassub"]) {
			if (source.includes(forbidden)) {
				failures.push(`the entry chunk pulls in ${forbidden}; it must stay out of it`);
			}
		}
	}

	const totalKb = totalJs / 1024;
	console.log(
		`\n  total JS excluding codec extensions: ${totalKb.toFixed(1)} kB gz / ${TOTAL_JS_BUDGET_KB} kB`,
	);
	if (totalKb > TOTAL_JS_BUDGET_KB) {
		failures.push(
			`total JS is ${totalKb.toFixed(1)} kB gz, over the ${TOTAL_JS_BUDGET_KB} kB budget`,
		);
	}

	if (failures.length > 0) {
		console.error(`\nBundle budget exceeded:\n${failures.map((line) => `  - ${line}`).join("\n")}`);
		process.exit(1);
	}
	console.log("\nBundle budget respected.");
}

await main();
