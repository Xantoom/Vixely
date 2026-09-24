//! PGS, the image subtitles of Blu-ray discs (`.sup` files, `S_HDMV/PGS` Matroska tracks).
//!
//! A stream is a series of display sets, each made of segments: a composition (which objects
//! show where), windows, palettes and run-length encoded objects. A display set may reuse the
//! palettes and objects of earlier sets of the same epoch, so each one shown is rebuilt here as
//! a self-contained set that starts its own epoch: every line can then be decoded, moved in time
//! or written back on its own.

use std::collections::HashMap;

const PDS: u8 = 0x14;
const ODS: u8 = 0x15;
const PCS: u8 = 0x16;
const WDS: u8 = 0x17;
const END: u8 = 0x80;

/// Largest segment payload: its size is written on 16 bits.
const MAX_SEGMENT: usize = 0xFFFF;

#[derive(Clone, Debug, PartialEq)]
pub struct Rect {
	pub x: u16,
	pub y: u16,
	pub width: u16,
	pub height: u16,
}

/// A picture shown from `start_ms` until `end_ms` (the next set), as a self-contained display set.
#[derive(Clone, Debug)]
pub struct Picture {
	pub start_ms: f64,
	pub end_ms: Option<f64>,
	/// Segments without the `PG` headers of `.sup` files.
	pub set: Vec<u8>,
	/// Where the objects are on screen, all together.
	pub rect: Rect,
	/// Size of the video the positions refer to.
	pub video_width: u16,
	pub video_height: u16,
	/// Shown even when subtitles are off (forced narrative).
	pub forced: bool,
}

struct Segment<'a> {
	kind: u8,
	data: &'a [u8],
}

fn segment(kind: u8, data: &[u8]) -> Vec<u8> {
	let mut out = vec![kind];
	out.extend((data.len() as u16).to_be_bytes());
	out.extend_from_slice(data);
	out
}

fn u16_at(data: &[u8], at: usize) -> u16 {
	data.get(at..at + 2).map_or(0, |b| u16::from_be_bytes([b[0], b[1]]))
}

/// Splits bare segments (Matroska blocks).
fn bare_segments(data: &[u8]) -> Vec<Segment<'_>> {
	let mut out = Vec::new();
	let mut at = 0;
	while at + 3 <= data.len() {
		let kind = data[at];
		let size = u16_at(data, at + 1) as usize;
		let end = (at + 3 + size).min(data.len());
		out.push(Segment {
			kind,
			data: &data[at + 3..end],
		});
		at = end;
	}
	out
}

/// Splits a `.sup` file into display sets with their time (90 kHz clock), as bare segments.
pub fn sup_display_sets(data: &[u8]) -> Vec<(f64, Vec<u8>)> {
	let mut sets = Vec::new();
	let mut current: Option<(f64, Vec<u8>)> = None;
	let mut at = 0;
	while at + 13 <= data.len() {
		if &data[at..at + 2] != b"PG" {
			break;
		}
		let pts = u32::from_be_bytes([data[at + 2], data[at + 3], data[at + 4], data[at + 5]]);
		let kind = data[at + 10];
		let size = u16_at(data, at + 11) as usize;
		let end = (at + 13 + size).min(data.len());
		let set = current.get_or_insert_with(|| (pts as f64 / 90.0, Vec::new()));
		set.1.extend(segment(kind, &data[at + 13..end]));
		if kind == END {
			sets.extend(current.take());
		}
		at = end;
	}
	sets.extend(current);
	sets
}

/// Palettes and objects of the current epoch.
#[derive(Default)]
pub struct Normalizer {
	palettes: HashMap<u8, [Option<[u8; 4]>; 256]>,
	/// Object id → version, width, height, run-length data.
	objects: HashMap<u16, (u8, u16, u16, Vec<u8>)>,
	windows: Vec<u8>,
	/// Pending object fragments: id → (declared length, width, height, data).
	pending: HashMap<u16, (u16, u16, Vec<u8>)>,
	pub pictures: Vec<Picture>,
}

