//! Animated images for Vixely: reading GIF, APNG and animated WebP frame by frame, and writing
//! GIFs with gifski. Loaded by the GIF editor only.

use std::io::Cursor;

use gifski::{Collector, Repeat, Settings, Writer, progress::NoProgress};
use image::{AnimationDecoder, Frames, ImageDecoder};
use imgref::ImgVec;
use rgb::FromSlice;
use wasm_bindgen::prelude::*;

fn js_error(error: impl std::fmt::Display) -> JsError {
	JsError::new(&error.to_string())
}

/// One frame of an animation, composited on the full canvas.
#[wasm_bindgen(getter_with_clone)]
pub struct AnimationFrame {
	pub rgba: Vec<u8>,
	pub width: u32,
	pub height: u32,
	/// How long the frame shows, in milliseconds.
	pub delay: f64,
}

/// Reads an animation one frame at a time, so a long GIF never has to be decoded all at once.
#[wasm_bindgen]
pub struct AnimationReader {
	frames: Frames<'static>,
	width: u32,
	height: u32,
}

#[wasm_bindgen]
impl AnimationReader {
	/// `format` is `gif`, `apng` or `webp`.
	#[wasm_bindgen(constructor)]
	pub fn new(bytes: Vec<u8>, format: &str) -> Result<AnimationReader, JsError> {
		let reader = Cursor::new(bytes);
		let (frames, (width, height)) = match format {
			"gif" => {
				let decoder = image::codecs::gif::GifDecoder::new(reader).map_err(js_error)?;
				let size = decoder.dimensions();
				(decoder.into_frames(), size)
			}
			"apng" | "png" => {
				let decoder = image::codecs::png::PngDecoder::new(reader).map_err(js_error)?;
				let size = decoder.dimensions();
				(decoder.apng().map_err(js_error)?.into_frames(), size)
			}
			"webp" => {
				let decoder = image::codecs::webp::WebPDecoder::new(reader).map_err(js_error)?;
				let size = decoder.dimensions();
				(decoder.into_frames(), size)
			}
			_ => return Err(JsError::new("Not an animation format.")),
		};
		Ok(AnimationReader { frames, width, height })
	}

	pub fn width(&self) -> u32 {
		self.width
	}

	pub fn height(&self) -> u32 {
		self.height
	}

	/// The next frame, or `undefined` after the last one.
	pub fn next_frame(&mut self) -> Result<Option<AnimationFrame>, JsError> {
		let Some(frame) = self.frames.next() else { return Ok(None) };
		let frame = frame.map_err(js_error)?;
		let (numerator, denominator) = frame.delay().numer_denom_ms();
		let buffer = frame.into_buffer();
		Ok(Some(AnimationFrame {
			width: buffer.width(),
			height: buffer.height(),
			rgba: buffer.into_raw(),
			delay: f64::from(numerator) / f64::from(denominator.max(1)),
		}))
	}
}

/// Writes a GIF with gifski. Frames are added with their presentation time, then `finish`
/// quantizes them together: palettes are shared across frames and dithering is temporal, which
/// is what makes gifski GIFs look smooth.
#[wasm_bindgen]
pub struct GifWriter {
	collector: Option<Collector>,
	writer: Option<Writer>,
	count: usize,
}

#[wasm_bindgen]
impl GifWriter {
	/// `quality` 1 to 100. `lossy` 0 to 100 (100 is no lossy compression). `repeat` −1 plays once,
	/// 0 loops forever, n loops n more times.
	#[wasm_bindgen(constructor)]
	pub fn new(quality: u8, lossy: u8, repeat: i32, fast: bool) -> Result<GifWriter, JsError> {
		let repeat = match repeat {
			0 => Repeat::Infinite,
			n if n < 0 => Repeat::Finite(0),
			n => Repeat::Finite(u16::try_from(n).unwrap_or(u16::MAX)),
		};
		let settings = Settings { width: None, height: None, quality: quality.clamp(1, 100), fast, repeat };
		let (collector, mut writer) = gifski::new(settings).map_err(js_error)?;
		// gifski plans to move this into `Settings`; until then, this is the way to set it.
		#[allow(deprecated)]
		writer.set_lossy_quality(lossy.clamp(1, 100));
		Ok(GifWriter { collector: Some(collector), writer: Some(writer), count: 0 })
	}

	/// Adds a frame shown from `pts` seconds.
	pub fn add_frame(&mut self, rgba: &[u8], width: u32, height: u32, pts: f64) -> Result<(), JsError> {
		let collector = self.collector.as_ref().ok_or_else(|| JsError::new("The GIF is already finished."))?;
		let (width, height) = (width as usize, height as usize);
		if rgba.len() != width * height * 4 {
			return Err(JsError::new("The frame size doesn't match its pixels."));
		}
		let image = ImgVec::new(rgba.as_rgba().to_vec(), width, height);
		collector.add_frame_rgba(self.count, image, pts).map_err(js_error)?;
		self.count += 1;
		Ok(())
	}

	/// Encodes every frame added and returns the GIF file.
	pub fn finish(&mut self) -> Result<Vec<u8>, JsError> {
		// Dropping the collector tells the writer there are no more frames.
		drop(self.collector.take());
		let writer = self.writer.take().ok_or_else(|| JsError::new("The GIF is already finished."))?;
		let mut output = Vec::new();
		writer.write(&mut output, &mut NoProgress {}).map_err(js_error)?;
		Ok(output)
	}
}
