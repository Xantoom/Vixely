//! VobSub, the image subtitles of DVDs (`S_VOBSUB` Matroska tracks, `.idx`/`.sub` files).
//!
//! Each line is a subpicture unit: two interlaced fields of 2-bit pixels, run-length encoded,
//! then control sequences that say when it shows and hides, which 4 of the 16 palette colours
//! its pixel values take, how opaque each is, and where it goes. The palette and the video size
//! come from the `.idx` text, which Matroska keeps as the track's setup data.
//!
//! Lines are turned into PGS pictures, so they are shown, moved and written like Blu-ray ones.

use crate::pgs::{Picture, picture_from_rgba};

/// Palette and video size from the `.idx` text.
#[derive(Clone, Debug)]
pub struct Setup {
	pub palette: [[u8; 3]; 16],
	pub width: u16,
	pub height: u16,
}

impl Setup {
	pub fn parse(idx: &[u8]) -> Setup {
		let mut setup = Setup {
			palette: [[0; 3]; 16],
			width: 720,
			height: 576,
		};
		for line in String::from_utf8_lossy(idx).lines() {
			let Some((key, value)) = line.split_once(':') else {
				continue;
			};
			match key.trim().to_ascii_lowercase().as_str() {
				"size" => {
					if let Some((w, h)) = value.trim().split_once('x')
						&& let (Ok(w), Ok(h)) = (w.trim().parse(), h.trim().parse())
					{
						setup.width = w;
						setup.height = h;
					}
				}
				"palette" => {
					for (index, color) in value.split(',').take(16).enumerate() {
						if let Ok(rgb) = u32::from_str_radix(color.trim(), 16) {
							setup.palette[index] = [(rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8];
						}
					}
				}
				_ => {}
			}
		}
		setup
	}
}

/// Reads a subpicture unit's pixels a nibble at a time.
struct Nibbles<'a> {
	data: &'a [u8],
	/// Position in nibbles.
	at: usize,
}

impl Nibbles<'_> {
	fn next(&mut self) -> u16 {
		let byte = self.data.get(self.at / 2).copied().unwrap_or(0);
		self.at += 1;
		u16::from(if self.at % 2 == 1 { byte >> 4 } else { byte & 0x0F })
	}

	fn align(&mut self) {
		self.at += self.at % 2;
	}
}

/// Decodes one field (every other line, from `first`) into 2-bit values.
fn decode_field(data: &[u8], offset: usize, width: usize, height: usize, first: usize, out: &mut [u8]) {
	let mut nibbles = Nibbles { data, at: offset * 2 };
	let mut y = first;
	while y < height && nibbles.at / 2 < data.len() {
		let mut x = 0;
		while x < width {
			let mut value = nibbles.next();
			if value < 0x4 {
				value = (value << 4) | nibbles.next();
				if value < 0x10 {
					value = (value << 4) | nibbles.next();
					if value < 0x40 {
						value = (value << 4) | nibbles.next();
					}
				}
			}
			let color = (value & 3) as u8;
			let run = match (value >> 2) as usize {
				// Zero: to the end of the line.
				0 => width - x,
				run => run.min(width - x),
			};
			out[y * width + x..y * width + x + run].fill(color);
			x += run;
		}
		nibbles.align();
		y += 2;
	}
}

/// What a subpicture unit shows: its times from the unit's start, in milliseconds, and pixels.
struct Unit {
	start: Option<f64>,
	stop: Option<f64>,
	forced: bool,
	x: u16,
	y: u16,
	width: usize,
	rgba: Vec<u8>,
}

/// A control sequence's delay is in units of 1024 ticks of the 90 kHz clock.
fn delay_ms(units: u16) -> f64 {
	f64::from(units) * 1024.0 / 90.0
}

fn be16(data: &[u8], at: usize) -> Option<u16> {
	Some(u16::from_be_bytes([*data.get(at)?, *data.get(at + 1)?]))
}

