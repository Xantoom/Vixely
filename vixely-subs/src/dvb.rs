//! DVB subtitles (EN 300 743), the image subtitles of European TV broadcasts (`S_DVBSUB`
//! Matroska tracks).
//!
//! A display set is a series of segments: the page (which regions show where, and for how long),
//! regions (their size, colour depth and palette, and which objects they hold), palettes (CLUTs)
//! and objects (run-length encoded pixels, in two interlaced fields). Regions, palettes and
//! objects stay from one set to the next until a set starts anew, so a set may change only part
//! of the page.
//!
//! Each page shown is turned into a PGS picture, so it is shown, moved and written like a
//! Blu-ray line.

use std::collections::HashMap;

use crate::pgs::{Picture, picture_from_rgba};

const PAGE: u8 = 0x10;
const REGION: u8 = 0x11;
const CLUT: u8 = 0x12;
const OBJECT: u8 = 0x13;
const DISPLAY: u8 = 0x14;
const END: u8 = 0x80;

type Rgba = [u8; 4];

/// ITU-R BT.601 limited range, as broadcasts write palettes; `t` is transparency.
fn rgba(y: u8, cr: u8, cb: u8, t: u8) -> Rgba {
	if y == 0 {
		return [0; 4];
	}
	let y = 1.164 * (f32::from(y) - 16.0);
	let (cr, cb) = (f32::from(cr) - 128.0, f32::from(cb) - 128.0);
	let clamp = |v: f32| v.round().clamp(0.0, 255.0) as u8;
	[
		clamp(y + 1.596 * cr),
		clamp(y - 0.813 * cr - 0.391 * cb),
		clamp(y + 2.018 * cb),
		255 - t,
	]
}

/// A palette: its 2-bit, 4-bit and 8-bit entries, starting from the standard's defaults.
#[derive(Clone)]
struct Clut {
	two: [Rgba; 4],
	four: [Rgba; 16],
	eight: Box<[Rgba; 256]>,
}

impl Default for Clut {
	fn default() -> Self {
		let full = |bit: bool, value: u8| if bit { value } else { 0 };
		let mut four = [[0u8; 4]; 16];
		for (i, entry) in four.iter_mut().enumerate().skip(1) {
			let level = if i < 8 { 255 } else { 127 };
			*entry = [
				full(i & 1 != 0, level),
				full(i & 2 != 0, level),
				full(i & 4 != 0, level),
				255,
			];
		}
		let mut eight = Box::new([[0u8; 4]; 256]);
		for (i, entry) in eight.iter_mut().enumerate().skip(1) {
			let bit = |mask: usize, value: u8| full(i & mask != 0, value);
			*entry = if i < 8 {
				[bit(1, 255), bit(2, 255), bit(4, 255), 63]
			} else {
				match i & 0x88 {
					0x00 => [
						bit(1, 85) + bit(0x10, 170),
						bit(2, 85) + bit(0x20, 170),
						bit(4, 85) + bit(0x40, 170),
						255,
					],
					0x08 => [
						bit(1, 85) + bit(0x10, 170),
						bit(2, 85) + bit(0x20, 170),
						bit(4, 85) + bit(0x40, 170),
						127,
					],
					0x80 => [
						127 + bit(1, 43) + bit(0x10, 85),
						127 + bit(2, 43) + bit(0x20, 85),
						127 + bit(4, 43) + bit(0x40, 85),
						255,
					],
					_ => [
						bit(1, 43) + bit(0x10, 85),
						bit(2, 43) + bit(0x20, 85),
						bit(4, 43) + bit(0x40, 85),
						255,
					],
				}
			};
		}
		Clut {
			two: [[0, 0, 0, 0], [255, 255, 255, 255], [0, 0, 0, 255], [127, 127, 127, 255]],
			four,
			eight,
		}
	}
}

/// Where an object is drawn: in which region, at which place.
#[derive(Clone, Copy)]
struct Placement {
	region: u8,
	x: usize,
	y: usize,
}

struct Region {
	width: usize,
	height: usize,
	/// Bits per pixel: 2, 4 or 8.
	depth: u8,
	clut: u8,
	/// Pixel values, one byte each.
	pixels: Vec<u8>,
}

/// A page region on screen.
#[derive(Clone, Copy)]
struct Shown {
	region: u8,
	x: usize,
	y: usize,
}

/// Reads bits from the most significant down.
struct Bits<'a> {
	data: &'a [u8],
	at: usize,
}

