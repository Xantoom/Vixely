/**
 * Builds the Rust crates to WebAssembly with wasm-pack.
 *
 * A release build takes minutes, so a crate is only rebuilt when its sources, the workspace
 * manifest or the lockfile are newer than its output. `--force` rebuilds everything (CI, Docker).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CRATES = [
	{ dir: 'vixely-core', out: 'src/wasm/vixely-core', name: 'vixely_core' },
	{ dir: 'vixely-image', out: 'src/wasm/vixely-image', name: 'vixely_image' },
	{ dir: 'vixely-audio', out: 'src/wasm/vixely-audio', name: 'vixely_audio' },
];
const force = process.argv.includes('--force') || process.env.CI === 'true';

/**
 * vixely-image compiles C (libdeflate, for oxipng) to wasm32, which needs clang and llvm-ar.
 * Distributions often ship llvm-ar with a version suffix, so the first one found is used.
 */
function findTool(names: string[]): string | undefined {
	return names.find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
}

const versions = Array.from({ length: 12 }, (_, i) => 24 - i);
const ar = findTool(['llvm-ar', ...versions.map((v) => `llvm-ar-${v}`)]);
const cc = findTool(['clang', ...versions.map((v) => `clang-${v}`)]);
if (!ar || !cc) {
	console.error('clang and llvm-ar are required to build vixely-image (sudo apt-get install clang llvm).');
	process.exit(1);
}
const env = { ...process.env, CC_wasm32_unknown_unknown: cc, AR_wasm32_unknown_unknown: ar };

function newest(path: string): number {
	const stat = statSync(path);
	if (!stat.isDirectory()) return stat.mtimeMs;
	return Math.max(stat.mtimeMs, ...readdirSync(path).map((entry) => newest(join(path, entry))));
}

for (const crate of CRATES) {
	const output = join(crate.out, `${crate.name}_bg.wasm`);
	const inputs = Math.max(newest(crate.dir), newest('Cargo.toml'), newest('Cargo.lock'), newest('.cargo'));
	if (!force && existsSync(output) && statSync(output).mtimeMs > inputs) {
		console.log(`${crate.dir}: up to date`);
		continue;
	}
	console.log(`${crate.dir}: building…`);
	const result = spawnSync(
		'wasm-pack',
		['build', crate.dir, '--target', 'web', '--release', '--out-dir', `../${crate.out}`, '--out-name', crate.name, '--no-pack'],
		{ stdio: 'inherit', env },
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
}
