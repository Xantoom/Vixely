//! Image encoders. Every function takes straight (not premultiplied) sRGB RGBA pixels, row by
//! row from the top, and returns the encoded file.

use rgb::FromSlice;

#[derive(Debug)]
pub struct EncodeError(pub String);

impl std::fmt::Display for EncodeError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		f.write_str(&self.0)
	}
}

fn fail(error: impl std::fmt::Display) -> EncodeError {
	EncodeError(error.to_string())
}

fn check_size(rgba: &[u8], width: u32, height: u32) -> Result<(), EncodeError> {
	if width == 0 || height == 0 || rgba.len() != width as usize * height as usize * 4 {
		return Err(EncodeError(format!(
			"expected {width}×{height} RGBA pixels, got {} bytes",
			rgba.len()
		)));
	}
	Ok(())
}

/// JPEG with jpegli. Chroma is kept at full resolution from quality 90, where subsampling
/// starts to show on edges and text; below that, 4:2:0 gives smaller files.
pub fn jpeg(rgba: &[u8], width: u32, height: u32, quality: f32) -> Result<Vec<u8>, EncodeError> {
	use zenjpeg::encoder::{ChromaSubsampling, EncoderConfig, PixelLayout, Unstoppable};
	check_size(rgba, width, height)?;
	let subsampling = if quality >= 90.0 {
		ChromaSubsampling::None
	} else {
		ChromaSubsampling::Quarter
	};
	let config = EncoderConfig::ycbcr(quality.clamp(1.0, 100.0), subsampling)
		.progressive(true)
		.auto_optimize(true);
	let mut encoder = config
		.encode_from_bytes(width, height, PixelLayout::Rgbx8Srgb)
		.map_err(fail)?;
	encoder.push_packed(rgba, Unstoppable).map_err(fail)?;
	encoder.finish().map_err(fail)
}

fn is_opaque(rgba: &[u8]) -> bool {
	rgba.chunks_exact(4).all(|pixel| pixel[3] == 255)
}

/// PNG. With `lossy_quality` set (1 to 100), colours are reduced to a palette of at most 256 by
/// libimagequant, with dithering: typically 60 to 80 % smaller and hard to tell apart. Either way
/// oxipng then searches for the smallest lossless encoding of the result.
pub fn png(rgba: &[u8], width: u32, height: u32, lossy_quality: Option<u8>) -> Result<Vec<u8>, EncodeError> {
	check_size(rgba, width, height)?;
	let mut out = Vec::new();
	match lossy_quality {
		None => {
			let opaque = is_opaque(rgba);
			let mut encoder = png::Encoder::new(&mut out, width, height);
			encoder.set_color(if opaque {
				png::ColorType::Rgb
			} else {
				png::ColorType::Rgba
			});
			encoder.set_depth(png::BitDepth::Eight);
			encoder.set_compression(png::Compression::Fast);
			encoder.set_filter(png::Filter::Adaptive);
			let mut writer = encoder.write_header().map_err(fail)?;
			if opaque {
				let rgb: Vec<u8> = rgba.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect();
				writer.write_image_data(&rgb).map_err(fail)?;
			} else {
				writer.write_image_data(rgba).map_err(fail)?;
			}
			writer.finish().map_err(fail)?;
		}
		Some(quality) => {
			let mut attributes = imagequant::new();
			attributes.set_quality(0, quality.min(100)).map_err(fail)?;
			attributes.set_speed(3).map_err(fail)?;
			let pixels: Vec<imagequant::RGBA> = rgba.as_rgba().to_vec();
			let mut image = attributes
				.new_image(pixels, width as usize, height as usize, 0.0)
				.map_err(fail)?;
			let mut result = attributes.quantize(&mut image).map_err(fail)?;
			result.set_dithering_level(1.0).map_err(fail)?;
			let (palette, indices) = result.remapped(&mut image).map_err(fail)?;

			let mut encoder = png::Encoder::new(&mut out, width, height);
			encoder.set_color(png::ColorType::Indexed);
			encoder.set_depth(png::BitDepth::Eight);
			encoder.set_palette(palette.iter().flat_map(|c| [c.r, c.g, c.b]).collect::<Vec<u8>>());
			if palette.iter().any(|c| c.a < 255) {
				encoder.set_trns(palette.iter().map(|c| c.a).collect::<Vec<u8>>());
			}
			encoder.set_compression(png::Compression::Fast);
			encoder.set_filter(png::Filter::NoFilter);
			let mut writer = encoder.write_header().map_err(fail)?;
			writer.write_image_data(&indices).map_err(fail)?;
			writer.finish().map_err(fail)?;
		}
	}
	optimize_png(&out)
}