impl Bits<'_> {
	fn read(&mut self, count: usize) -> usize {
		let mut value = 0;
		for _ in 0..count {
			let byte = self.data.get(self.at / 8).copied().unwrap_or(0);
			value = (value << 1) | usize::from((byte >> (7 - self.at % 8)) & 1);
			self.at += 1;
		}
		value
	}

	fn align(&mut self) {
		self.at = self.at.div_ceil(8) * 8;
	}

	fn done(&self) -> bool {
		self.at / 8 >= self.data.len()
	}
}

/// Runs of `(length, code)` of a 2-bit pixel string, until its end or until they fill `width`
/// pixels: some encoders leave out the end code of a full line, as decoders stop there.
fn runs_2(bits: &mut Bits, width: usize) -> Vec<(usize, u8)> {
	let (mut runs, mut drawn) = (Vec::new(), 0);
	while !bits.done() && drawn < width {
		let code = bits.read(2) as u8;
		if code != 0 {
			runs.push((1, code));
		} else if bits.read(1) == 1 {
			let run = bits.read(3) + 3;
			runs.push((run, bits.read(2) as u8));
		} else if bits.read(1) == 1 {
			runs.push((1, 0));
		} else {
			match bits.read(2) {
				0 => break,
				1 => runs.push((2, 0)),
				2 => {
					let run = bits.read(4) + 12;
					runs.push((run, bits.read(2) as u8));
				}
				_ => {
					let run = bits.read(8) + 29;
					runs.push((run, bits.read(2) as u8));
				}
			}
		}
		// Every step that does not end the string adds one run.
		drawn += runs.last().map_or(0, |&(run, _)| run);
	}
	bits.align();
	runs
}

fn runs_4(bits: &mut Bits, width: usize) -> Vec<(usize, u8)> {
	let (mut runs, mut drawn) = (Vec::new(), 0);
	while !bits.done() && drawn < width {
		let code = bits.read(4) as u8;
		if code != 0 {
			runs.push((1, code));
		} else if bits.read(1) == 0 {
			let run = bits.read(3);
			if run == 0 {
				break;
			}
			runs.push((run + 2, 0));
		} else if bits.read(1) == 0 {
			let run = bits.read(2) + 4;
			runs.push((run, bits.read(4) as u8));
		} else {
			match bits.read(2) {
				0 => runs.push((1, 0)),
				1 => runs.push((2, 0)),
				2 => {
					let run = bits.read(4) + 9;
					runs.push((run, bits.read(4) as u8));
				}
				_ => {
					let run = bits.read(8) + 25;
					runs.push((run, bits.read(4) as u8));
				}
			}
		}
		// Every step that does not end the string adds one run.
		drawn += runs.last().map_or(0, |&(run, _)| run);
	}
	bits.align();
	runs
}

fn runs_8(bits: &mut Bits, width: usize) -> Vec<(usize, u8)> {
	let (mut runs, mut drawn) = (Vec::new(), 0);
	while !bits.done() && drawn < width {
		let code = bits.read(8) as u8;
		if code != 0 {
			runs.push((1, code));
		} else if bits.read(1) == 0 {
			let run = bits.read(7);
			if run == 0 {
				break;
			}
			runs.push((run, 0));
		} else {
			let run = bits.read(7);
			runs.push((run, bits.read(8) as u8));
		}
		drawn += runs.last().map_or(0, |&(run, _)| run);
	}
	runs
}

/// Decoded state of a track: what the page shows, and what later sets may reuse.
#[derive(Default)]
pub struct Stream {
	display: (u16, u16),
	/// The page's regions, and how long it shows, in seconds.
	shown: Vec<Shown>,
	timeout: f64,
	regions: HashMap<u8, Region>,
	cluts: HashMap<u8, Clut>,
	placements: HashMap<u16, Vec<Placement>>,
	/// The page as the set being read builds it; shown at its end.
	pending: bool,
	pictures: Vec<Picture>,
}

impl Stream {
	pub fn new() -> Stream {
		Stream {
			display: (720, 576),
			..Default::default()
		}
	}

	/// A block shown at `time`, holding a display set or part of one.
	pub fn push(&mut self, time: f64, data: &[u8]) {
		// Transport stream payloads start with a data identifier and a stream id.
		let mut at = if data.starts_with(&[0x20, 0x00]) { 2 } else { 0 };
		while data.get(at) == Some(&0x0F) {
			let Some(header) = data.get(at + 1..at + 6) else { break };
			let kind = header[0];
			let length = usize::from(u16::from_be_bytes([header[3], header[4]]));
			let Some(payload) = data.get(at + 6..at + 6 + length) else {
				break;
			};
			at += 6 + length;
			match kind {
				PAGE => self.page(payload),
				REGION => self.region(payload),
				CLUT => self.clut(payload),
				OBJECT => self.object(payload),
				DISPLAY => self.display_definition(payload),
				END => self.show(time),
				_ => {}
			}
		}
		// Some muxers leave out the end segment: a block is a whole set.
		if self.pending {
			self.show(time);
		}
	}

