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
];
const force = process.argv.includes('--force') || process.env.CI === 'true';

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
		{ stdio: 'inherit' },
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
}