/// oxipng preset 2: tries the filters and compression strategies that matter most, in about the
/// time the encode itself takes. Higher presets gain little for much longer runs.
fn optimize_png(png: &[u8]) -> Result<Vec<u8>, EncodeError> {
	oxipng::optimize_from_memory(png, &oxipng::Options::from_preset(2)).map_err(fail)
}

/// AVIF with rav1e. `speed` goes from 1 (slowest, smallest) to 10 (fastest).
pub fn avif(rgba: &[u8], width: u32, height: u32, quality: f32, speed: u8) -> Result<Vec<u8>, EncodeError> {
	check_size(rgba, width, height)?;
	let quality = quality.clamp(1.0, 100.0);
	let image = ravif::Img::new(rgba.as_rgba(), width as usize, height as usize);
	let encoded = ravif::Encoder::new()
		.with_quality(quality)
		.with_alpha_quality(quality)
		.with_speed(speed.clamp(1, 10))
		.encode_rgba(image)
		.map_err(fail)?;
	Ok(encoded.avif_file)
}

/// Maps a JPEG-like quality (1 to 100) to a JPEG XL Butteraugli distance, as libjxl's cjxl does.
/// 100 means lossless.
pub fn jxl_distance(quality: f32) -> f32 {
	let q = quality.clamp(1.0, 100.0);
	if q >= 30.0 {
		0.1 + (100.0 - q) * 0.09
	} else {
		53.0 / 3000.0 * q * q - 23.0 / 20.0 * q + 25.0
	}
}