	fn page(&mut self, data: &[u8]) {
		let (Some(&timeout), Some(&flags)) = (data.first(), data.get(1)) else {
			return;
		};
		// A mode change starts anew: nothing from before is kept.
		if (flags >> 2) & 3 == 2 {
			self.regions.clear();
			self.cluts.clear();
			self.placements.clear();
		}
		self.timeout = f64::from(timeout);
		self.shown = data[2..]
			.chunks_exact(6)
			.map(|entry| Shown {
				region: entry[0],
				x: usize::from(u16::from_be_bytes([entry[2], entry[3]])),
				y: usize::from(u16::from_be_bytes([entry[4], entry[5]])),
			})
			.collect();
		self.pending = true;
	}

	fn region(&mut self, data: &[u8]) {
		let Some(head) = data.get(..10) else { return };
		let id = head[0];
		let fill = head[1] & 0x08 != 0;
		let width = usize::from(u16::from_be_bytes([head[2], head[3]]));
		let height = usize::from(u16::from_be_bytes([head[4], head[5]]));
		let depth = match (head[6] >> 2) & 7 {
			1 => 2,
			2 => 4,
			_ => 8,
		};
		let background = match depth {
			2 => (head[9] >> 2) & 3,
			4 => head[9] >> 4,
			_ => head[8],
		};
		let region = self.regions.entry(id).or_insert_with(|| Region {
			width,
			height,
			depth,
			clut: head[7],
			pixels: vec![background; width * height],
		});
		if region.width != width || region.height != height {
			*region = Region {
				width,
				height,
				depth,
				clut: head[7],
				pixels: vec![background; width * height],
			};
		}
		region.depth = depth;
		region.clut = head[7];
		if fill {
			region.pixels.fill(background);
		}
		for placements in self.placements.values_mut() {
			placements.retain(|placement| placement.region != id);
		}
		let mut at = 10;
		while let Some(entry) = data.get(at..at + 6) {
			let object = u16::from_be_bytes([entry[0], entry[1]]);
			let kind = entry[2] >> 6;
			let x = usize::from(u16::from_be_bytes([entry[2], entry[3]]) & 0x0FFF);
			let y = usize::from(u16::from_be_bytes([entry[4], entry[5]]) & 0x0FFF);
			at += if kind == 1 || kind == 2 { 8 } else { 6 };
			self.placements
				.entry(object)
				.or_default()
				.push(Placement { region: id, x, y });
		}
	}

	fn clut(&mut self, data: &[u8]) {
		let Some(&id) = data.first() else { return };
		let clut = self.cluts.entry(id).or_default();
		let mut at = 2;
		while let Some(&entry) = data.get(at) {
			let Some(&flags) = data.get(at + 1) else { break };
			let color = if flags & 1 != 0 {
				let Some(v) = data.get(at + 2..at + 6) else { break };
				at += 6;
				rgba(v[0], v[1], v[2], v[3])
			} else {
				let Some(v) = data.get(at + 2..at + 4) else { break };
				at += 4;
				let packed = u16::from_be_bytes([v[0], v[1]]);
				let y = ((packed >> 10) as u8) << 2;
				let cr = (((packed >> 6) & 0xF) as u8) << 4;
				let cb = (((packed >> 2) & 0xF) as u8) << 4;
				let t = ((packed & 3) as u8) * 0x55;
				rgba(y, cr, cb, t)
			};
			let index = usize::from(entry);
			if flags & 0x80 != 0 && index < 4 {
				clut.two[index] = color;
			}
			if flags & 0x40 != 0 && index < 16 {
				clut.four[index] = color;
			}
			if flags & 0x20 != 0 {
				clut.eight[index] = color;
			}
		}
	}

	fn object(&mut self, data: &[u8]) {
		let Some(head) = data.get(..3) else { return };
		let id = u16::from_be_bytes([head[0], head[1]]);
		// Only pixel objects: character objects need the receiver's own font.
		if (head[2] >> 2) & 3 != 0 {
			return;
		}
		let Some(lengths) = data.get(3..7) else { return };
		let top_length = usize::from(u16::from_be_bytes([lengths[0], lengths[1]]));
		let bottom_length = usize::from(u16::from_be_bytes([lengths[2], lengths[3]]));
		let Some(top) = data.get(7..7 + top_length) else { return };
		// Without its own lines, the bottom field repeats the top one.
		let bottom = if bottom_length == 0 {
			top
		} else {
			let Some(bottom) = data.get(7 + top_length..7 + top_length + bottom_length) else {
				return;
			};
			bottom
		};
		let Some(placements) = self.placements.get(&id).cloned() else {
			return;
		};
		for placement in placements {
			if let Some(region) = self.regions.get_mut(&placement.region) {
				draw_field(region, top, placement.x, placement.y);
				draw_field(region, bottom, placement.x, placement.y + 1);
			}
		}
	}

