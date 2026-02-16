#!/usr/bin/env sh
set -eu

resolve_linker() {
	if [ -n "${CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER:-}" ]; then
		printf '%s\n' "$CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER"
		return 0
	fi

	if command -v clang >/dev/null 2>&1; then
		command -v clang
		return 0
	fi

	if command -v gcc >/dev/null 2>&1; then
		command -v gcc
		return 0
	fi

	if command -v cc >/dev/null 2>&1 && cc --version >/dev/null 2>&1; then
		command -v cc
		return 0
	fi

	return 1
}

if ! linker="$(resolve_linker)"; then
	echo "No usable host C linker found for Rust build scripts." >&2
	if command -v cc >/dev/null 2>&1; then
		cc_path="$(command -v cc)"
		if [ -f "$cc_path" ] && grep -q "zig cc" "$cc_path" 2>/dev/null && ! command -v zig >/dev/null 2>&1; then
			echo "Detected a broken Zig-based cc wrapper at $cc_path (zig is missing)." >&2
			echo "Install zig or remove/fix that wrapper, then run: bun run build:wasm" >&2
			exit 1
		fi
	fi

	echo "Install clang or gcc, or set CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER to a working linker binary." >&2
	exit 1
fi

export CC="$linker"
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="$linker"

exec wasm-pack build vixely-core --target web --out-dir ../wasm --release