/// JPEG XL. Quality 100 encodes losslessly. `effort` goes from 1 (fastest) to 9.
///
/// jxl-encoder 0.3 writes files that decoders can't read back once the image spans several
/// 256×256 groups, in two cases: lossless with ANS entropy coding, and an alpha channel at lossy
/// effort 3 and above. Lossless therefore uses Huffman coding, and transparent lossy images stay at
/// effort 2. Opaque lossy images, the common case, go through as RGB with every option.
/// `large_tests` guards all of this.
pub fn jxl(rgba: &[u8], width: u32, height: u32, quality: f32, effort: u8) -> Result<Vec<u8>, EncodeError> {
	use jxl_encoder::{LosslessConfig, LossyConfig, PixelLayout};
	check_size(rgba, width, height)?;
	let effort = effort.clamp(1, 9);
	let lossless = quality >= 100.0;

	if is_opaque(rgba) {
		let rgb: Vec<u8> = rgba.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect();
		return if lossless {
			LosslessConfig::new()
				.with_effort(effort)
				.with_ans(false)
				.encode(&rgb, width, height, PixelLayout::Rgb8)
		} else {
			LossyConfig::new(jxl_distance(quality))
				.with_effort(effort)
				.encode(&rgb, width, height, PixelLayout::Rgb8)
		}
		.map_err(fail);
	}

	if lossless {
		LosslessConfig::new()
			.with_effort(effort)
			.with_ans(false)
			.encode(rgba, width, height, PixelLayout::Rgba8)
			.map_err(fail)
	} else {
		LossyConfig::new(jxl_distance(quality))
			.with_effort(effort.min(2))
			.encode(rgba, width, height, PixelLayout::Rgba8)
			.map_err(fail)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A 64×48 gradient with a transparent corner.
	fn sample() -> (Vec<u8>, u32, u32) {
		let (w, h) = (64u32, 48u32);
		let mut rgba = Vec::with_capacity((w * h * 4) as usize);
		for y in 0..h {
			for x in 0..w {
				let alpha = if x < 8 && y < 8 { 0 } else { 255 };
				rgba.extend_from_slice(&[(x * 4) as u8, (y * 5) as u8, 128, alpha]);
			}
		}
		(rgba, w, h)
	}

	#[test]
	fn jpeg_is_valid() {
		let (rgba, w, h) = sample();
		let out = jpeg(&rgba, w, h, 85.0).unwrap();
		assert_eq!(&out[..2], &[0xFF, 0xD8]);
		assert_eq!(&out[out.len() - 2..], &[0xFF, 0xD9]);
	}

	#[test]
	fn png_round_trips_losslessly() {
		let (rgba, w, h) = sample();
		let out = png(&rgba, w, h, None).unwrap();
		let mut reader = png::Decoder::new(std::io::Cursor::new(out)).read_info().unwrap();
		let mut buf = vec![0; reader.output_buffer_size().unwrap()];
		let info = reader.next_frame(&mut buf).unwrap();
		assert_eq!((info.width, info.height), (w, h));
		assert_eq!(&buf[..info.buffer_size()], &rgba[..]);
	}

	#[test]
	fn lossy_png_uses_a_palette_and_keeps_transparency() {
		let (rgba, w, h) = sample();
		let out = png(&rgba, w, h, Some(80)).unwrap();
		let reader = png::Decoder::new(std::io::Cursor::new(out)).read_info().unwrap();
		assert_eq!(reader.info().color_type, png::ColorType::Indexed);
		assert!(reader.info().trns.is_some());
	}

	#[test]
	fn opaque_png_drops_the_alpha_channel() {
		let (mut rgba, w, h) = sample();
		for pixel in rgba.chunks_exact_mut(4) {
			pixel[3] = 255;
		}
		let out = png(&rgba, w, h, None).unwrap();
		let reader = png::Decoder::new(std::io::Cursor::new(out)).read_info().unwrap();
		assert_eq!(reader.info().color_type, png::ColorType::Rgb);
	}

	#[test]
	fn avif_is_valid() {
		let (rgba, w, h) = sample();
		let out = avif(&rgba, w, h, 70.0, 10).unwrap();
		assert_eq!(&out[4..12], b"ftypavif");
	}

	#[test]
	fn jxl_round_trips() {
		let (rgba, w, h) = sample();
		for quality in [80.0, 100.0] {
			let out = jxl(&rgba, w, h, quality, 3).unwrap();
			let decoded = crate::decode::jxl(&out).unwrap();
			assert_eq!((decoded.width, decoded.height), (w, h));
			if quality >= 100.0 {
				assert_eq!(decoded.rgba, rgba, "quality 100 must be lossless");
			}
		}
	}

	#[test]
	fn jxl_distance_matches_cjxl() {
		assert!((jxl_distance(90.0) - 1.0).abs() < 1e-5);
		assert!((jxl_distance(100.0) - 0.1).abs() < 1e-5);
	}

	#[test]
	fn rejects_mismatched_buffers() {
		assert!(jpeg(&[0; 12], 2, 2, 80.0).is_err());
	}
}

#[cfg(test)]
mod large_tests {
	/// Larger than one 256×256 group, which is where multi-group code paths start.
	fn image(transparent: bool) -> (Vec<u8>, u32, u32) {
		let (w, h) = (800u32, 500u32);
		let mut rgba = Vec::with_capacity((w * h * 4) as usize);
		for i in 0..(w * h) {
			let alpha = if transparent && i % w < 100 { 0 } else { 255 };
			rgba.extend_from_slice(&[(i % 251) as u8, (i * 3 % 253) as u8, 90, alpha]);
		}
		(rgba, w, h)
	}

	#[test]
	fn jxl_round_trips_multi_group_images() {
		for transparent in [false, true] {
			let (rgba, w, h) = image(transparent);
			for quality in [85.0, 100.0] {
				for effort in [1, 5, 7] {
					let out = super::jxl(&rgba, w, h, quality, effort).unwrap();
					let decoded = crate::decode::jxl(&out).unwrap_or_else(|e| {
						panic!("transparent {transparent}, quality {quality}, effort {effort}: {e}")
					});
					assert_eq!((decoded.width, decoded.height), (w, h));
					if quality >= 100.0 {
						assert_eq!(decoded.rgba, rgba, "lossless must be exact");
					}
				}
			}
		}
	}
}
