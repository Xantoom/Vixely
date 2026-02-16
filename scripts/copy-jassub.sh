#!/usr/bin/env sh
set -eu

DEST="public/jassub"
SRC="node_modules/jassub/dist"

mkdir -p "$DEST"
cp "$SRC/wasm/jassub-worker.js"   "$DEST/jassub-worker.js"
cp "$SRC/wasm/jassub-worker.wasm" "$DEST/jassub-worker.wasm"
cp "$SRC/default.woff2"           "$DEST/default.woff2"
