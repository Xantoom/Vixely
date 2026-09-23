//! File type detection from magic bytes.
//!
//! Browsers derive `File.type` from the extension, which is often missing or wrong
//! (`.mkv` and `.srt` are usually empty, `.heic` depends on the OS). Reading the
//! signature tells us which editor should open the file.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaKind {
	Video,
	Image,
	/// Animated images: GIF, APNG and animated WebP all open in the GIF editor.
	Gif,
	Audio,
	Subtitles,
}

impl MediaKind {
	pub fn as_str(self) -> &'static str {
		match self {
			Self::Video => "video",
			Self::Image => "image",
			Self::Gif => "gif",
			Self::Audio => "audio",
			Self::Subtitles => "subtitles",
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Sniffed {
	pub kind: MediaKind,
	pub format: &'static str,
}

const fn found(kind: MediaKind, format: &'static str) -> Option<Sniffed> {
	Some(Sniffed { kind, format })
}

pub fn sniff_bytes(b: &[u8]) -> Option<Sniffed> {
	use MediaKind::*;

	if b.starts_with(b"\x89PNG\r\n\x1a\n") {
		return if png_is_animated(b) {
			found(Gif, "apng")
		} else {
			found(Image, "png")
		};
	}
	if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
		return found(Image, "jpeg");
	}
	if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
		return found(Gif, "gif");
	}
	if b.len() >= 12 && &b[0..4] == b"RIFF" {
		match &b[8..12] {
			b"WEBP" => {
				return if webp_is_animated(b) {
					found(Gif, "webp")
				} else {
					found(Image, "webp")
				};
			}
			b"WAVE" => return found(Audio, "wav"),
			b"AVI " => return found(Video, "avi"),
			_ => {}
		}
	}
	if b.len() >= 12 && &b[4..8] == b"ftyp" {
		return Some(sniff_iso_bmff(&b[8..12]));
	}
	if b.starts_with(&[0xFF, 0x0A]) || b.starts_with(b"\x00\x00\x00\x0CJXL \x0D\x0A\x87\x0A") {
		return found(Image, "jxl");
	}
	if b.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
		return if contains(&b[..b.len().min(64)], b"webm") {
			found(Video, "webm")
		} else {
			found(Video, "mkv")
		};
	}
	if b.starts_with(b"OggS") {
		return if contains(b, b"OpusHead") {
			found(Audio, "opus")
		} else if contains(b, b"\x80theora") {
			found(Video, "ogv")
		} else {
			found(Audio, "ogg")
		};
	}
	if b.starts_with(b"fLaC") {
		return found(Audio, "flac");
	}
	if b.starts_with(b"ID3") {
		return found(Audio, "mp3");
	}
	if b.len() >= 2 && b[0] == 0xFF && b[1] & 0xE0 == 0xE0 {
		// MPEG audio frame sync. Layer bits `00` mean ADTS (AAC), anything else is MP1/2/3.
		return if b[1] & 0x06 == 0 {
			found(Audio, "aac")
		} else {
			found(Audio, "mp3")
		};
	}
	if b.len() > 188 && b[0] == 0x47 && b[188] == 0x47 {
		return found(Video, "ts");
	}
	if b.starts_with(b"FLV") {
		return found(Video, "flv");
	}
	if b.starts_with(&[0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11]) {
		return found(Video, "wmv");
	}
	if b.starts_with(&[0x00, 0x00, 0x01, 0xBA]) {
		return found(Video, "mpeg");
	}
	if b.starts_with(b"BM") && b.len() >= 14 {
		return found(Image, "bmp");
	}
	if b.starts_with(b"II*\x00") || b.starts_with(b"MM\x00*") {
		return found(Image, "tiff");
	}
	if b.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
		return found(Image, "ico");
	}
	if b.starts_with(b"PG") && b.len() >= 13 {
		return found(Subtitles, "pgs");
	}
	sniff_text_subtitles(b)
}

fn sniff_iso_bmff(brand: &[u8]) -> Sniffed {
	use MediaKind::*;
	match brand {
		b"avif" | b"avis" => Sniffed {
			kind: Image,
			format: "avif",
		},
		b"heic" | b"heix" | b"heim" | b"heis" | b"hevc" | b"mif1" | b"msf1" => Sniffed {
			kind: Image,
			format: "heic",
		},
		b"M4A " | b"M4B " | b"M4P " => Sniffed {
			kind: Audio,
			format: "m4a",
		},
		b"qt  " => Sniffed {
			kind: Video,
			format: "mov",
		},
		_ => Sniffed {
			kind: Video,
			format: "mp4",
		},
	}
}

/// An APNG declares an `acTL` chunk before its first `IDAT`.
fn png_is_animated(b: &[u8]) -> bool {
	let mut pos = 8;
	while pos + 8 <= b.len() {
		let len = u32::from_be_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]) as usize;
		match &b[pos + 4..pos + 8] {
			b"acTL" => return true,
			b"IDAT" => return false,
			_ => pos = pos.saturating_add(12).saturating_add(len),
		}
	}
	false
}

/// Extended WebP files (`VP8X`) carry an animation flag in their first flags byte.
fn webp_is_animated(b: &[u8]) -> bool {
	b.len() > 20 && &b[12..16] == b"VP8X" && b[20] & 0x02 != 0
}

