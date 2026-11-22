//! Photo metadata (EXIF): what is shown to the user, and what goes into an export.

use exif::{Context, Exif, Field, In, Reader, Tag, Value};

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Metadata {
	pub make: Option<String>,
	pub model: Option<String>,
	pub lens: Option<String>,
	/// As written by the camera: `2024:07:14 18:32:05`.
	pub taken: Option<String>,
	/// Shutter speed in seconds.
	pub exposure_time: Option<f64>,
	pub f_number: Option<f64>,
	pub iso: Option<u32>,
	/// Millimetres.
	pub focal_length: Option<f64>,
	pub software: Option<String>,
	pub latitude: Option<f64>,
	pub longitude: Option<f64>,
	/// EXIF ready to embed in an export, as a TIFF structure. Orientation is removed because the
	/// exported pixels are already upright; sizes are removed because the export may be resized.
	pub exif_full: Vec<u8>,
	/// The same, without any GPS field.
	pub exif_without_location: Vec<u8>,
}

fn text(exif: &Exif, tag: Tag) -> Option<String> {
	let field = exif.get_field(tag, In::PRIMARY)?;
	let Value::Ascii(ref parts) = field.value else {
		return None;
	};
	let joined = parts
		.iter()
		.map(|p| String::from_utf8_lossy(p).trim_end_matches('\0').trim().to_owned())
		.collect::<Vec<_>>()
		.join(" ");
	(!joined.is_empty()).then_some(joined)
}

fn rational(exif: &Exif, tag: Tag) -> Option<f64> {
	match exif.get_field(tag, In::PRIMARY)?.value {
		Value::Rational(ref v) => v.first().filter(|r| r.denom != 0).map(|r| r.to_f64()),
		Value::SRational(ref v) => v.first().filter(|r| r.denom != 0).map(|r| r.to_f64()),
		_ => None,
	}
}

fn unsigned(exif: &Exif, tag: Tag) -> Option<u32> {
	exif.get_field(tag, In::PRIMARY)?.value.get_uint(0)
}

/// Degrees, minutes and seconds with an N/S or E/W reference, as signed decimal degrees.
fn coordinate(exif: &Exif, tag: Tag, reference: Tag, negative: u8) -> Option<f64> {
	let Value::Rational(ref dms) = exif.get_field(tag, In::PRIMARY)?.value else {
		return None;
	};
	if dms.len() < 3 || dms.iter().any(|r| r.denom == 0) {
		return None;
	}
	let degrees = dms[0].to_f64() + dms[1].to_f64() / 60.0 + dms[2].to_f64() / 3600.0;
	let sign = match exif.get_field(reference, In::PRIMARY)?.value {
		Value::Ascii(ref v) if v.first().and_then(|s| s.first()) == Some(&negative) => -1.0,
		_ => 1.0,
	};
	Some(sign * degrees)
}

/// Tags never copied to an export: pointers are rebuilt by the writer, the rest would be wrong
/// after editing (orientation, sizes) or are opaque vendor blobs.
fn is_dropped(field: &Field) -> bool {
	matches!(
		field.tag,
		Tag::Orientation
			| Tag::ExifIFDPointer
			| Tag::GPSInfoIFDPointer
			| Tag::InteropIFDPointer
			| Tag::MakerNote
			| Tag::ImageWidth
			| Tag::ImageLength
			| Tag::PixelXDimension
			| Tag::PixelYDimension
			| Tag::StripOffsets
			| Tag::StripByteCounts
			| Tag::RowsPerStrip
			| Tag::JPEGInterchangeFormat
			| Tag::JPEGInterchangeFormatLength
	)
}

fn rewrite(exif: &Exif, keep_location: bool) -> Vec<u8> {
	let mut writer = exif::experimental::Writer::new();
	let mut count = 0;
	for field in exif.fields() {
		if field.ifd_num != In::PRIMARY || is_dropped(field) {
			continue;
		}
		if !keep_location && field.tag.context() == Context::Gps {
			continue;
		}
		writer.push_field(field);
		count += 1;
	}
	if count == 0 {
		return Vec::new();
	}
	let mut out = std::io::Cursor::new(Vec::new());
	match writer.write(&mut out, exif.little_endian()) {
		Ok(()) => out.into_inner(),
		Err(_) => Vec::new(),
	}
}

/// Reads EXIF from a JPEG, PNG, WebP, TIFF, HEIF or AVIF file. None when the file has none.
pub fn read(bytes: &[u8]) -> Option<Metadata> {
	let exif = Reader::new()
		.read_from_container(&mut std::io::Cursor::new(bytes))
		.ok()?;
	Some(Metadata {
		make: text(&exif, Tag::Make),
		model: text(&exif, Tag::Model),
		lens: text(&exif, Tag::LensModel),
		taken: text(&exif, Tag::DateTimeOriginal).or_else(|| text(&exif, Tag::DateTime)),
		exposure_time: rational(&exif, Tag::ExposureTime),
		f_number: rational(&exif, Tag::FNumber),
		iso: unsigned(&exif, Tag::PhotographicSensitivity),
		focal_length: rational(&exif, Tag::FocalLength),
		software: text(&exif, Tag::Software),
		latitude: coordinate(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef, b'S'),
		longitude: coordinate(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef, b'W'),
		exif_full: rewrite(&exif, true),
		exif_without_location: rewrite(&exif, false),
	})
}