impl Normalizer {
	/// Adds one display set, shown at `time_ms`. `duration_ms` ends it, when known.
	pub fn push(&mut self, time_ms: f64, data: &[u8], duration_ms: Option<f64>) {
		let segments = bare_segments(data);
		let Some(pcs) = segments.iter().find(|s| s.kind == PCS) else {
			return;
		};
		let pcs = pcs.data;
		if pcs.len() < 11 {
			return;
		}
		// Epoch start: everything from before is forgotten.
		if pcs[7] & 0x80 != 0 {
			self.palettes.clear();
			self.objects.clear();
		}
		for segment in &segments {
			match segment.kind {
				PDS => self.palette(segment.data),
				ODS => self.object(segment.data),
				WDS => self.windows = segment.data.to_vec(),
				_ => {}
			}
		}
		// A new set replaces the one on screen.
		if let Some(previous) = self.pictures.last_mut()
			&& previous.end_ms.is_none_or(|end| end > time_ms)
		{
			previous.end_ms = Some(time_ms);
		}
		let count = pcs[10] as usize;
		if count == 0 {
			return;
		}
		let palette_id = pcs[9];
		let Some(palette) = self.palettes.get(&palette_id) else {
			return;
		};
		let mut composition = pcs[..11].to_vec();
		// Epoch start, no palette-only update, composition number kept.
		composition[7] = 0x80;
		composition[8] = 0;
		let mut objects = Vec::new();
		let mut at = 11;
		let mut rect: Option<(u16, u16, u16, u16)> = None;
		let mut forced = false;
		for _ in 0..count {
			let Some(entry) = pcs.get(at..at + 8) else { break };
			let id = u16_at(entry, 0);
			let flags = entry[3];
			let length = if flags & 0x80 != 0 { 16 } else { 8 };
			composition.extend_from_slice(pcs.get(at..at + length).unwrap_or(entry));
			at += length;
			forced |= flags & 0x40 != 0;
			let Some((_, width, height, _)) = self.objects.get(&id) else {
				continue;
			};
			let (x, y) = (u16_at(entry, 4), u16_at(entry, 6));
			let (x1, y1) = (x.saturating_add(*width), y.saturating_add(*height));
			rect = Some(match rect {
				None => (x, y, x1, y1),
				Some((a, b, c, d)) => (a.min(x), b.min(y), c.max(x1), d.max(y1)),
			});
			objects.push(id);
		}
		let Some((x0, y0, x1, y1)) = rect else { return };
		let mut set = segment(PCS, &composition);
		if !self.windows.is_empty() {
			set.extend(segment(WDS, &self.windows));
		}
		let mut pds = vec![palette_id, 0];
		for (index, entry) in palette.iter().enumerate() {
			if let Some([y, cr, cb, a]) = entry {
				pds.extend([index as u8, *y, *cr, *cb, *a]);
			}
		}
		set.extend(segment(PDS, &pds));
		for id in objects {
			if let Some((version, width, height, rle)) = self.objects.get(&id) {
				set.extend(object_segments(id, *version, *width, *height, rle));
			}
		}
		set.extend(segment(END, &[]));
		self.pictures.push(Picture {
			start_ms: time_ms,
			end_ms: duration_ms.filter(|d| *d > 0.0).map(|d| time_ms + d),
			set,
			rect: Rect {
				x: x0,
				y: y0,
				width: x1 - x0,
				height: y1 - y0,
			},
			video_width: u16_at(pcs, 0),
			video_height: u16_at(pcs, 2),
			forced,
		});
	}

	fn palette(&mut self, data: &[u8]) {
		let Some(&id) = data.first() else { return };
		let palette = self.palettes.entry(id).or_insert([None; 256]);
		for entry in data.get(2..).unwrap_or_default().chunks_exact(5) {
			palette[entry[0] as usize] = Some([entry[1], entry[2], entry[3], entry[4]]);
		}
	}

	fn object(&mut self, data: &[u8]) {
		if data.len() < 4 {
			return;
		}
		let id = u16_at(data, 0);
		let version = data[2];
		let sequence = data[3];
		if sequence & 0x80 != 0 {
			// First fragment: 24-bit length (which counts width and height), width, height.
			if data.len() < 11 {
				return;
			}
			let (width, height) = (u16_at(data, 7), u16_at(data, 9));
			self.pending.insert(id, (width, height, data[11..].to_vec()));
		} else if let Some(pending) = self.pending.get_mut(&id) {
			pending.2.extend_from_slice(&data[4..]);
		}
		if sequence & 0x40 != 0
			&& let Some((width, height, rle)) = self.pending.remove(&id)
		{
			self.objects.insert(id, (version, width, height, rle));
		}
	}
}

