/**
 * Builds the Rust crates to WebAssembly with wasm-pack.
 *
 * A release build takes minutes, so a crate is only rebuilt when its sources, the workspace
 * manifest or the lockfile are newer than its output. `--force` rebuilds everything (CI, Docker).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The nightly compiler for multithreaded builds: WebAssembly threads need the standard library
 * rebuilt with atomics, which only nightly can do. Pinned, so builds stay reproducible.
 */
export const NIGHTLY = 'nightly-2026-09-20';

interface Crate {
	dir: string;
	out: string;
	name: string;
	/** Other folders the crate is built from, such as vendored dependencies. */
	watch?: string[];
	/** Built with WebAssembly threads and these Cargo features. */
	threads?: string[];
}

const CRATES: Crate[] = [
	{ dir: 'vixely-core', out: 'src/wasm/vixely-core', name: 'vixely_core' },
	{ dir: 'vixely-image', out: 'src/wasm/vixely-image', name: 'vixely_image' },
	{ dir: 'vixely-image', out: 'src/wasm/vixely-image-mt', name: 'vixely_image', threads: ['threads'] },
	{ dir: 'vixely-audio', out: 'src/wasm/vixely-audio', name: 'vixely_audio' },
	{ dir: 'vixely-gif', out: 'src/wasm/vixely-gif', name: 'vixely_gif', watch: ['vendor/gifski'] },
	{ dir: 'vixely-subs', out: 'src/wasm/vixely-subs', name: 'vixely_subs' },
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
	const inputs = Math.max(
		newest(crate.dir),
		...(crate.watch ?? []).map(newest),
		newest('Cargo.toml'),
		newest('Cargo.lock'),
		newest('.cargo'),
	);
	if (!force && existsSync(output) && statSync(output).mtimeMs > inputs) {
		console.log(`${crate.out}: up to date`);
		continue;
	}
	console.log(`${crate.out}: building…`);
	const args = ['build', crate.dir, '--target', 'web', '--release', '--out-dir', `../${crate.out}`, '--out-name', crate.name, '--no-pack'];
	const threaded = crate.threads
		? {
				args: ['--', '--features', crate.threads.join(','), '-Z', 'build-std=panic_abort,std'],
				env: {
					RUSTUP_TOOLCHAIN: NIGHTLY,
					// Replaces .cargo/config.toml's flags: threads need atomics and a shared memory,
					// allowed to grow to 4 GB for large pictures.
					RUSTFLAGS:
						[
							'-C target-feature=+atomics,+bulk-memory,+mutable-globals,+simd128',
							// A memory the workers share, with the thread-local storage wasm-bindgen sets up.
							...[
								'--shared-memory',
								'--import-memory',
								'--max-memory=4294967296',
								'--export=__wasm_init_tls',
								'--export=__tls_size',
								'--export=__tls_align',
								'--export=__tls_base',
							].map((arg) => `-C link-arg=${arg}`),
						].join(' '),
					// Its own folder, so the two builds don't keep invalidating each other.
					CARGO_TARGET_DIR: join(process.cwd(), 'target', 'threads'),
				},
			}
		: { args: [], env: {} };
	const result = spawnSync('wasm-pack', [...args, ...threaded.args], {
		stdio: 'inherit',
		env: { ...env, ...threaded.env },
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
	// The thread pool's workers import the package by its folder: it needs a manifest.
	if (crate.threads) {
		writeFileSync(
			join(crate.out, 'package.json'),
			`${JSON.stringify({ name: crate.out.split('/').pop(), type: 'module', main: `${crate.name}.js` }, null, '\t')}\n`,
		);
	}
}
