//! Decoders for image formats that browsers can't read themselves.

use crate::encode::EncodeError;

pub struct Decoded {
	pub width: u32,
	pub height: u32,
	/// Straight sRGB RGBA, row by row from the top.
	pub rgba: Vec<u8>,
}

fn fail(error: impl std::fmt::Display) -> EncodeError {
	EncodeError(error.to_string())
}

/// BMP, TIFF and ICO through the `image` crate.
pub fn raster(bytes: &[u8]) -> Result<Decoded, EncodeError> {
	let image = image::load_from_memory(bytes).map_err(fail)?.into_rgba8();
	Ok(Decoded {
		width: image.width(),
		height: image.height(),
		rgba: image.into_raw(),
	})
}

/// JPEG XL through jxl-oxide, converted to sRGB. Only the first frame of an animation is read.
pub fn jxl(bytes: &[u8]) -> Result<Decoded, EncodeError> {
	use jxl_oxide::{EnumColourEncoding, JxlImage, RenderingIntent};
	let mut image = JxlImage::builder().read(bytes).map_err(fail)?;
	image.request_color_encoding(EnumColourEncoding::srgb(RenderingIntent::Relative));
	let render = image.render_frame(0).map_err(fail)?;
	let mut stream = render.stream();
	let (width, height, channels) = (stream.width(), stream.height(), stream.channels() as usize);
	let mut samples = vec![0f32; width as usize * height as usize * channels];
	stream.write_to_buffer(&mut samples);

	let to_byte = |v: f32| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
	let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
	for pixel in samples.chunks_exact(channels) {
		let (r, g, b, a) = match channels {
			1 => (pixel[0], pixel[0], pixel[0], 1.0),
			2 => (pixel[0], pixel[0], pixel[0], pixel[1]),
			3 => (pixel[0], pixel[1], pixel[2], 1.0),
			_ => (pixel[0], pixel[1], pixel[2], pixel[3]),
		};
		rgba.extend_from_slice(&[to_byte(r), to_byte(g), to_byte(b), to_byte(a)]);
	}
	Ok(Decoded { width, height, rgba })
}
