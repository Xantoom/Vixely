//! Rewrites an MP4 file with other subtitle tracks: every other track is copied byte for byte,
//! edited subtitle tracks are replaced, new ones added as 3GPP timed text (`tx3g`), the format
//! phones, HandBrake and FFmpeg write and every player reads.
//!
//! Only `moov`, the index, is rebuilt; the samples of the new tracks go in a new `mdat` right after
//! it, and the positions of every other sample are moved by what that adds. The rest of the file
//! is streamed through unchanged.

use std::io::{self, Read, Seek, SeekFrom};

use crate::mp4::{boxes, invalid, u32_at, u64_at};
use crate::mux::{Plan, Stream};

/// Boxes whose content is more boxes, walked to reach the ones changed.
const BRANCHES: [&[u8; 4]; 7] = [b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"dinf"];

enum Node {
	Leaf([u8; 4], Vec<u8>),
	Branch([u8; 4], Vec<Node>),
}

impl Node {
	fn kind(&self) -> &[u8; 4] {
		match self {
			Node::Leaf(kind, _) | Node::Branch(kind, _) => kind,
		}
	}

	fn children(&self) -> &[Node] {
		match self {
			Node::Branch(_, children) => children,
			Node::Leaf(..) => &[],
		}
	}

	fn children_mut(&mut self) -> Option<&mut Vec<Node>> {
		match self {
			Node::Branch(_, children) => Some(children),
			Node::Leaf(..) => None,
		}
	}

	/// The content of the leaf at a path of box types.
	fn leaf(&self, path: &[&[u8; 4]]) -> Option<&[u8]> {
		let (first, rest) = path.split_first()?;
		let child = self.children().iter().find(|node| node.kind() == *first)?;
		match (rest.is_empty(), child) {
			(true, Node::Leaf(_, content)) => Some(content),
			(false, _) => child.leaf(rest),
			_ => None,
		}
	}

	fn leaf_mut(&mut self, path: &[&[u8; 4]]) -> Option<&mut Vec<u8>> {
		let (first, rest) = path.split_first()?;
		let child = self.children_mut()?.iter_mut().find(|node| node.kind() == *first)?;
		if rest.is_empty() {
			return match child {
				Node::Leaf(_, content) => Some(content),
				Node::Branch(..) => None,
			};
		}
		child.leaf_mut(rest)
	}
}

fn parse(data: &[u8]) -> Vec<Node> {
	boxes(data)
		.map(|(kind, content)| {
			if BRANCHES.contains(&&kind) {
				Node::Branch(kind, parse(content))
			} else {
				Node::Leaf(kind, content.to_vec())
			}
		})
		.collect()
}

fn mp4_box(kind: &[u8; 4], content: &[u8]) -> Vec<u8> {
	let mut out = Vec::with_capacity(content.len() + 16);
	if content.len() as u64 + 8 > u32::MAX as u64 {
		out.extend(1u32.to_be_bytes());
		out.extend_from_slice(kind);
		out.extend((content.len() as u64 + 16).to_be_bytes());
	} else {
		out.extend((content.len() as u32 + 8).to_be_bytes());
		out.extend_from_slice(kind);
	}
	out.extend_from_slice(content);
	out
}

fn serialize(nodes: &[Node]) -> Vec<u8> {
	nodes
		.iter()
		.flat_map(|node| match node {
			Node::Leaf(kind, content) => mp4_box(kind, content),
			Node::Branch(kind, children) => mp4_box(kind, &serialize(children)),
		})
		.collect()
}

fn track_id(trak: &Node) -> Option<u32> {
	let tkhd = trak.leaf(&[b"tkhd"])?;
	if tkhd.first() == Some(&1) {
		u32_at(tkhd, 20)
	} else {
		u32_at(tkhd, 12)
	}
}

/// ISO 639-2 code as MP4 packs it; None for anything but three lowercase letters.
fn pack_language(code: &str) -> Option<u16> {
	let bytes = code.as_bytes();
	if bytes.len() != 3 || !bytes.iter().all(u8::is_ascii_lowercase) {
		return None;
	}
	Some(
		bytes
			.iter()
			.fold(0u16, |packed, &letter| (packed << 5) | u16::from(letter - 0x60)),
	)
}

