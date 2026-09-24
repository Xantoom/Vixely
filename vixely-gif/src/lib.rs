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

/// Writes an APNG: lossless, full colour and alpha. Each frame after the first stores only the
/// rectangle that changed, which keeps animations with a still background small.
/// A byte buffer the PNG writer fills while this side keeps a handle to read it at the end.
#[derive(Clone, Default)]
struct SharedBuffer(std::rc::Rc<std::cell::RefCell<Vec<u8>>>);

impl std::io::Write for SharedBuffer {
	fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
		self.0.borrow_mut().extend_from_slice(data);
		Ok(data.len())
	}

	fn flush(&mut self) -> std::io::Result<()> {
		Ok(())
	}
}

#[wasm_bindgen]
pub struct ApngWriter {
	writer: png::Writer<SharedBuffer>,
	output: SharedBuffer,
	width: u32,
	height: u32,
	previous: Option<Vec<u8>>,
}

/// Smallest rectangle holding every pixel that differs between two frames of the same size.
fn changed_area(previous: &[u8], next: &[u8], width: u32, height: u32) -> Option<(u32, u32, u32, u32)> {
	let (width, height) = (width as usize, height as usize);
	let (mut left, mut top, mut right, mut bottom) = (width, height, 0, 0);
	for y in 0..height {
		let row = y * width * 4;
		let (a, b) = (&previous[row..row + width * 4], &next[row..row + width * 4]);
		if a == b {
			continue;
		}
		let first = a.chunks_exact(4).zip(b.chunks_exact(4)).position(|(p, q)| p != q).unwrap_or(0);
		let last = width - 1 - a.chunks_exact(4).rev().zip(b.chunks_exact(4).rev()).position(|(p, q)| p != q).unwrap_or(0);
		left = left.min(first);
		right = right.max(last);
		top = top.min(y);
		bottom = y;
	}
	(left <= right).then(|| (left as u32, top as u32, (right - left + 1) as u32, (bottom - top + 1) as u32))
}

#[wasm_bindgen]
impl ApngWriter {
	/// `frames` is the number of frames that will be added. `repeat` −1 plays once, 0 loops
	/// forever, n loops n more times.
	#[wasm_bindgen(constructor)]
	pub fn new(width: u32, height: u32, frames: u32, repeat: i32) -> Result<ApngWriter, JsError> {
		let output = SharedBuffer::default();
		let mut encoder = png::Encoder::new(output.clone(), width, height);
		encoder.set_color(png::ColorType::Rgba);
		encoder.set_depth(png::BitDepth::Eight);
		encoder.set_compression(png::Compression::High);
		let plays = match repeat {
			0 => 0,
			n if n < 0 => 1,
			n => u32::try_from(n).unwrap_or(u32::MAX - 1) + 1,
		};
		encoder.set_animated(frames.max(1), plays).map_err(js_error)?;
		encoder.set_blend_op(png::BlendOp::Source).map_err(js_error)?;
		encoder.set_dispose_op(png::DisposeOp::None).map_err(js_error)?;
		let writer = encoder.write_header().map_err(js_error)?;
		Ok(ApngWriter { writer, output, width, height, previous: None })
	}

	/// Adds a frame shown for `delay` milliseconds.
	pub fn add_frame(&mut self, rgba: &[u8], delay: f64) -> Result<(), JsError> {
		if rgba.len() != (self.width * self.height * 4) as usize {
			return Err(JsError::new("The frame size doesn't match the animation."));
		}
		let delay = delay.round().clamp(1.0, 65_535.0) as u16;
		self.writer.set_frame_delay(delay, 1000).map_err(js_error)?;
		// An unchanged frame still needs a pixel: it only lengthens what shows.
		let (x, y, w, h) = match &self.previous {
			Some(previous) => changed_area(previous, rgba, self.width, self.height).unwrap_or((0, 0, 1, 1)),
			None => (0, 0, self.width, self.height),
		};
		self.writer.reset_frame_position().map_err(js_error)?;
		self.writer.set_frame_dimension(w, h).map_err(js_error)?;
		self.writer.set_frame_position(x, y).map_err(js_error)?;
		let stride = (self.width * 4) as usize;
		let mut area = Vec::with_capacity((w * h * 4) as usize);
		for row in y..y + h {
			let start = row as usize * stride + x as usize * 4;
			area.extend_from_slice(&rgba[start..start + (w * 4) as usize]);
		}
		self.writer.write_image_data(&area).map_err(js_error)?;
		self.previous = Some(rgba.to_vec());
		Ok(())
	}

	pub fn finish(self) -> Result<Vec<u8>, JsError> {
		self.writer.finish().map_err(js_error)?;
		Ok(self.output.0.take())
	}
}