/// An object as ODS segments, split to fit the 16-bit segment size.
fn object_segments(id: u16, version: u8, width: u16, height: u16, rle: &[u8]) -> Vec<u8> {
	let mut out = Vec::new();
	let first_room = MAX_SEGMENT - 11;
	let mut rest = rle;
	let mut first = true;
	loop {
		let room = if first { first_room } else { MAX_SEGMENT - 4 };
		let take = rest.len().min(room);
		let last = take == rest.len();
		let mut data = id.to_be_bytes().to_vec();
		data.push(version);
		data.push(if first { 0x80 } else { 0 } | if last { 0x40 } else { 0 });
		if first {
			let length = (rle.len() + 4) as u32;
			data.extend(&length.to_be_bytes()[1..]);
			data.extend(width.to_be_bytes());
			data.extend(height.to_be_bytes());
		}
		data.extend_from_slice(&rest[..take]);
		out.extend(segment(ODS, &data));
		rest = &rest[take..];
		first = false;
		if last {
			return out;
		}
	}
}

/// Pictures of a Matroska PGS track, from its blocks in file order: `(time, duration, data)`.
/// Muxers put a whole display set in each block, or each segment in its own block; segments are
/// gathered until the end segment either way, and the set shows at the time of its composition.
pub fn read_blocks<'a>(blocks: impl IntoIterator<Item = (f64, Option<f64>, &'a [u8])>) -> Vec<Picture> {
	let mut normalizer = Normalizer::default();
	let mut set = Vec::new();
	let mut shown: Option<(f64, Option<f64>)> = None;
	for (time, duration, data) in blocks {
		for piece in bare_segments(data) {
			if piece.kind == PCS {
				shown = Some((time, duration));
			}
			set.extend(segment(piece.kind, piece.data));
			if piece.kind == END {
				if let Some((time, duration)) = shown.take() {
					normalizer.push(time, &set, duration);
				}
				set.clear();
			}
		}
	}
	normalizer.pictures
}

/// Pictures of a `.sup` file.
pub fn read_sup(data: &[u8]) -> Vec<Picture> {
	let mut normalizer = Normalizer::default();
	for (time, set) in sup_display_sets(data) {
		normalizer.push(time, &set, None);
	}
	normalizer.pictures
}

/// BT.709 limited range, as Blu-ray palettes are written.
fn rgba(entry: [u8; 4]) -> [u8; 4] {
	let [y, cr, cb, a] = entry;
	let y = 1.164 * (y as f32 - 16.0);
	let cr = cr as f32 - 128.0;
	let cb = cb as f32 - 128.0;
	let clamp = |v: f32| v.round().clamp(0.0, 255.0) as u8;
	[
		clamp(y + 1.793 * cr),
		clamp(y - 0.213 * cb - 0.533 * cr),
		clamp(y + 2.112 * cb),
		a,
	]
}

/// Decodes the run-length data of an object into palette indices.
fn decode_rle(rle: &[u8], width: usize, height: usize) -> Vec<u8> {
	let mut out = vec![0u8; width * height];
	let (mut x, mut y, mut i) = (0usize, 0usize, 0usize);
	while i < rle.len() && y < height {
		let mut color = rle[i];
		i += 1;
		let mut run = 1usize;
		if color == 0 {
			let Some(&flags) = rle.get(i) else { break };
			i += 1;
			run = (flags & 0x3F) as usize;
			if flags & 0x40 != 0 {
				run = (run << 8) | *rle.get(i).unwrap_or(&0) as usize;
				i += 1;
			}
			color = if flags & 0x80 != 0 {
				let c = *rle.get(i).unwrap_or(&0);
				i += 1;
				c
			} else {
				0
			};
			if run == 0 {
				// End of line.
				x = 0;
				y += 1;
				continue;
			}
		}
		let end = (x + run).min(width);
		out[y * width + x..y * width + end].fill(color);
		x = end;
	}
	out
}