fn set_language(trak: &mut Node, language: &str) {
	let Some(packed) = pack_language(language) else { return };
	if let Some(mdhd) = trak.leaf_mut(&[b"mdia", b"mdhd"]) {
		let at = if mdhd.first() == Some(&1) { 32 } else { 20 };
		if mdhd.len() >= at + 2 {
			mdhd[at..at + 2].copy_from_slice(&packed.to_be_bytes());
		}
	}
	// An extended language would win over the packed one.
	if let Some(mdia) = trak
		.children_mut()
		.and_then(|c| c.iter_mut().find(|n| n.kind() == b"mdia"))
	{
		if let Some(children) = mdia.children_mut() {
			children.retain(|node| node.kind() != b"elng");
		}
	}
}

fn set_name(trak: &mut Node, name: &str) {
	if let Some(hdlr) = trak.leaf_mut(&[b"mdia", b"hdlr"]) {
		if hdlr.len() >= 24 {
			hdlr.truncate(24);
			hdlr.extend_from_slice(name.as_bytes());
			hdlr.push(0);
		}
	}
}

fn set_enabled(trak: &mut Node, enabled: bool) {
	if let Some(tkhd) = trak.leaf_mut(&[b"tkhd"]) {
		if tkhd.len() >= 4 {
			tkhd[3] = if enabled { tkhd[3] | 1 } else { tkhd[3] & !1 };
		}
	}
}

/// Moves the chunk offsets of a kept track past `from` by `shift`, widening them when needed.
fn shift_offsets(trak: &mut Node, from: u64, shift: i64) -> io::Result<()> {
	let stbl = trak
		.children_mut()
		.and_then(|c| c.iter_mut().find(|n| n.kind() == b"mdia"))
		.and_then(|n| n.children_mut()?.iter_mut().find(|n| n.kind() == b"minf"))
		.and_then(|n| n.children_mut()?.iter_mut().find(|n| n.kind() == b"stbl"))
		.and_then(Node::children_mut)
		.ok_or_else(|| invalid("track without sample table"))?;
	let moved = |offset: u64| {
		if offset >= from {
			(offset as i64 + shift) as u64
		} else {
			offset
		}
	};
	for node in stbl.iter_mut() {
		let Node::Leaf(kind, content) = node else { continue };
		let count = u32_at(content, 4).unwrap_or(0) as usize;
		if kind == b"co64" {
			for k in 0..count {
				let at = 8 + k * 8;
				let offset = u64_at(content, at).ok_or_else(|| invalid("short co64"))?;
				content[at..at + 8].copy_from_slice(&moved(offset).to_be_bytes());
			}
		} else if kind == b"stco" {
			let offsets: Vec<u64> = (0..count)
				.map(|k| u32_at(content, 8 + k * 4).map(|o| moved(o as u64)))
				.collect::<Option<_>>()
				.ok_or_else(|| invalid("short stco"))?;
			if offsets.iter().all(|&o| o <= u32::MAX as u64) {
				for (k, offset) in offsets.iter().enumerate() {
					content[8 + k * 4..12 + k * 4].copy_from_slice(&(*offset as u32).to_be_bytes());
				}
			} else {
				let mut wide = content[..8].to_vec();
				for offset in offsets {
					wide.extend(offset.to_be_bytes());
				}
				*node = Node::Leaf(*b"co64", wide);
			}
		}
	}
	Ok(())
}

/// A new timed text track: its samples (gaps as empty samples) and the boxes that index them.
struct TextTrack {
	id: u32,
	language: String,
	name: String,
	default: bool,
	durations: Vec<u32>,
	samples: Vec<Vec<u8>>,
	/// Milliseconds.
	duration: u64,
}

