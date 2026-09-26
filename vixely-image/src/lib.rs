//! Image encoders and decoders, compiled to WebAssembly and run in a worker.
//!
//! Loaded only when an image is exported, or opened in a format the browser can't read.

pub mod decode;
pub mod encode;

use wasm_bindgen::prelude::*;

/// Starts the encoders' thread pool, one Web Worker per thread. Multithreaded build only.
#[cfg(feature = "threads")]
pub use wasm_bindgen_rayon::init_thread_pool;

fn js_error(error: encode::EncodeError) -> JsError {
	JsError::new(&error.0)
}

#[wasm_bindgen]
pub fn encode_jpeg(rgba: &[u8], width: u32, height: u32, quality: f32, exif: &[u8]) -> Result<Vec<u8>, JsError> {
	encode::jpeg(rgba, width, height, quality, exif).map_err(js_error)
}

/// `lossy_quality` of 0 encodes losslessly. In every encoder, an empty `exif` embeds none.
#[wasm_bindgen]
pub fn encode_png(rgba: &[u8], width: u32, height: u32, lossy_quality: u8, exif: &[u8]) -> Result<Vec<u8>, JsError> {
	encode::png(rgba, width, height, (lossy_quality > 0).then_some(lossy_quality), exif).map_err(js_error)
}

#[wasm_bindgen]
pub fn encode_avif(
	rgba: &[u8],
	width: u32,
	height: u32,
	quality: f32,
	speed: u8,
	exif: &[u8],
) -> Result<Vec<u8>, JsError> {
	encode::avif(rgba, width, height, quality, speed, exif).map_err(js_error)
}

#[wasm_bindgen]
pub fn encode_jxl(
	rgba: &[u8],
	width: u32,
	height: u32,
	quality: f32,
	effort: u8,
	exif: &[u8],
) -> Result<Vec<u8>, JsError> {
	encode::jxl(rgba, width, height, quality, effort, exif).map_err(js_error)
}

#[wasm_bindgen(getter_with_clone)]
pub struct DecodedImage {
	pub width: u32,
	pub height: u32,
	pub rgba: Vec<u8>,
}

/// Decodes BMP, TIFF, ICO or JPEG XL, named by `format` as returned by `sniff`.
#[wasm_bindgen]
pub fn decode_image(bytes: &[u8], format: &str) -> Result<DecodedImage, JsError> {
	let decoded = if format == "jxl" {
		decode::jxl(bytes)
	} else {
		decode::raster(bytes)
	}
	.map_err(js_error)?;
	Ok(DecodedImage {
		width: decoded.width,
		height: decoded.height,
		rgba: decoded.rgba,
	})
}