fn read_unit(data: &[u8], setup: &Setup) -> Option<Unit> {
	let size = usize::from(be16(data, 0)?).min(data.len());
	let data = &data[..size];
	let mut sequence = usize::from(be16(data, 2)?);
	let mut unit = Unit {
		start: None,
		stop: None,
		forced: false,
		x: 0,
		y: 0,
		width: 0,
		rgba: Vec::new(),
	};
	let (mut colors, mut alphas) = ([0u8; 4], [0u8, 15, 15, 15]);
	let mut area = None;
	let mut fields = None;
	// Each sequence points at the next; the last points at itself.
	for _ in 0..64 {
		let delay = be16(data, sequence)?;
		let date = delay_ms(delay);
		let next = usize::from(be16(data, sequence + 2)?);
		let mut at = sequence + 4;
		while let Some(&command) = data.get(at) {
			at += 1;
			match command {
				0x00 => {
					unit.forced = true;
					unit.start.get_or_insert(date);
				}
				0x01 => {
					unit.start.get_or_insert(date);
				}
				// The largest delay is written by encoders that don't know when the line ends.
				0x02 if delay != u16::MAX => unit.stop = Some(date),
				0x02 => {}
				0x03 => {
					let (a, b) = (*data.get(at)?, *data.get(at + 1)?);
					colors = [b & 0x0F, b >> 4, a & 0x0F, a >> 4];
					at += 2;
				}
				0x04 => {
					let (a, b) = (*data.get(at)?, *data.get(at + 1)?);
					alphas = [b & 0x0F, b >> 4, a & 0x0F, a >> 4];
					at += 2;
				}
				0x05 => {
					let b = data.get(at..at + 6)?;
					let x1 = (u16::from(b[0]) << 4) | u16::from(b[1] >> 4);
					let x2 = (u16::from(b[1] & 0x0F) << 8) | u16::from(b[2]);
					let y1 = (u16::from(b[3]) << 4) | u16::from(b[4] >> 4);
					let y2 = (u16::from(b[4] & 0x0F) << 8) | u16::from(b[5]);
					area = Some((x1, y1, x2, y2));
					at += 6;
				}
				0x06 => {
					fields = Some((usize::from(be16(data, at)?), usize::from(be16(data, at + 2)?)));
					at += 4;
				}
				// Colour and contrast changes within the picture: its size says how far to skip.
				0x07 => at += usize::from(be16(data, at)?),
				_ => break,
			}
		}
		if next <= sequence || next >= data.len() {
			break;
		}
		sequence = next;
	}
	let (x1, y1, x2, y2) = area?;
	let (top, bottom) = fields?;
	if x2 < x1 || y2 < y1 {
		return None;
	}
	let (width, height) = (usize::from(x2 - x1) + 1, usize::from(y2 - y1) + 1);
	let mut values = vec![0u8; width * height];
	decode_field(data, top, width, height, 0, &mut values);
	decode_field(data, bottom, width, height, 1, &mut values);
	let look: Vec<[u8; 4]> = (0..4)
		.map(|v| {
			let [r, g, b] = setup.palette[usize::from(colors[v])];
			[r, g, b, alphas[v] * 17]
		})
		.collect();
	unit.rgba = values.iter().flat_map(|&v| look[usize::from(v)]).collect();
	(unit.x, unit.y, unit.width) = (x1, y1, width);
	Some(unit)
}

/// The lines of a VobSub track given a few blocks at a time, as PGS pictures.
pub struct Stream {
	setup: Setup,
	pictures: Vec<Picture>,
}

impl Stream {
	pub fn new(idx: &[u8]) -> Stream {
		Stream {
			setup: Setup::parse(idx),
			pictures: Vec::new(),
		}
	}

	/// A block shown at `time`; `duration` ends it when the unit doesn't say.
	pub fn push(&mut self, time: f64, duration: Option<f64>, data: &[u8]) {
		let Some(unit) = read_unit(data, &self.setup) else {
			return;
		};
		let start = time + unit.start.unwrap_or(0.0);
		// A line without an end lasts until the next one.
		if let Some(previous) = self.pictures.last_mut()
			&& previous.end_ms.is_none_or(|end| end > start)
		{
			previous.end_ms = Some(start);
		}
		let end = unit
			.stop
			.map(|stop| time + stop)
			// ffmpeg writes the largest 32-bit duration for lines that last until the next.
			.or(duration.filter(|&d| d < f64::from(u32::MAX)).map(|d| time + d))
			.filter(|&end| end > start);
		let video = (self.setup.width, self.setup.height);
		if let Some(picture) = picture_from_rgba(start, end, video, unit.x, unit.y, unit.width, &unit.rgba, unit.forced)
		{
			self.pictures.push(picture);
		}
	}

