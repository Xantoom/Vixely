# gifski, patched for WebAssembly

gifski 1.34.0 by Kornel Lesiński (https://gif.ski), AGPL-3.0-or-later, vendored unchanged except
for one thing: browsers' WebAssembly has no threads, so on `wasm32` the pipeline stages that
normally run in parallel (resize, diff, quantize, remap, write) run one after the other, linked by
unbounded channels. Every change is behind `#[cfg(target_arch = "wasm32")]` and marked
`// Vixely:`; native builds are the original code.

Changed files: `src/lib.rs` (`new`, `write_frames`, `write_inner`) and `src/minipool.rs`.

Also added, on every target: `Writer::set_dithering(false)` turns dithering off (flat colours for
pixel art and emotes), through a `no_dithering` field of `SettingsExt`.
Updating: copy a newer gifski release over this folder and reapply the marked blocks.