#[cfg(test)]
mod tests {
	use super::*;
	use exif::{Rational, experimental::Writer};

	/// Builds a JPEG that only holds an EXIF segment: enough for the reader.
	fn jpeg_with_exif(fields: &[Field]) -> Vec<u8> {
		let mut writer = Writer::new();
		for field in fields {
			writer.push_field(field);
		}
		let mut tiff = std::io::Cursor::new(Vec::new());
		writer.write(&mut tiff, false).unwrap();
		let tiff = tiff.into_inner();
		let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE1];
		jpeg.extend_from_slice(&((tiff.len() + 8) as u16).to_be_bytes());
		jpeg.extend_from_slice(b"Exif\0\0");
		jpeg.extend_from_slice(&tiff);
		jpeg.extend_from_slice(&[0xFF, 0xD9]);
		jpeg
	}

	fn field(tag: Tag, value: Value) -> Field {
		Field {
			tag,
			ifd_num: In::PRIMARY,
			value,
		}
	}

	fn sample() -> Vec<u8> {
		let r = |num, denom| Rational { num, denom };
		jpeg_with_exif(&[
			field(Tag::Make, Value::Ascii(vec![b"Fujifilm".to_vec()])),
			field(Tag::Model, Value::Ascii(vec![b"X-T5".to_vec()])),
			field(Tag::Orientation, Value::Short(vec![6])),
			field(Tag::ExposureTime, Value::Rational(vec![r(1, 250)])),
			field(Tag::FNumber, Value::Rational(vec![r(28, 10)])),
			field(Tag::PhotographicSensitivity, Value::Short(vec![400])),
			field(Tag::FocalLength, Value::Rational(vec![r(35, 1)])),
			field(
				Tag::DateTimeOriginal,
				Value::Ascii(vec![b"2026:07:14 18:32:05".to_vec()]),
			),
			field(Tag::GPSLatitudeRef, Value::Ascii(vec![b"N".to_vec()])),
			field(
				Tag::GPSLatitude,
				Value::Rational(vec![r(48, 1), r(51, 1), r(2940, 100)]),
			),
			field(Tag::GPSLongitudeRef, Value::Ascii(vec![b"E".to_vec()])),
			field(
				Tag::GPSLongitude,
				Value::Rational(vec![r(2, 1), r(17, 1), r(4020, 100)]),
			),
		])
	}

	#[test]
	fn reads_camera_details_and_location() {
		let m = read(&sample()).unwrap();
		assert_eq!(m.make.as_deref(), Some("Fujifilm"));
		assert_eq!(m.model.as_deref(), Some("X-T5"));
		assert_eq!(m.exposure_time, Some(0.004));
		assert_eq!(m.f_number, Some(2.8));
		assert_eq!(m.iso, Some(400));
		assert_eq!(m.focal_length, Some(35.0));
		assert_eq!(m.taken.as_deref(), Some("2026:07:14 18:32:05"));
		assert!((m.latitude.unwrap() - 48.8582).abs() < 1e-4);
		assert!((m.longitude.unwrap() - 2.2945).abs() < 1e-4);
	}

	#[test]
	fn rewritten_exif_drops_orientation_and_optionally_location() {
		let m = read(&sample()).unwrap();
		let wrap = |tiff: &[u8]| {
			let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE1];
			jpeg.extend_from_slice(&((tiff.len() + 8) as u16).to_be_bytes());
			jpeg.extend_from_slice(b"Exif\0\0");
			jpeg.extend_from_slice(tiff);
			jpeg
		};
		let reread = |tiff: &[u8]| {
			Reader::new()
				.read_from_container(&mut std::io::Cursor::new(wrap(tiff)))
				.unwrap()
		};

		let full = reread(&m.exif_full);
		assert!(full.get_field(Tag::Orientation, In::PRIMARY).is_none());
		assert!(full.get_field(Tag::GPSLatitude, In::PRIMARY).is_some());
		assert!(full.get_field(Tag::Make, In::PRIMARY).is_some());

		let private = reread(&m.exif_without_location);
		assert!(private.get_field(Tag::GPSLatitude, In::PRIMARY).is_none());
		assert!(private.get_field(Tag::Model, In::PRIMARY).is_some());
	}

	#[test]
	fn files_without_exif_have_no_metadata() {
		assert_eq!(read(&[0xFF, 0xD8, 0xFF, 0xD9]), None);
		assert_eq!(read(b"not an image"), None);
	}
}