	/// As `pgs::BlockStream::take`.
	pub fn take(&mut self, last: bool) -> Vec<Picture> {
		let keep = usize::from(!last).min(self.pictures.len());
		self.pictures.drain(..self.pictures.len() - keep).collect()
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::pgs::decode;

	/// Run-length codes of a line: `(run, value)`, a run of 0 filling the line.
	fn line(runs: &[(usize, u8)]) -> Vec<u8> {
		let mut nibbles = Vec::new();
		for &(run, value) in runs {
			let code = (run << 2) as u16 | u16::from(value);
			let count = match run {
				0 => 4,
				1..=3 => 1,
				4..=15 => 2,
				16..=63 => 3,
				_ => 4,
			};
			for k in (0..count).rev() {
				nibbles.push(((code >> (k * 4)) & 0xF) as u8);
			}
		}
		if nibbles.len() % 2 == 1 {
			nibbles.push(0);
		}
		nibbles.chunks(2).map(|pair| (pair[0] << 4) | pair[1]).collect()
	}

	/// A 4×2 unit at (10, 20): the top line blue then red, the bottom line all transparent; shown
	/// from the start of the block, hidden 1024 × 90 kHz ticks × 44 later (about 500 ms).
	fn unit() -> Vec<u8> {
		let top = line(&[(2, 1), (0, 2)]);
		let bottom = line(&[(0, 0)]);
		let pixels_at = 4;
		let top_at = pixels_at;
		let bottom_at = top_at + top.len();
		let sequences_at = bottom_at + bottom.len();
		let mut out = vec![0, 0, (sequences_at >> 8) as u8, sequences_at as u8];
		out.extend(&top);
		out.extend(&bottom);
		let second = sequences_at + 4 + 1 + 3 + 3 + 7 + 5 + 1;
		out.extend([0, 0, (second >> 8) as u8, second as u8]);
		out.push(0x01);
		// Colours: value 1 → palette 2 (blue), value 2 → palette 1 (red).
		out.extend([0x3, 0x01, 0x20]);
		// Value 0 transparent, the others opaque.
		out.extend([0x4, 0xFF, 0xF0]);
		out.extend([0x5, 0x00, 0xA0, 0x0D, 0x01, 0x40, 0x15]);
		out.extend([0x6, 0, top_at as u8, 0, bottom_at as u8]);
		out.push(0xFF);
		out.extend([0, 44, (second >> 8) as u8, second as u8, 0x02, 0xFF]);
		let size = out.len();
		out[0] = (size >> 8) as u8;
		out[1] = size as u8;
		out
	}

	const IDX: &[u8] = b"# VobSub index file, v7\nsize: 720x480\npalette: 000000, ff0000, 0000ff, ffffff, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000\n";

	#[test]
	fn reads_the_setup() {
		let setup = Setup::parse(IDX);
		assert_eq!((setup.width, setup.height), (720, 480));
		assert_eq!(setup.palette[1], [255, 0, 0]);
		assert_eq!(setup.palette[3], [255, 255, 255]);
	}

	#[test]
	fn turns_units_into_pictures() {
		let mut stream = Stream::new(IDX);
		stream.push(1000.0, None, &unit());
		stream.push(5000.0, None, &unit());
		let pictures = stream.take(true);
		assert_eq!(pictures.len(), 2);
		let first = &pictures[0];
		assert_eq!((first.start_ms, first.end_ms.map(f64::round)), (1000.0, Some(1501.0)));
		assert_eq!((first.video_width, first.video_height), (720, 480));
		// Only the top line shows: the picture is cut to it.
		assert_eq!(
			(first.rect.x, first.rect.y, first.rect.width, first.rect.height),
			(10, 20, 4, 1)
		);
		let (_, pixels) = decode(&first.set).unwrap();
		let near = |a: &[u8], b: [u8; 4]| a.iter().zip(b).all(|(x, y)| (*x as i32 - y as i32).abs() <= 3);
		assert!(near(&pixels[0..4], [0, 0, 255, 255]), "{:?}", &pixels[0..4]);
		assert!(near(&pixels[8..12], [255, 0, 0, 255]), "{:?}", &pixels[8..12]);
	}
}