impl TextTrack {
	fn new(id: u32, stream: &Stream, language: &str, name: &str, default: bool) -> TextTrack {
		let mut lines: Vec<(u64, u64, &[u8])> = stream
			.packets
			.iter()
			.map(|p| {
				let start = p.start_ms.max(0.0).round() as u64;
				let end = start + p.duration_ms.unwrap_or(2000.0).max(1.0).round() as u64;
				(start, end, p.data.as_slice())
			})
			.collect();
		lines.sort_by_key(|line| line.0);
		let mut durations = Vec::new();
		let mut samples = Vec::new();
		let mut time = 0u64;
		for (index, &(start, end, text)) in lines.iter().enumerate() {
			// Timed text shows one line at a time: an overlapping line ends where the next starts.
			let end = lines.get(index + 1).map_or(end, |next| end.min(next.0.max(start)));
			let start = start.max(time);
			if end <= start {
				continue;
			}
			if start > time {
				durations.push((start - time) as u32);
				samples.push(vec![0, 0]);
			}
			let text = &text[..text.len().min(u16::MAX as usize)];
			let mut sample = (text.len() as u16).to_be_bytes().to_vec();
			sample.extend_from_slice(text);
			durations.push((end - start) as u32);
			samples.push(sample);
			time = end;
		}
		TextTrack {
			id,
			language: language.to_string(),
			name: name.to_string(),
			default,
			durations,
			samples,
			duration: time,
		}
	}

	fn data_size(&self) -> u64 {
		self.samples.iter().map(|s| s.len() as u64).sum()
	}

	fn trak(&self, movie_timescale: u32, size: (u32, u32), chunk: u64) -> Vec<u8> {
		let (width, height) = size;
		let movie_duration = (self.duration * movie_timescale as u64 / 1000) as u32;
		let mut tkhd = vec![0, 0, 0, if self.default { 3 } else { 2 }];
		tkhd.extend([0u8; 8]);
		tkhd.extend(self.id.to_be_bytes());
		tkhd.extend([0u8; 4]);
		tkhd.extend(movie_duration.to_be_bytes());
		tkhd.extend([0u8; 8]);
		tkhd.extend(0u16.to_be_bytes()); // layer
		tkhd.extend(2u16.to_be_bytes()); // alternate group: subtitles, one shown at a time
		tkhd.extend(0u16.to_be_bytes()); // volume
		tkhd.extend([0u8; 2]);
		for value in [0x0001_0000u32, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000] {
			tkhd.extend(value.to_be_bytes());
		}
		tkhd.extend((width << 16).to_be_bytes());
		tkhd.extend((height << 16).to_be_bytes());

		let mut mdhd = vec![0u8; 12];
		mdhd.extend(1000u32.to_be_bytes());
		mdhd.extend((self.duration as u32).to_be_bytes());
		mdhd.extend(pack_language(&self.language).unwrap_or(0x55C4).to_be_bytes());
		mdhd.extend([0u8; 2]);

		let mut hdlr = vec![0u8; 8];
		hdlr.extend_from_slice(b"sbtl");
		hdlr.extend([0u8; 12]);
		hdlr.extend_from_slice(self.name.as_bytes());
		hdlr.push(0);

		// The sample description FFmpeg writes: bottom centre, white 16-point Arial, the text box
		// left to the player, which scales it to the picture.
		let mut entry = vec![0u8; 6];
		entry.extend(1u16.to_be_bytes());
		entry.extend(0u32.to_be_bytes());
		entry.extend([1u8, 0xFF]);
		entry.extend([0u8, 0, 0, 0xFF]);
		entry.extend([0u8; 8]);
		entry.extend([0u8, 0, 0, 0, 0, 1, 0, 16, 0xFF, 0xFF, 0xFF, 0xFF]);
		let font = b"Arial";
		let mut ftab = 1u16.to_be_bytes().to_vec();
		ftab.extend(1u16.to_be_bytes());
		ftab.push(font.len() as u8);
		ftab.extend_from_slice(font);
		entry.extend(mp4_box(b"ftab", &ftab));
		let mut stsd = vec![0u8; 4];
		stsd.extend(1u32.to_be_bytes());
		stsd.extend(mp4_box(b"tx3g", &entry));

		let mut runs: Vec<(u32, u32)> = Vec::new();
		for &duration in &self.durations {
			match runs.last_mut() {
				Some((count, value)) if *value == duration => *count += 1,
				_ => runs.push((1, duration)),
			}
		}
		let mut stts = vec![0u8; 4];
		stts.extend((runs.len() as u32).to_be_bytes());
		for (count, value) in runs {
			stts.extend(count.to_be_bytes());
			stts.extend(value.to_be_bytes());
		}
		let count = self.samples.len() as u32;
		let mut stsc = vec![0u8; 4];
		stsc.extend(1u32.to_be_bytes());
		for value in [1u32, count, 1] {
			stsc.extend(value.to_be_bytes());
		}
		let mut stsz = vec![0u8; 8];
		stsz.extend(count.to_be_bytes());
		for sample in &self.samples {
			stsz.extend((sample.len() as u32).to_be_bytes());
		}
		let mut co64 = vec![0u8; 4];
		co64.extend(1u32.to_be_bytes());
		co64.extend(chunk.to_be_bytes());
		let stbl = [
			mp4_box(b"stsd", &stsd),
			mp4_box(b"stts", &stts),
			mp4_box(b"stsc", &stsc),
			mp4_box(b"stsz", &stsz),
			mp4_box(b"co64", &co64),
		]
		.concat();
		let mut dref = vec![0u8; 4];
		dref.extend(1u32.to_be_bytes());
		dref.extend(mp4_box(b"url ", &[0, 0, 0, 1]));
		let minf = [
			mp4_box(b"nmhd", &[0u8; 4]),
			mp4_box(b"dinf", &mp4_box(b"dref", &dref)),
			mp4_box(b"stbl", &stbl),
		]
		.concat();
		let mdia = [
			mp4_box(b"mdhd", &mdhd),
			mp4_box(b"hdlr", &hdlr),
			mp4_box(b"minf", &minf),
		]
		.concat();
		mp4_box(b"trak", &[mp4_box(b"tkhd", &tkhd), mp4_box(b"mdia", &mdia)].concat())
	}
}

