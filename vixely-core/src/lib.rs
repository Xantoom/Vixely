//! Media routines that are too slow or too low-level for JavaScript.
//!
//! Everything exported here is called from `src/wasm/core.ts`, never directly from the UI.

mod sniff;

use wasm_bindgen::prelude::*;

pub use sniff::{MediaKind, Sniffed, sniff_bytes};

/// The crate version, shown in the browser capabilities page.
#[wasm_bindgen]
pub fn version() -> String {
	env!("CARGO_PKG_VERSION").to_owned()
}

/// Identifies a file from its first bytes. `head` should hold at least the first 4 KiB of the file.
#[wasm_bindgen]
pub fn sniff(head: &[u8]) -> Option<SniffResult> {
	sniff_bytes(head).map(|found| SniffResult {
		kind: found.kind.as_str().to_owned(),
		format: found.format.to_owned(),
	})
}

#[wasm_bindgen(getter_with_clone)]
pub struct SniffResult {
	/// One of `video`, `image`, `gif`, `audio`, `subtitles`.
	pub kind: String,
	/// Short format name, such as `mp4`, `jpeg` or `srt`.
	pub format: String,
}