/// A picture decoded: its rectangle and straight RGBA pixels.
pub fn decode(set: &[u8]) -> Option<(Rect, Vec<u8>)> {
	let mut normalizer = Normalizer::default();
	normalizer.push(0.0, set, None);
	let picture = normalizer.pictures.pop()?;
	let rect = picture.rect.clone();
	let segments = bare_segments(set);
	let pcs = segments.iter().find(|s| s.kind == PCS)?.data;
	let palette = normalizer.palettes.get(&pcs[9])?;
	let colors: Vec<[u8; 4]> = palette.iter().map(|entry| entry.map_or([0; 4], rgba)).collect();
	let (width, height) = (rect.width as usize, rect.height as usize);
	let mut pixels = vec![0u8; width * height * 4];
	let mut at = 11;
	for _ in 0..pcs[10] {
		let Some(entry) = pcs.get(at..at + 8) else { break };
		at += if entry[3] & 0x80 != 0 { 16 } else { 8 };
		let id = u16_at(entry, 0);
		let Some((_, w, h, rle)) = normalizer.objects.get(&id) else {
			continue;
		};
		let (ox, oy) = (
			(u16_at(entry, 4) - rect.x) as usize,
			(u16_at(entry, 6) - rect.y) as usize,
		);
		let indices = decode_rle(rle, *w as usize, *h as usize);
		for row in 0..*h as usize {
			for col in 0..*w as usize {
				let color = colors[indices[row * *w as usize + col] as usize];
				let target = ((oy + row) * width + ox + col) * 4;
				pixels[target..target + 4].copy_from_slice(&color);
			}
		}
	}
	Some((rect, pixels))
}