enum Piece {
	Bytes(Vec<u8>),
	Copy(u64, u64),
}

pub struct Mp4Muxer<R> {
	r: R,
	pieces: Vec<Piece>,
	next: usize,
	/// Bytes of the current copy already written.
	done: u64,
	total: u64,
}

/// Top-level boxes of the file: type, start, end.
fn top_level<R: Read + Seek>(r: &mut R, file_size: u64) -> io::Result<Vec<([u8; 4], u64, u64)>> {
	let mut list = Vec::new();
	let mut position = 0u64;
	while position + 8 <= file_size {
		r.seek(SeekFrom::Start(position))?;
		let mut header = [0u8; 16];
		r.read_exact(&mut header[..8])?;
		let kind: [u8; 4] = header[4..8].try_into().unwrap_or_default();
		let mut size = u32::from_be_bytes(header[0..4].try_into().unwrap_or_default()) as u64;
		if size == 1 {
			r.read_exact(&mut header[8..16])?;
			size = u64::from_be_bytes(header[8..16].try_into().unwrap_or_default());
		} else if size == 0 {
			size = file_size - position;
		}
		if size < 8 {
			return Err(invalid("corrupt MP4 box"));
		}
		list.push((kind, position, (position + size).min(file_size)));
		position += size;
	}
	Ok(list)
}