fn sniff_text_subtitles(b: &[u8]) -> Option<Sniffed> {
	let text = String::from_utf8_lossy(b);
	let text = text.trim_start_matches('\u{feff}').trim_start();
	if text.starts_with("WEBVTT") {
		return found(MediaKind::Subtitles, "vtt");
	}
	if text.contains("[Script Info]") {
		return found(MediaKind::Subtitles, "ass");
	}
	let mut lines = text.lines().map(str::trim).filter(|line| !line.is_empty());
	let first = lines.next()?;
	let second = lines.next()?;
	if first.chars().all(|c| c.is_ascii_digit()) && is_srt_timing(second) {
		return found(MediaKind::Subtitles, "srt");
	}
	None
}

/// Matches `00:00:01,000 --> 00:00:04,000`, tolerating a dot as the decimal separator.
fn is_srt_timing(line: &str) -> bool {
	let Some((start, end)) = line.split_once("-->") else {
		return false;
	};
	is_srt_time(start.trim()) && is_srt_time(end.trim().split_whitespace().next().unwrap_or(""))
}

fn is_srt_time(t: &str) -> bool {
	let b = t.as_bytes();
	b.len() == 12
		&& b.iter().enumerate().all(|(i, &c)| match i {
			2 | 5 => c == b':',
			8 => c == b',' || c == b'.',
			_ => c.is_ascii_digit(),
		})
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
	haystack.windows(needle.len()).any(|w| w == needle)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn kind_format(b: &[u8]) -> Option<(&'static str, &'static str)> {
		sniff_bytes(b).map(|s| (s.kind.as_str(), s.format))
	}

	fn png_with(chunk: &[u8; 4]) -> Vec<u8> {
		let mut b = b"\x89PNG\r\n\x1a\n".to_vec();
		b.extend_from_slice(&[0, 0, 0, 13]);
		b.extend_from_slice(b"IHDR");
		b.extend_from_slice(&[0; 13 + 4]);
		b.extend_from_slice(&[0, 0, 0, 8]);
		b.extend_from_slice(chunk);
		b.extend_from_slice(&[0; 8 + 4]);
		b
	}

	#[test]
	fn images() {
		assert_eq!(kind_format(&png_with(b"IDAT")), Some(("image", "png")));
		assert_eq!(kind_format(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0]), Some(("image", "jpeg")));
		assert_eq!(
			kind_format(b"\x00\x00\x00\x1cftypavif\x00\x00\x00\x00"),
			Some(("image", "avif"))
		);
		assert_eq!(
			kind_format(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"),
			Some(("image", "heic"))
		);
		assert_eq!(kind_format(&[0xFF, 0x0A, 0xFA, 0x7F]), Some(("image", "jxl")));
		assert_eq!(
			kind_format(b"RIFF\x24\x00\x00\x00WEBPVP8 \x00\x00\x00\x00\x00"),
			Some(("image", "webp"))
		);
	}

	#[test]
	fn animated_images_open_in_the_gif_editor() {
		assert_eq!(kind_format(b"GIF89a\x01\x00\x01\x00"), Some(("gif", "gif")));
		assert_eq!(kind_format(&png_with(b"acTL")), Some(("gif", "apng")));
		assert_eq!(
			kind_format(b"RIFF\x24\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x02\x00\x00\x00"),
			Some(("gif", "webp"))
		);
	}

	#[test]
	fn video_and_audio() {
		assert_eq!(
			kind_format(b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00"),
			Some(("video", "mp4"))
		);
		assert_eq!(
			kind_format(b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00"),
			Some(("video", "mov"))
		);
		assert_eq!(
			kind_format(b"\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00"),
			Some(("audio", "m4a"))
		);
		assert_eq!(
			kind_format(b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\x82\x84webm"),
			Some(("video", "webm"))
		);
		assert_eq!(
			kind_format(b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\x82\x88matroska"),
			Some(("video", "mkv"))
		);
		assert_eq!(kind_format(b"ID3\x04\x00\x00\x00\x00\x00\x00"), Some(("audio", "mp3")));
		assert_eq!(kind_format(&[0xFF, 0xFB, 0x90, 0x00]), Some(("audio", "mp3")));
		assert_eq!(kind_format(&[0xFF, 0xF1, 0x50, 0x80]), Some(("audio", "aac")));
		assert_eq!(kind_format(b"fLaC\x00\x00\x00\x22"), Some(("audio", "flac")));
		assert_eq!(kind_format(b"RIFF\x24\x00\x00\x00WAVEfmt "), Some(("audio", "wav")));
		assert_eq!(
			kind_format(b"OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00OpusHead"),
			Some(("audio", "opus"))
		);
		assert_eq!(kind_format(b"RIFF\x24\x00\x00\x00AVI LIST"), Some(("video", "avi")));
	}

	#[test]
	fn subtitles() {
		assert_eq!(
			kind_format(b"WEBVTT\n\n00:01.000 --> 00:04.000\nHi"),
			Some(("subtitles", "vtt"))
		);
		assert_eq!(
			kind_format("\u{feff}1\r\n00:00:01,000 --> 00:00:04,000\r\nHi".as_bytes()),
			Some(("subtitles", "srt"))
		);
		assert_eq!(kind_format(b"[Script Info]\nTitle: x\n"), Some(("subtitles", "ass")));
		assert_eq!(kind_format(b"hello world\nnot a subtitle"), None);
	}

	#[test]
	fn empty_or_short_input_is_unknown() {
		assert_eq!(kind_format(b""), None);
		assert_eq!(kind_format(b"R"), None);
	}
}