/// Encodes one frame as a lossless WebP still, for browsers that can't encode WebP themselves.
#[wasm_bindgen]
pub fn encode_webp_lossless(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
	let mut output = Vec::new();
	image_webp::WebPEncoder::new(&mut output)
		.encode(rgba, width, height, image_webp::ColorType::Rgba8)
		.map_err(js_error)?;
	Ok(output)
}

/// Delay of a GIF frame as browsers play it, in milliseconds: under 20 ms counts as 100 ms.
fn played_delay(centiseconds: u16) -> f64 {
	let ms = f64::from(centiseconds) * 10.0;
	if ms < 20.0 { 100.0 } else { ms }
}

/// Turns a full picture into a GIF frame: its exact colours when there are 256 or fewer, otherwise
/// the best palette imagequant finds, dithered.
fn indexed_frame(pixels: imgref::ImgRef<'_, rgb::RGBA8>) -> Result<gif::Frame<'static>, String> {
	let (width, height) = (pixels.width(), pixels.height());
	let mut colours: std::collections::HashMap<[u8; 4], u8> = std::collections::HashMap::new();
	let mut indexes = Vec::with_capacity(width * height);
	let mut exact = true;
	for px in pixels.pixels() {
		// Anything mostly transparent becomes the single transparent entry.
		let key = if px.a < 128 { [0, 0, 0, 0] } else { [px.r, px.g, px.b, 255] };
		let next = colours.len();
		let index = *colours.entry(key).or_insert(next as u8);
		if colours.len() > 256 {
			exact = false;
			break;
		}
		indexes.push(index);
	}
	let (palette, indexes, transparent) = if exact {
		let mut palette = vec![0u8; colours.len() * 3];
		let mut transparent = None;
		for (key, &index) in &colours {
			palette[usize::from(index) * 3..usize::from(index) * 3 + 3].copy_from_slice(&key[..3]);
			if key[3] == 0 {
				transparent = Some(index);
			}
		}
		(palette, indexes, transparent)
	} else {
		let mut liq = imagequant::new();
		liq.set_quality(0, 100).map_err(|error| error.to_string())?;
		let buffer: Vec<rgb::RGBA8> = pixels.pixels().collect();
		let mut image = liq.new_image(buffer, width, height, 0.0).map_err(|error| error.to_string())?;
		let mut result = liq.quantize(&mut image).map_err(|error| error.to_string())?;
		result.set_dithering_level(1.0).map_err(|error| error.to_string())?;
		let (colours, indexes) = result.remapped(&mut image).map_err(|error| error.to_string())?;
		let transparent = colours.iter().position(|c| c.a < 128).and_then(|i| u8::try_from(i).ok());
		(colours.iter().flat_map(|c| [c.r, c.g, c.b]).collect(), indexes, transparent)
	};
	let width = u16::try_from(width).map_err(|error| error.to_string())?;
	let height = u16::try_from(height).map_err(|error| error.to_string())?;
	Ok(gif::Frame::from_palette_pixels(width, height, indexes, palette, transparent))
}

/// Cuts a GIF between two times (in seconds) without re-encoding it: frames are copied with their
/// own palettes and compression. Only the first frame kept is rebuilt when the cut falls after the
/// start, because it may draw over earlier frames that are no longer there.
fn trim(bytes: &[u8], start: f64, end: f64, repeat: i32) -> Result<Vec<u8>, String> {
	let (start, end) = (start * 1000.0, end * 1000.0);
	let mut options = gif::DecodeOptions::new();
	options.set_color_output(gif::ColorOutput::Indexed);
	let mut decoder = options.read_info(Cursor::new(bytes)).map_err(|error| error.to_string())?;
	let mut screen = gif_dispose::Screen::new_decoder(&decoder);
	let (width, height) = (decoder.width(), decoder.height());
	let palette = decoder.global_palette().map(<[u8]>::to_vec).unwrap_or_default();
	let mut encoder = gif::Encoder::new(Vec::new(), width, height, &palette).map_err(|error| error.to_string())?;
	encoder
		.set_repeat(match repeat {
			0 => gif::Repeat::Infinite,
			n if n < 0 => gif::Repeat::Finite(0),
			n => gif::Repeat::Finite(u16::try_from(n).unwrap_or(u16::MAX)),
		})
		.map_err(|error| error.to_string())?;
	let mut clock = 0.0;
	let mut index = 0;
	let mut written = 0;
	while let Some(frame) = decoder.read_next_frame().map_err(|error| error.to_string())? {
		let (from, to) = (clock, clock + played_delay(frame.delay));
		clock = to;
		screen.blit_frame(frame).map_err(|error| error.to_string())?;
		index += 1;
		if to <= start {
			continue;
		}
		if from >= end {
			break;
		}
		let shown = to.min(end) - from.max(start);
		let delay = if shown < to - from { (shown / 10.0).round().clamp(2.0, 65_535.0) as u16 } else { frame.delay };
		if written == 0 && (index > 1 || start > from) {
			let mut rebuilt = indexed_frame(screen.pixels_rgba())?;
			rebuilt.delay = delay;
			rebuilt.dispose = gif::DisposalMethod::Keep;
			encoder.write_frame(&rebuilt).map_err(|error| error.to_string())?;
		} else {
			let mut copy = frame.clone();
			copy.delay = delay;
			encoder.write_frame(&copy).map_err(|error| error.to_string())?;
		}
		written += 1;
	}
	if written == 0 {
		return Err("Nothing to keep between these times.".to_owned());
	}
	encoder.into_inner().map_err(|error| error.to_string())
}

/// Cuts a GIF without re-encoding it. See `trim`. `repeat` −1 plays once, 0 loops forever, n
/// loops n more times.
#[wasm_bindgen]
pub fn trim_gif(bytes: &[u8], start: f64, end: f64, repeat: i32) -> Result<Vec<u8>, JsError> {
	trim(bytes, start, end, repeat).map_err(|error| JsError::new(&error))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn frame(width: u32, height: u32, square: (u32, u32)) -> Vec<u8> {
		let mut rgba = vec![0u8; (width * height * 4) as usize];
		for (i, px) in rgba.chunks_exact_mut(4).enumerate() {
			let (x, y) = (i as u32 % width, i as u32 / width);
			let inside = x >= square.0 && x < square.0 + 8 && y >= square.1 && y < square.1 + 8;
			px.copy_from_slice(if inside { &[255, 255, 255, 255] } else { &[20, 60, 200, 255] });
		}
		rgba
	}

	/// A GIF of five 100 ms frames, each a different colour.
	fn five_colours() -> Vec<u8> {
		let mut encoder = gif::Encoder::new(Vec::new(), 8, 8, &[]).unwrap();
		encoder.set_repeat(gif::Repeat::Infinite).unwrap();
		for shade in [0u8, 60, 120, 180, 240] {
			let mut frame = gif::Frame::from_palette_pixels(8, 8, vec![0u8; 64], vec![shade, 255 - shade, 128], None);
			frame.delay = 10;
			encoder.write_frame(&frame).unwrap();
		}
		encoder.into_inner().unwrap()
	}

	fn decode(bytes: Vec<u8>) -> Vec<(u8, u32)> {
		let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(bytes)).unwrap();
		decoder
			.into_frames()
			.map(|frame| {
				let frame = frame.unwrap();
				(frame.buffer().as_raw()[0], frame.delay().numer_denom_ms().0)
			})
			.collect()
	}

	#[test]
	fn trims_a_gif_without_re_encoding() {
		// 150 ms to 380 ms: half of frame 1, frames 2, most of frame 3.
		let frames = decode(trim(&five_colours(), 0.15, 0.38, 0).unwrap());
		assert_eq!(frames.iter().map(|f| f.0).collect::<Vec<_>>(), [60, 120, 180]);
		assert_eq!(frames.iter().map(|f| f.1).collect::<Vec<_>>(), [50, 100, 80]);
		// Untouched: every frame comes back identical.
		assert_eq!(decode(trim(&five_colours(), 0.0, 0.5, 0).unwrap()), decode(five_colours()));
	}

	#[test]
	fn finds_the_changed_area() {
		let a = frame(64, 32, (0, 0));
		let b = frame(64, 32, (10, 4));
		assert_eq!(changed_area(&a, &b, 64, 32), Some((0, 0, 18, 12)));
		assert_eq!(changed_area(&a, &a, 64, 32), None);
	}

	#[test]
	fn writes_an_apng_that_reads_back() {
		let frames = [frame(64, 32, (0, 0)), frame(64, 32, (20, 10)), frame(64, 32, (40, 20))];
		let mut writer = ApngWriter::new(64, 32, 3, 0).unwrap();
		for rgba in &frames {
			writer.add_frame(rgba, 100.0).unwrap();
		}
		let bytes = writer.finish().unwrap();
		let decoder = image::codecs::png::PngDecoder::new(Cursor::new(bytes)).unwrap();
		let decoded: Vec<_> = decoder.apng().unwrap().into_frames().collect::<Result<_, _>>().unwrap();
		assert_eq!(decoded.len(), 3);
		for (frame, original) in decoded.iter().zip(&frames) {
			assert_eq!(frame.buffer().as_raw(), original, "frames must be lossless once composited");
			assert_eq!(frame.delay().numer_denom_ms(), (100, 1));
		}
	}
}