impl<R: Read + Seek> Mp4Muxer<R> {
	pub fn new(mut r: R, file_size: u64, plan: &Plan, streams: &[Stream]) -> io::Result<Mp4Muxer<R>> {
		let top = top_level(&mut r, file_size)?;
		if top.iter().any(|(kind, ..)| kind == b"moof") {
			return Err(invalid("fragmented MP4 files are not supported"));
		}
		let &(_, moov_start, moov_end) = top
			.iter()
			.find(|(kind, ..)| kind == b"moov")
			.ok_or_else(|| invalid("no moov box"))?;
		r.seek(SeekFrom::Start(moov_start))?;
		let mut raw = vec![0u8; (moov_end - moov_start) as usize];
		r.read_exact(&mut raw)?;
		let mut moov = parse(&raw)
			.into_iter()
			.next()
			.ok_or_else(|| invalid("unreadable moov box"))?;
		if moov.children().iter().any(|node| node.kind() == b"mvex") {
			return Err(invalid("fragmented MP4 files are not supported"));
		}
		let mvhd = moov.leaf(&[b"mvhd"]).ok_or_else(|| invalid("no mvhd box"))?;
		let v1 = mvhd.first() == Some(&1);
		let timescale = u32_at(mvhd, if v1 { 20 } else { 12 }).unwrap_or(1000).max(1);

		// The picture size, for the text box of new tracks.
		let size = moov
			.children()
			.iter()
			.filter(|node| node.kind() == b"trak")
			.find(|trak| trak.leaf(&[b"mdia", b"hdlr"]).and_then(|h| h.get(8..12)) == Some(b"vide"))
			.and_then(|trak| trak.leaf(&[b"tkhd"]))
			.and_then(|tkhd| Some((u32_at(tkhd, tkhd.len() - 8)? >> 16, u32_at(tkhd, tkhd.len() - 4)? >> 16)))
			.filter(|&(w, h)| w > 0 && h > 0)
			.unwrap_or((1920, 1080));

		// Tracks left out or replaced go; the others get their changes.
		let children = moov.children_mut().ok_or_else(|| invalid("unreadable moov box"))?;
		let mut max_id = 0;
		children.retain_mut(|node| {
			if node.kind() != b"trak" {
				return true;
			}
			let Some(id) = track_id(node) else { return true };
			max_id = max_id.max(id);
			let Some(choice) = plan.choices.iter().find(|c| c.number == id as u64) else {
				return true;
			};
			if !choice.keep || choice.stream.is_some() {
				return false;
			}
			if let Some(language) = &choice.language {
				set_language(node, language);
			}
			if let Some(name) = &choice.name {
				set_name(node, name);
			}
			if let Some(default) = choice.default {
				set_enabled(node, default);
			}
			true
		});

		let mut texts = Vec::new();
		let mut id = max_id;
		for choice in plan.choices.iter().filter(|c| c.keep) {
			let Some(index) = choice.stream else { continue };
			let stream = streams.get(index).ok_or_else(|| invalid("no such stream"))?;
			id += 1;
			let language = choice.language.clone().unwrap_or_else(|| "und".into());
			texts.push(TextTrack::new(
				id,
				stream,
				&language,
				choice.name.as_deref().unwrap_or(""),
				choice.default.unwrap_or(false),
			));
		}
		for added in &plan.added {
			let stream = streams.get(added.stream).ok_or_else(|| invalid("no such stream"))?;
			id += 1;
			texts.push(TextTrack::new(id, stream, &added.language, &added.name, added.default));
		}
		let data: u64 = texts.iter().map(TextTrack::data_size).sum();
		let mdat_header = if data + 8 > u32::MAX as u64 { 16 } else { 8 };

		// The next track ID, past the new ones.
		if let Some(mvhd) = moov.leaf_mut(&[b"mvhd"]) {
			let at = if v1 { 108 } else { 96 };
			if mvhd.len() >= at + 4 {
				mvhd[at..at + 4].copy_from_slice(&(id + 1).to_be_bytes());
			}
		}

		// The new moov and mdat take the old moov's place: everything after moves by the difference.
		// Offsets may widen as they move, which changes moov's size: settle it in a few rounds.
		let old_size = moov_end - moov_start;
		let edited = serialize(moov.children());
		let mut guess = old_size;
		let mut built = Vec::new();
		for _ in 0..4 {
			let shift = (guess + mdat_header + data) as i64 - old_size as i64;
			let mut children = parse(&edited);
			for node in children.iter_mut().filter(|node| node.kind() == b"trak") {
				shift_offsets(node, moov_end, shift)?;
			}
			let mut content = serialize(&children);
			let mut chunk = moov_start + guess + mdat_header;
			for text in &texts {
				content.extend(text.trak(timescale, size, chunk));
				chunk += text.data_size();
			}
			built = mp4_box(b"moov", &content);
			if built.len() as u64 == guess {
				break;
			}
			guess = built.len() as u64;
		}
		if built.len() as u64 != guess {
			return Err(invalid("could not settle the MP4 index"));
		}

		let mut mdat = if mdat_header == 16 {
			let mut header = 1u32.to_be_bytes().to_vec();
			header.extend_from_slice(b"mdat");
			header.extend((data + 16).to_be_bytes());
			header
		} else {
			let mut header = ((data + 8) as u32).to_be_bytes().to_vec();
			header.extend_from_slice(b"mdat");
			header
		};
		for text in &texts {
			for sample in &text.samples {
				mdat.extend_from_slice(sample);
			}
		}
		let pieces = vec![
			Piece::Copy(0, moov_start),
			Piece::Bytes(built),
			Piece::Bytes(mdat),
			Piece::Copy(moov_end, file_size),
		];
		let total = pieces
			.iter()
			.map(|piece| match piece {
				Piece::Bytes(bytes) => bytes.len() as u64,
				Piece::Copy(from, to) => to - from,
			})
			.sum();
		Ok(Mp4Muxer {
			r,
			pieces,
			next: 0,
			done: 0,
			total,
		})
	}