	fn display_definition(&mut self, data: &[u8]) {
		if let Some(v) = data.get(1..5) {
			let width = u16::from_be_bytes([v[0], v[1]]).saturating_add(1);
			let height = u16::from_be_bytes([v[2], v[3]]).saturating_add(1);
			self.display = (width, height);
		}
	}

	/// The page as it now is, shown from `time`.
	fn show(&mut self, time: f64) {
		self.pending = false;
		if let Some(previous) = self.pictures.last_mut()
			&& previous.end_ms.is_none_or(|end| end > time)
		{
			previous.end_ms = Some(time);
		}
		let (width, height) = (usize::from(self.display.0), usize::from(self.display.1));
		let mut canvas = vec![0u8; width * height * 4];
		let mut drawn = false;
		for shown in &self.shown {
			let Some(region) = self.regions.get(&shown.region) else {
				continue;
			};
			let clut = self.cluts.get(&region.clut).cloned().unwrap_or_default();
			for ry in 0..region.height {
				let y = shown.y + ry;
				if y >= height {
					break;
				}
				for rx in 0..region.width {
					let x = shown.x + rx;
					if x >= width {
						break;
					}
					let value = region.pixels[ry * region.width + rx];
					let color = match region.depth {
						2 => clut.two[usize::from(value & 3)],
						4 => clut.four[usize::from(value & 15)],
						_ => clut.eight[usize::from(value)],
					};
					if color[3] != 0 {
						canvas[(y * width + x) * 4..(y * width + x) * 4 + 4].copy_from_slice(&color);
						drawn = true;
					}
				}
			}
		}
		if !drawn {
			return;
		}
		let end = (self.timeout > 0.0).then(|| time + self.timeout * 1000.0);
		if let Some(picture) = picture_from_rgba(time, end, self.display, 0, 0, width, &canvas, false) {
			self.pictures.push(picture);
		}
	}

	/// As `pgs::BlockStream::take`.
	pub fn take(&mut self, last: bool) -> Vec<Picture> {
		let keep = usize::from(!last).min(self.pictures.len());
		self.pictures.drain(..self.pictures.len() - keep).collect()
	}
}