/// A `.sup` file from pictures: each shown at its start and cleared at its end, unless the next
/// one takes its place first.
pub fn write_sup(pictures: &[(f64, f64, &[u8])]) -> Vec<u8> {
	let mut out = Vec::new();
	let mut number = 0u16;
	let header = |out: &mut Vec<u8>, time_ms: f64, kind: u8, data: &[u8]| {
		out.extend(b"PG");
		out.extend((((time_ms.max(0.0) * 90.0).round()) as u32).to_be_bytes());
		out.extend(0u32.to_be_bytes());
		out.push(kind);
		out.extend((data.len() as u16).to_be_bytes());
		out.extend_from_slice(data);
	};
	for (index, &(start, end, set)) in pictures.iter().enumerate() {
		let segments = bare_segments(set);
		let Some(pcs) = segments.iter().find(|s| s.kind == PCS).map(|s| s.data) else {
			continue;
		};
		for segment in &segments {
			if segment.kind == PCS {
				let mut composition = segment.data.to_vec();
				composition[5..7].copy_from_slice(&number.to_be_bytes());
				header(&mut out, start, PCS, &composition);
			} else {
				header(&mut out, start, segment.kind, segment.data);
			}
		}
		number = number.wrapping_add(1);
		let next = pictures.get(index + 1).map(|p| p.0);
		if next.is_some_and(|next| next <= end) {
			continue;
		}
		// Clearing: an empty composition in the same epoch, with the same windows.
		let mut clear = pcs[..11].to_vec();
		clear[5..7].copy_from_slice(&number.to_be_bytes());
		clear[7] = 0;
		clear[8] = 0;
		clear[10] = 0;
		header(&mut out, end, PCS, &clear);
		if let Some(windows) = segments.iter().find(|s| s.kind == WDS) {
			header(&mut out, end, WDS, windows.data);
		}
		header(&mut out, end, END, &[]);
		number = number.wrapping_add(1);
	}
	out
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Run-length encodes palette indices the way Blu-ray authoring tools do.
	fn encode_rle(indices: &[u8], width: usize) -> Vec<u8> {
		let mut out = Vec::new();
		for row in indices.chunks(width) {
			let mut x = 0;
			while x < row.len() {
				let color = row[x];
				let mut run = 1;
				while x + run < row.len() && row[x + run] == color && run < 16383 {
					run += 1;
				}
				if color != 0 && run < 3 {
					for _ in 0..run {
						out.push(color);
					}
				} else {
					out.push(0);
					let long = if run > 63 { 0x40 } else { 0 };
					let with_color = if color != 0 { 0x80 } else { 0 };
					if long != 0 {
						out.push(with_color | long | (run >> 8) as u8);
						out.push((run & 0xFF) as u8);
					} else {
						out.push(with_color | run as u8);
					}
					if color != 0 {
						out.push(color);
					}
				}
				x += run;
			}
			out.extend([0, 0]);
		}
		out
	}

	fn sup_segment(pts_ms: f64, kind: u8, data: &[u8]) -> Vec<u8> {
		let mut out = b"PG".to_vec();
		out.extend(((pts_ms * 90.0) as u32).to_be_bytes());
		out.extend(0u32.to_be_bytes());
		out.push(kind);
		out.extend((data.len() as u16).to_be_bytes());
		out.extend_from_slice(data);
		out
	}

	/// A 1920×1080 stream: a 4×2 object shown at 1 s, its palette changed at 2 s (same epoch,
	/// palette only), cleared at 3 s.
	fn stream() -> Vec<u8> {
		let indices = [1, 1, 2, 0, 0, 2, 2, 1];
		let rle = encode_rle(&indices, 4);
		let pcs = |state: u8, palette_only: u8, objects: u8| {
			let mut data = [1920u16.to_be_bytes(), 1080u16.to_be_bytes()].concat();
			data.extend([
				0x10,
				0,
				1,
				state,
				palette_only,
				if palette_only != 0 { 1 } else { 0 },
				objects,
			]);
			if objects > 0 {
				data.extend([0, 7, 0, 0x40]);
				data.extend(100u16.to_be_bytes());
				data.extend(900u16.to_be_bytes());
			}
			data
		};
		let wds = [
			&[1u8, 0][..],
			&100u16.to_be_bytes(),
			&900u16.to_be_bytes(),
			&4u16.to_be_bytes(),
			&2u16.to_be_bytes(),
		]
		.concat();
		// White and red (Y, Cr, Cb, A) in palette 0; palette 1 turns index 2 blue.
		let pds0 = [0u8, 0, 1, 235, 128, 128, 255, 2, 81, 240, 90, 255];
		let pds1 = [1u8, 0, 1, 235, 128, 128, 255, 2, 41, 110, 240, 255];
		let mut ods = vec![0, 7, 0, 0xC0];
		ods.extend(&((rle.len() + 4) as u32).to_be_bytes()[1..]);
		ods.extend(4u16.to_be_bytes());
		ods.extend(2u16.to_be_bytes());
		ods.extend(&rle);
		[
			sup_segment(1000.0, PCS, &pcs(0x80, 0, 1)),
			sup_segment(1000.0, WDS, &wds),
			sup_segment(1000.0, PDS, &pds0),
			sup_segment(1000.0, ODS, &ods),
			sup_segment(1000.0, END, &[]),
			sup_segment(2000.0, PCS, &pcs(0, 0x80, 1)),
			sup_segment(2000.0, PDS, &pds1),
			sup_segment(2000.0, END, &[]),
			sup_segment(3000.0, PCS, &pcs(0, 0, 0)),
			sup_segment(3000.0, WDS, &wds),
			sup_segment(3000.0, END, &[]),
		]
		.concat()
	}

	#[test]
	fn reads_decodes_and_writes_back() {
		let pictures = read_sup(&stream());
		assert_eq!(pictures.len(), 2);
		assert_eq!((pictures[0].start_ms, pictures[0].end_ms), (1000.0, Some(2000.0)));
		assert_eq!((pictures[1].start_ms, pictures[1].end_ms), (2000.0, Some(3000.0)));
		assert_eq!(
			pictures[0].rect,
			Rect {
				x: 100,
				y: 900,
				width: 4,
				height: 2
			}
		);
		assert!(pictures[0].forced);

		// The second picture carries the object from the first set, with its own palette.
		let (_, first) = decode(&pictures[0].set).unwrap();
		let (rect, second) = decode(&pictures[1].set).unwrap();
		assert_eq!((rect.width, rect.height), (4, 2));
		assert_eq!(&first[0..4], &[255, 255, 255, 255]);
		assert!(first[8] > 200 && first[10] < 60, "red: {:?}", &first[8..12]);
		assert!(second[8] < 60 && second[10] > 200, "blue: {:?}", &second[8..12]);
		assert_eq!(&first[12..16], &[0, 0, 0, 0]);

		// Written back 500 ms later: two pictures, back to back, then a clear.
		let moved: Vec<(f64, f64, &[u8])> = pictures
			.iter()
			.map(|p| (p.start_ms + 500.0, p.end_ms.unwrap() + 500.0, p.set.as_slice()))
			.collect();
		let again = read_sup(&write_sup(&moved));
		assert_eq!(again.len(), 2);
		assert_eq!(
			(again[0].start_ms, again[1].start_ms, again[1].end_ms),
			(1500.0, 2500.0, Some(3500.0))
		);
		assert_eq!(decode(&again[1].set).unwrap().1, second);
	}

	#[test]
	fn splits_large_objects() {
		let rle = vec![7u8; 150_000];
		let segments = object_segments(3, 0, 1000, 150, &rle);
		let mut normalizer = Normalizer::default();
		for segment in bare_segments(&segments) {
			normalizer.object(segment.data);
		}
		assert_eq!(normalizer.objects.get(&3).map(|o| o.3.len()), Some(150_000));
	}
}