	pub fn total(&self) -> u64 {
		self.total
	}

	/// The next part of the file, at most about `wanted` bytes; empty once done.
	pub fn next_chunk(&mut self, wanted: usize) -> io::Result<Vec<u8>> {
		let mut out = Vec::with_capacity(wanted);
		while out.len() < wanted && self.next < self.pieces.len() {
			match &self.pieces[self.next] {
				Piece::Bytes(bytes) => {
					out.extend_from_slice(bytes);
					self.next += 1;
				}
				&Piece::Copy(from, to) => {
					let start = from + self.done;
					let length = (to - start).min((wanted - out.len()) as u64);
					if length > 0 {
						self.r.seek(SeekFrom::Start(start))?;
						let at = out.len();
						out.resize(at + length as usize, 0);
						self.r.read_exact(&mut out[at..])?;
					}
					self.done += length;
					if from + self.done >= to {
						self.next += 1;
						self.done = 0;
					}
				}
			}
		}
		Ok(out)
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::mp4;
	use crate::mux::{Added, Choice, Packet};
	use std::io::Cursor;

	fn full(kind: &[u8; 4], version_flags: u32, content: &[u8]) -> Vec<u8> {
		let mut data = version_flags.to_be_bytes().to_vec();
		data.extend_from_slice(content);
		mp4_box(kind, &data)
	}

	/// A video track with two samples, `moov` before `mdat` when `fast_start`.
	fn source(fast_start: bool) -> Vec<u8> {
		let samples = [vec![0xAA; 100], vec![0xBB; 50]];
		let build = |chunk: u32| {
			let mut tkhd = vec![0u8; 8];
			tkhd.extend(1u32.to_be_bytes());
			tkhd.extend([0u8; 60]);
			tkhd.extend((640u32 << 16).to_be_bytes());
			tkhd.extend((360u32 << 16).to_be_bytes());
			let mut mdhd = vec![0u8; 8];
			mdhd.extend(1000u32.to_be_bytes());
			mdhd.extend(2000u32.to_be_bytes());
			mdhd.extend(pack_language("eng").unwrap().to_be_bytes());
			mdhd.extend([0u8; 2]);
			let mut hdlr = vec![0u8; 4];
			hdlr.extend_from_slice(b"vide");
			hdlr.extend([0u8; 12]);
			hdlr.extend_from_slice(b"Video\0");
			let mut stsd = 1u32.to_be_bytes().to_vec();
			stsd.extend(mp4_box(b"avc1", &[0u8; 8]));
			let stbl = [
				full(b"stsd", 0, &stsd),
				full(b"stts", 0, &[0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 3, 0xE8]),
				full(b"stsc", 0, &[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1]),
				full(b"stsz", 0, &[0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 100, 0, 0, 0, 50]),
				full(b"stco", 0, &[&[0u8, 0, 0, 1][..], &chunk.to_be_bytes()].concat()),
			]
			.concat();
			let minf = mp4_box(b"stbl", &stbl);
			let mdia = [
				full(b"mdhd", 0, &mdhd),
				full(b"hdlr", 0, &hdlr),
				mp4_box(b"minf", &minf),
			]
			.concat();
			let trak = mp4_box(b"trak", &[full(b"tkhd", 3, &tkhd), mp4_box(b"mdia", &mdia)].concat());
			let mut mvhd = vec![0u8; 8];
			mvhd.extend(1000u32.to_be_bytes());
			mvhd.extend([0u8; 76]);
			mvhd.extend(2u32.to_be_bytes());
			mp4_box(b"moov", &[full(b"mvhd", 0, &mvhd), trak].concat())
		};
		let ftyp = mp4_box(b"ftyp", b"isom\0\0\0\0isom");
		let mdat = mp4_box(b"mdat", &samples.concat());
		if fast_start {
			let size = build(0).len() as u32;
			[ftyp.clone(), build(ftyp.len() as u32 + size + 8), mdat].concat()
		} else {
			let at = ftyp.len() as u32 + 8;
			[ftyp, mdat, build(at)].concat()
		}
	}

	fn write(bytes: Vec<u8>, plan: &Plan, streams: &[Stream]) -> Vec<u8> {
		let size = bytes.len() as u64;
		let mut muxer = Mp4Muxer::new(Cursor::new(bytes), size, plan, streams).unwrap();
		let mut out = Vec::new();
		loop {
			let chunk = muxer.next_chunk(64).unwrap();
			if chunk.is_empty() {
				break;
			}
			out.extend(chunk);
		}
		assert_eq!(out.len() as u64, muxer.total());
		out
	}

	#[test]
	fn adds_timed_text_and_keeps_samples_in_place() {
		let stream = Stream {
			codec: "tx3g".into(),
			private: Vec::new(),
			packets: vec![
				Packet {
					start_ms: 500.0,
					duration_ms: Some(700.0),
					data: b"Hello".to_vec(),
				},
				Packet {
					start_ms: 1500.0,
					duration_ms: Some(400.0),
					data: b"World".to_vec(),
				},
			],
		};
		let plan = Plan {
			choices: vec![Choice {
				number: 1,
				keep: true,
				language: Some("fre".into()),
				..Choice::default()
			}],
			added: vec![Added {
				stream: 0,
				language: "eng".into(),
				name: "Added".into(),
				default: true,
				forced: false,
				uid: 1,
			}],
		};
		for fast_start in [true, false] {
			let out = write(source(fast_start), &plan, std::slice::from_ref(&stream));
			let size = out.len() as u64;
			let mut cursor = Cursor::new(out);
			let file = mp4::probe(&mut cursor, size).unwrap();
			let text = &file.tracks[0];
			assert_eq!(
				(text.id, text.codec.as_str(), text.language.as_str(), text.name.as_str()),
				(2, "tx3g", "eng", "Added")
			);
			let packets = mp4::extract(&mut cursor, &file, 2, &mut |_| {}).unwrap();
			let lines: Vec<(f64, Vec<u8>)> = packets
				.into_iter()
				.map(|p| (p.start_ms, p.data[2..].to_vec()))
				.collect();
			assert_eq!(lines, vec![(500.0, b"Hello".to_vec()), (1500.0, b"World".to_vec())]);
			assert_eq!(file.media[0].language, "fre");
			// The video samples are still where the index says.
			let raw = cursor.into_inner();
			let moov = raw.windows(4).position(|w| w == b"moov").unwrap() - 4;
			let content =
				&raw[moov + 8..moov + 8 + u32::from_be_bytes(raw[moov..moov + 4].try_into().unwrap()) as usize - 8];
			let tree = parse(content);
			let trak = tree.iter().find(|n| n.kind() == b"trak").unwrap();
			let stco = trak.leaf(&[b"mdia", b"minf", b"stbl", b"stco"]).unwrap();
			let chunk = u32_at(stco, 8).unwrap() as usize;
			assert!(
				raw[chunk..chunk + 100].iter().all(|&b| b == 0xAA),
				"fast start {fast_start}"
			);
			assert!(raw[chunk + 100..chunk + 150].iter().all(|&b| b == 0xBB));
		}
	}
}