/// Draws one field of an object (every other line, from `y`) into a region.
fn draw_field(region: &mut Region, data: &[u8], x0: usize, y0: usize) {
	// Codes of fewer bits than the region's are widened through these tables.
	let mut two_to_four: [u8; 4] = [0, 7, 8, 15];
	let mut two_to_eight: [u8; 4] = [0x00, 0x77, 0x88, 0xFF];
	let mut four_to_eight: [u8; 16] = std::array::from_fn(|i| (i as u8) * 0x11);
	let (mut x, mut y) = (x0, y0);
	let mut bits = Bits { data, at: 0 };
	while !bits.done() {
		let kind = bits.read(8);
		// Past the region's right edge, a string still reads up to its end code.
		let width = region.width.checked_sub(x).filter(|&w| w > 0).unwrap_or(usize::MAX);
		let runs = match kind {
			0x10 => runs_2(&mut bits, width)
				.into_iter()
				.map(|(run, code)| {
					let code = match region.depth {
						2 => code,
						4 => two_to_four[usize::from(code)],
						_ => two_to_eight[usize::from(code)],
					};
					(run, code)
				})
				.collect(),
			0x11 => runs_4(&mut bits, width)
				.into_iter()
				.map(|(run, code)| {
					let code = match region.depth {
						2 => code >> 2,
						4 => code,
						_ => four_to_eight[usize::from(code)],
					};
					(run, code)
				})
				.collect(),
			0x12 => runs_8(&mut bits, width)
				.into_iter()
				.map(|(run, code)| {
					let code = match region.depth {
						2 => code >> 6,
						4 => code >> 4,
						_ => code,
					};
					(run, code)
				})
				.collect(),
			0x20 => {
				two_to_four = std::array::from_fn(|_| bits.read(4) as u8);
				Vec::new()
			}
			0x21 => {
				two_to_eight = std::array::from_fn(|_| bits.read(8) as u8);
				Vec::new()
			}
			0x22 => {
				four_to_eight = std::array::from_fn(|_| bits.read(8) as u8);
				Vec::new()
			}
			0xF0 => {
				x = x0;
				y += 2;
				Vec::new()
			}
			// Unknown blocks, such as the stray end byte of a string cut at the region's edge,
			// are skipped as other decoders do.
			_ => Vec::new(),
		};
		for (run, code) in runs {
			if y < region.height {
				let from = (y * region.width + x.min(region.width)).min(region.pixels.len());
				let to = (y * region.width + (x + run).min(region.width)).min(region.pixels.len());
				region.pixels[from..to].fill(code);
			}
			x += run;
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::pgs::decode;

	fn segment(kind: u8, payload: &[u8]) -> Vec<u8> {
		let mut out = vec![0x0F, kind, 0, 1];
		out.extend((payload.len() as u16).to_be_bytes());
		out.extend(payload);
		out
	}

	/// A page showing region 0 at (100, 400): 4×2 pixels, 4-bit, palette 1 turning code 1 red,
	/// with object 5 drawing a line of red then the default white (code 15 is grey) on each field.
	fn display_set(timeout: u8) -> Vec<u8> {
		let mut set = vec![0x20, 0x00];
		set.extend(segment(
			PAGE,
			&[timeout, 0x04 << 2 >> 2 | (2 << 2), 0, 0, 0, 100, 1, 144],
		));
		set.extend(segment(
			REGION,
			&[0, 0x08, 0, 4, 0, 2, 2 << 2, 1, 0, 0, 0, 5, 0, 0, 0, 0],
		));
		// Code 1: Y 81, Cr 240, Cb 90, opaque — red.
		set.extend(segment(CLUT, &[1, 0, 1, 0x40 | 1, 81, 240, 90, 0]));
		// 4-bit codes: two pixels of 1, then end; two of 1 again after the end of line.
		let pixels = [0x11, 0x11, 0x00, 0x00, 0xF0];
		let mut object = vec![0, 5, 0];
		object.extend((pixels.len() as u16).to_be_bytes());
		object.extend(0u16.to_be_bytes());
		object.extend(pixels);
		set.extend(segment(OBJECT, &object));
		set.extend(segment(END, &[]));
		set
	}

	#[test]
	fn reads_bits() {
		let mut bits = Bits {
			data: &[0b1010_0000, 0xFF],
			at: 0,
		};
		assert_eq!(bits.read(3), 0b101);
		bits.align();
		assert_eq!(bits.read(8), 0xFF);
		assert!(bits.done());
	}

	#[test]
	fn reads_run_lengths() {
		// 4-bit: code 3; then 0000 1 0 01 1010 (run 5 of code 10); then 0000 0 000 (end).
		let mut bits = Bits {
			data: &[0x30, 0x9A, 0x00],
			at: 0,
		};
		assert_eq!(runs_4(&mut bits, usize::MAX), vec![(1, 3), (5, 10)]);
		// 8-bit: code 7; then 0 then 1 + 0000011 (run 3) + code 9; then 00000000 0 0000000 (end).
		let mut bits = Bits {
			data: &[7, 0, 0x83, 9, 0, 0],
			at: 0,
		};
		assert_eq!(runs_8(&mut bits, usize::MAX), vec![(1, 7), (3, 9)]);
	}

	#[test]
	fn turns_pages_into_pictures() {
		let mut stream = Stream::new();
		stream.push(2000.0, &display_set(3));
		// An empty page clears the screen.
		stream.push(4000.0, &[segment(PAGE, &[3, 0]), segment(END, &[])].concat());
		stream.push(6000.0, &display_set(3));
		let pictures = stream.take(true);
		assert_eq!(pictures.len(), 2);
		assert_eq!((pictures[0].start_ms, pictures[0].end_ms), (2000.0, Some(4000.0)));
		assert_eq!((pictures[1].start_ms, pictures[1].end_ms), (6000.0, Some(9000.0)));
		let picture = &pictures[0];
		assert_eq!((picture.video_width, picture.video_height), (720, 576));
		assert_eq!(
			(picture.rect.x, picture.rect.y, picture.rect.width, picture.rect.height),
			(100, 400, 2, 2)
		);
		let (_, pixels) = decode(&picture.set).unwrap();
		assert!(
			pixels[0] > 200 && pixels[1] < 60 && pixels[2] < 60 && pixels[3] == 255,
			"{:?}",
			&pixels[0..4]
		);
		// The bottom field repeats the top one.
		assert_eq!(&pixels[8..12], &pixels[0..4]);
	}
}
