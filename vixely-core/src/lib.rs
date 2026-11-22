//! Small routines Vixely needs as soon as a file is dropped, such as recognising its type.
//!
//! Kept tiny on purpose: it loads on the first drop. Heavy codecs live in `vixely-image`.

pub mod metadata;
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

/// Photo metadata for display, plus EXIF ready to embed in an export.
#[wasm_bindgen(getter_with_clone)]
pub struct PhotoMetadata {
	pub make: Option<String>,
	pub model: Option<String>,
	pub lens: Option<String>,
	pub taken: Option<String>,
	pub exposure_time: Option<f64>,
	pub f_number: Option<f64>,
	pub iso: Option<u32>,
	pub focal_length: Option<f64>,
	pub software: Option<String>,
	pub latitude: Option<f64>,
	pub longitude: Option<f64>,
	pub exif_full: Vec<u8>,
	pub exif_without_location: Vec<u8>,
}

/// Reads EXIF from a photo. `bytes` should hold the whole file, or at least its metadata.
#[wasm_bindgen]
pub fn read_metadata(bytes: &[u8]) -> Option<PhotoMetadata> {
	metadata::read(bytes).map(|m| PhotoMetadata {
		make: m.make,
		model: m.model,
		lens: m.lens,
		taken: m.taken,
		exposure_time: m.exposure_time,
		f_number: m.f_number,
		iso: m.iso,
		focal_length: m.focal_length,
		software: m.software,
		latitude: m.latitude,
		longitude: m.longitude,
		exif_full: m.exif_full,
		exif_without_location: m.exif_without_location,
	})
}
