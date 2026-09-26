//! Rewrites a Matroska file with other subtitle tracks, the way mkvmerge would: every other track,
//! the attachments (fonts), chapters and tags are copied byte for byte; edited subtitle tracks are
//! replaced, new ones added, tracks left out dropped. The index (Cues) is rebuilt so players seek
//! as fast as before.
//!
//! The output is laid out in a first pass that reads only element headers, so its size and every
//! position are known before a byte is written; the second pass streams it out in chunks, so a
//! film of several gigabytes never sits in memory.

use std::collections::HashMap;
use std::io::{self, Read, Seek};

use crate::ebml::{Header, UNKNOWN, read_bytes, read_header, read_uint, read_vint, skip_to};
use crate::mkv::{
	self, BLOCK, BLOCK_DURATION, BLOCK_GROUP, CHAPTERS, CLUSTER, CLUSTER_TIMESTAMP, CODEC_ID, CODEC_PRIVATE,
	CONTENT_ENCODINGS, CUE_CLUSTER_POSITION, CUE_POINT, CUE_TRACK, CUE_TRACK_POSITIONS, CUES, FLAG_DEFAULT,
	FLAG_FORCED, INFO, LANGUAGE, LANGUAGE_BCP47, NAME, SEEK, SEEK_HEAD, SEEK_ID, SEEK_POSITION, SEGMENT, SIMPLE_BLOCK,
	TAGS, TOP_LEVEL, TRACK_ENTRY, TRACK_NUMBER, TRACKS, invalid,
};

const ATTACHMENTS: u32 = mkv::ATTACHMENTS;
const CUE_TIME: u32 = 0xB3;
const CUE_RELATIVE_POSITION: u32 = 0xF0;
const TRACK_UID: u32 = 0x73C5;
const TRACK_TYPE: u32 = 0x83;
const FLAG_LACING: u32 = 0x9C;
const REFERENCE_BLOCK: u32 = 0xFB;
const CRC32: u32 = 0xBF;
const VOID: u32 = 0xEC;
const TITLE: u32 = 0x7BA9;
const VIDEO_TRACK: u64 = 1;

/// A line of subtitles to write: times in milliseconds, its data as the codec stores it.
#[derive(Clone, Debug, PartialEq)]
pub struct Packet {
	pub start_ms: f64,
	/// None for PGS, whose display sets carry their own clearing.
	pub duration_ms: Option<f64>,
	pub data: Vec<u8>,
}

/// The lines of a subtitle track and how its codec is set up.
#[derive(Clone, Debug)]
pub struct Stream {
	pub codec: String,
	pub private: Vec<u8>,
	pub packets: Vec<Packet>,
}

/// What becomes of a track of the source.
#[derive(Clone, Debug, Default)]
pub struct Choice {
	pub number: u64,
	pub keep: bool,
	pub language: Option<String>,
	pub name: Option<String>,
	pub default: Option<bool>,
	pub forced: Option<bool>,
	/// Index of the stream that replaces its lines.
	pub stream: Option<usize>,
}

/// A subtitle track added to the file.
#[derive(Clone, Debug)]
pub struct Added {
	pub stream: usize,
	pub language: String,
	pub name: String,
	pub default: bool,
	pub forced: bool,
	pub uid: u64,
}

/// Tracks the source keeps as they are, unless named here.
#[derive(Clone, Debug, Default)]
pub struct Plan {
	pub choices: Vec<Choice>,
	pub added: Vec<Added>,
	/// A whole Attachments element written in place of the source's, such as the fonts of the
	/// file a converted video came from.
	pub attachments: Option<Vec<u8>>,
	/// The segment's title, as players show it, in place of the source's; empty removes it.
	pub title: Option<String>,
}

// --- Writing EBML ---------------------------------------------------------------------------

fn id_bytes(id: u32) -> Vec<u8> {
	let bytes = id.to_be_bytes();
	let skip = bytes.iter().position(|&b| b != 0).unwrap_or(3);
	bytes[skip..].to_vec()
}

fn size_length(size: u64) -> usize {
	(1..=8).find(|&length| size < (1u64 << (7 * length)) - 1).unwrap_or(8)
}

fn size_bytes(size: u64) -> Vec<u8> {
	let length = size_length(size);
	let marked = size | (1u64 << (7 * length));
	marked.to_be_bytes()[8 - length..].to_vec()
}

/// A size always written on 8 bytes, for elements whose size is patched in or must not vary.
fn size8(size: u64) -> Vec<u8> {
	let mut out = vec![0x01];
	out.extend_from_slice(&size.to_be_bytes()[1..]);
	out
}

fn header_length(id: u32, size: u64) -> u64 {
	(id_bytes(id).len() + size_length(size)) as u64
}

/// An Attachments element around the given content (its AttachedFile children).
pub fn attachments(content: &[u8]) -> Vec<u8> {
	element(ATTACHMENTS, content)
}

fn element(id: u32, content: &[u8]) -> Vec<u8> {
	let mut out = id_bytes(id);
	out.extend(size_bytes(content.len() as u64));
	out.extend_from_slice(content);
	out
}

fn uint(id: u32, value: u64) -> Vec<u8> {
	let bytes = value.to_be_bytes();
	let skip = bytes.iter().position(|&b| b != 0).unwrap_or(7);
	element(id, &bytes[skip..])
}

/// An unsigned integer on 8 bytes, so the element's size doesn't depend on the value.
fn uint8(id: u32, value: u64) -> Vec<u8> {
	element(id, &value.to_be_bytes())
}

fn string(id: u32, value: &str) -> Vec<u8> {
	element(id, value.as_bytes())
}

fn track_vint(number: u64) -> Vec<u8> {
	size_bytes(number)
}

// --- First pass: the layout ---------------------------------------------------------------

/// A block of the source kept in a cluster: where it is, and when it plays.
struct Item {
	from: u64,
	to: u64,
	time: i64,
	/// A key frame of the first video track, for the index when the source has none.
	key: bool,
}

/// A subtitle line placed in a cluster.
#[derive(Clone, Copy)]
struct Line {
	time: i64,
	track: usize,
	packet: usize,
}

enum Op {
	Copy(u64, u64),
	Line(Line),
}

struct Cluster {
	/// Header position in the source; None for clusters made for lines out of reach of others.
	source: Option<u64>,
	time: i64,
	items: Vec<Item>,
	lines: Vec<Line>,
	ops: Vec<Op>,
	content: u64,
	/// Where the cluster starts, from the start of the segment's data.
	offset: u64,
	/// Where blocks start in the cluster's content, for the index: (time, track, position).
	cue_blocks: Vec<(i64, u64, u64)>,
}

/// A subtitle track being written: its number and lines in timestamp units.
struct Out {
	number: u64,
	lines: Vec<(i64, Option<u64>, Vec<u8>)>,
}

fn block_size(out: &Out, line: &Line) -> u64 {
	let (_, duration, data) = &out.lines[line.packet];
	let block = track_vint(out.number).len() as u64 + 3 + data.len() as u64;
	match duration {
		Some(duration) => {
			let inner = header_length(BLOCK, block) + block + uint(BLOCK_DURATION, *duration).len() as u64;
			header_length(BLOCK_GROUP, inner) + inner
		}
		None => header_length(SIMPLE_BLOCK, block) + block,
	}
}

fn write_block(out: &Out, line: &Line, cluster_time: i64, into: &mut Vec<u8>) {
	let (time, duration, data) = &out.lines[line.packet];
	let mut block = track_vint(out.number);
	block.extend(((time - cluster_time) as i16).to_be_bytes());
	match duration {
		Some(duration) => {
			block.push(0);
			block.extend_from_slice(data);
			let mut inner = element(BLOCK, &block);
			inner.extend(uint(BLOCK_DURATION, *duration));
			into.extend(element(BLOCK_GROUP, &inner));
		}
		None => {
			block.push(0x80);
			block.extend_from_slice(data);
			into.extend(element(SIMPLE_BLOCK, &block));
		}
	}
}

/// Children of an element, with where each header starts.
fn walk<R: Read + Seek>(
	r: &mut R,
	start: u64,
	end: u64,
	mut f: impl FnMut(&mut R, u64, &Header) -> io::Result<()>,
) -> io::Result<()> {
	let mut position = start;
	while position < end {
		skip_to(r, position)?;
		let header = match read_header(r) {
			Ok(header) => header,
			Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
			Err(error) => return Err(error),
		};
		f(r, position, &header)?;
		if header.size == UNKNOWN {
			break;
		}
		position = header.end();
	}
	Ok(())
}

/// The track, time and key flag of a SimpleBlock or BlockGroup.
fn block_info<R: Read + Seek>(r: &mut R, element: &Header) -> io::Result<Option<(u64, i16, bool)>> {
	let read = |r: &mut R, block: &Header| -> io::Result<(u64, i16, u8)> {
		skip_to(r, block.start)?;
		let (number, _) = read_vint(r)?;
		let mut rest = [0u8; 3];
		r.read_exact(&mut rest)?;
		Ok((number, i16::from_be_bytes([rest[0], rest[1]]), rest[2]))
	};
	match element.id {
		SIMPLE_BLOCK => {
			let (number, time, flags) = read(r, element)?;
			Ok(Some((number, time, flags & 0x80 != 0)))
		}
		BLOCK_GROUP => {
			let mut found = None;
			let mut referenced = false;
			walk(r, element.start, element.end(), |r, _, field| {
				match field.id {
					BLOCK => found = Some(read(r, field)?),
					REFERENCE_BLOCK => referenced = true,
					_ => {}
				}
				Ok(())
			})?;
			Ok(found.map(|(number, time, _)| (number, time, !referenced)))
		}
		_ => Ok(None),
	}
}

enum Piece {
	Bytes(Vec<u8>),
	Copy(u64, u64),
	Cluster(usize),
}

pub struct Muxer<R> {
	r: R,
	pieces: Vec<Piece>,
	clusters: Vec<Cluster>,
	outs: Vec<Out>,
	next: usize,
	total: u64,
	written: u64,
}

impl<R: Read + Seek> Muxer<R> {
	/// Lays out the new file. `progress` receives the share of the source read, 0 to 1.
	pub fn new(
		mut r: R,
		file_size: u64,
		plan: &Plan,
		streams: &[Stream],
		progress: &mut dyn FnMut(f64),
	) -> io::Result<Muxer<R>> {
		let file = mkv::probe(&mut r, file_size)?;
		let scale = file.timestamp_scale as f64;
		let choice = |number: u64| plan.choices.iter().find(|c| c.number == number);
		let copied = |number: u64| choice(number).is_none_or(|c| c.keep && c.stream.is_none());

		// Subtitle tracks written from lines: replacements keep their number, new ones follow.
		let mut outs = Vec::new();
		let mut stream_of = Vec::new();
		for c in &plan.choices {
			if let (true, Some(stream)) = (c.keep, c.stream) {
				outs.push(Out {
					number: c.number,
					lines: Vec::new(),
				});
				stream_of.push(stream);
			}
		}
		let mut next_number = file.tracks.iter().map(|t| t.number).max().unwrap_or(0) + 1;
		for added in &plan.added {
			outs.push(Out {
				number: next_number,
				lines: Vec::new(),
			});
			stream_of.push(added.stream);
			next_number += 1;
		}
		for (out, &stream) in outs.iter_mut().zip(&stream_of) {
			let stream = streams.get(stream).ok_or_else(|| invalid("no such stream"))?;
			out.lines = stream
				.packets
				.iter()
				.map(|p| {
					let start = (p.start_ms * 1e6 / scale).round() as i64;
					let duration = p.duration_ms.map(|d| (d * 1e6 / scale).round().max(1.0) as u64);
					(start.max(0), duration, p.data.clone())
				})
				.collect();
			out.lines.sort_by_key(|line| line.0);
		}

		// The top level of the segment, clusters walked block by block.
		let video = file.tracks.iter().find(|t| t.kind == VIDEO_TRACK).map(|t| t.number);
		let mut elements: HashMap<u32, (u64, u64)> = HashMap::new();
		let mut clusters: Vec<Cluster> = Vec::new();
		let span = (file.segment_end - file.segment_start).max(1) as f64;
		let mut position = file.segment_start;
		while position < file.segment_end {
			skip_to(&mut r, position)?;
			let Ok(header) = read_header(&mut r) else { break };
			if header.id == CLUSTER {
				let end = if header.size == UNKNOWN {
					file.segment_end
				} else {
					header.end()
				};
				let mut cluster = Cluster {
					source: Some(position),
					time: 0,
					items: Vec::new(),
					lines: Vec::new(),
					ops: Vec::new(),
					content: 0,
					offset: 0,
					cue_blocks: Vec::new(),
				};
				let mut next = end;
				let mut child = header.start;
				while child < end {
					skip_to(&mut r, child)?;
					let element = match read_header(&mut r) {
						Ok(element) => element,
						Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
						Err(error) => return Err(error),
					};
					if header.size == UNKNOWN && TOP_LEVEL.contains(&element.id) {
						next = child;
						break;
					}
					if element.id == CLUSTER_TIMESTAMP {
						cluster.time = read_uint(&mut r, element.size)? as i64;
					} else if let Some((number, time, key)) = block_info(&mut r, &element)? {
						if copied(number) {
							cluster.items.push(Item {
								from: child,
								to: element.end(),
								time: cluster.time + time as i64,
								key: key && Some(number) == video,
							});
						}
					}
					if element.size == UNKNOWN {
						break;
					}
					child = element.end();
				}
				clusters.push(cluster);
				if next <= position {
					break;
				}
				position = next;
			} else {
				if header.size == UNKNOWN {
					break;
				}
				elements.entry(header.id).or_insert((position, header.end()));
				position = header.end();
			}
			progress((position - file.segment_start) as f64 / span);
		}

		// Each line goes to the cluster it plays in, or a cluster of its own when the block's
		// 16-bit time can't reach it.
		let mut lines: Vec<Line> = outs
			.iter()
			.enumerate()
			.flat_map(|(track, out)| {
				out.lines.iter().enumerate().map(move |(packet, line)| Line {
					time: line.0,
					track,
					packet,
				})
			})
			.collect();
		lines.sort_by_key(|line| line.time);
		for line in lines {
			let at = clusters.partition_point(|cluster| cluster.time <= line.time);
			let target = if at == 0 {
				match clusters.first() {
					Some(first) if first.time - line.time <= 32768 => Some(0),
					_ => None,
				}
			} else if line.time - clusters[at - 1].time <= 32767 {
				Some(at - 1)
			} else {
				None
			};
			let index = match target {
				Some(index) => index,
				None => {
					clusters.insert(
						at,
						Cluster {
							source: None,
							time: line.time,
							items: Vec::new(),
							lines: Vec::new(),
							ops: Vec::new(),
							content: 0,
							offset: 0,
							cue_blocks: Vec::new(),
						},
					);
					at
				}
			};
			clusters[index].lines.push(line);
		}

		// The blocks of each cluster, lines slotted in by time.
		for cluster in &mut clusters {
			let mut content = uint(CLUSTER_TIMESTAMP, cluster.time.max(0) as u64).len() as u64;
			let mut pending = cluster.lines.iter().peekable();
			let mut ops: Vec<Op> = Vec::new();
			let add_line = |line: &Line, content: &mut u64, ops: &mut Vec<Op>, cues: &mut Vec<(i64, u64, u64)>| {
				let out = &outs[line.track];
				cues.push((line.time, out.number, *content));
				*content += block_size(out, line);
				ops.push(Op::Line(*line));
			};
			for item in &cluster.items {
				while let Some(line) = pending.next_if(|line| line.time < item.time) {
					add_line(line, &mut content, &mut ops, &mut cluster.cue_blocks);
				}
				if item.key && file.cues.is_none() {
					cluster.cue_blocks.push((item.time, video.unwrap_or(0), content));
				}
				content += item.to - item.from;
				match ops.last_mut() {
					Some(Op::Copy(_, to)) if *to == item.from => *to = item.to,
					_ => ops.push(Op::Copy(item.from, item.to)),
				}
			}
			for line in pending {
				add_line(line, &mut content, &mut ops, &mut cluster.cue_blocks);
			}
			cluster.ops = ops;
			cluster.content = content;
		}

		let tracks = rebuild_tracks(&mut r, &elements, plan, streams, &outs, &stream_of)?;
		let original_cues = match file.cues {
			Some((start, end)) => read_cues(&mut r, start, end, &copied)?,
			None => Vec::new(),
		};

		// Layout: SeekHead, Info, Tracks, Chapters, Attachments, Tags, Cues, then the clusters.
		let copied_ids = [INFO, CHAPTERS, ATTACHMENTS, TAGS];
		let given = plan.attachments.as_ref();
		let info = match (&plan.title, elements.get(&INFO)) {
			(Some(title), Some(&(from, to))) => Some(retitle_info(&mut r, from, to, title)?),
			_ => None,
		};
		let seek_ids: Vec<u32> = [INFO, TRACKS, CHAPTERS, ATTACHMENTS, TAGS, CUES]
			.into_iter()
			.filter(|&id| {
				id == TRACKS || id == CUES || (id == ATTACHMENTS && given.is_some()) || elements.contains_key(&id)
			})
			.collect();
		let seek_head_size = element(SEEK_HEAD, &seek_entries(&seek_ids, &[0; 6])).len() as u64;
		let mut offsets = Vec::new();
		let mut at = seek_head_size;
		for &id in &seek_ids {
			offsets.push(at);
			at += match id {
				TRACKS => tracks.len() as u64,
				CUES => cues_size(&original_cues, &clusters),
				ATTACHMENTS if given.is_some() => given.map_or(0, |bytes| bytes.len() as u64),
				INFO if info.is_some() => info.as_ref().map_or(0, |bytes| bytes.len() as u64),
				_ => elements.get(&id).map_or(0, |(from, to)| to - from),
			};
		}
		for cluster in &mut clusters {
			cluster.offset = at;
			at += header_length(CLUSTER, cluster.content) + cluster.content;
		}
		let segment_size = at;
		let by_source: HashMap<u64, u64> = clusters
			.iter()
			.filter_map(|c| c.source.map(|s| (s - file.segment_start, c.offset)))
			.collect();
		let cues = build_cues(&original_cues, &clusters, &by_source);
		let seek_head = element(SEEK_HEAD, &seek_entries(&seek_ids, &offsets));

		let mut pieces = vec![
			Piece::Bytes(ebml_header()),
			Piece::Bytes([id_bytes(SEGMENT), size8(segment_size)].concat()),
		];
		pieces.push(Piece::Bytes(seek_head));
		for &id in &seek_ids {
			match id {
				TRACKS => pieces.push(Piece::Bytes(tracks.clone())),
				CUES => pieces.push(Piece::Bytes(cues.clone())),
				ATTACHMENTS if given.is_some() => pieces.push(Piece::Bytes(given.cloned().unwrap_or_default())),
				INFO if info.is_some() => pieces.push(Piece::Bytes(info.clone().unwrap_or_default())),
				_ if copied_ids.contains(&id) => {
					if let Some(&(from, to)) = elements.get(&id) {
						pieces.push(Piece::Copy(from, to));
					}
				}
				_ => {}
			}
		}
		for index in 0..clusters.len() {
			pieces.push(Piece::Cluster(index));
		}
		let header = ebml_header().len() as u64 + 4 + 8;
		progress(1.0);
		Ok(Muxer {
			r,
			pieces,
			clusters,
			outs,
			next: 0,
			total: header + segment_size,
			written: 0,
		})
	}

	/// Size of the whole file, in bytes.
	pub fn total(&self) -> u64 {
		self.total
	}

	/// The next part of the file, at least `wanted` bytes unless it is the end; empty once done.
	pub fn next_chunk(&mut self, wanted: usize) -> io::Result<Vec<u8>> {
		let mut out = Vec::with_capacity(wanted + 64 * 1024);
		while out.len() < wanted && self.next < self.pieces.len() {
			match &self.pieces[self.next] {
				Piece::Bytes(bytes) => out.extend_from_slice(bytes),
				&Piece::Copy(from, to) => {
					skip_to(&mut self.r, from)?;
					out.extend(read_bytes(&mut self.r, to - from)?);
				}
				&Piece::Cluster(index) => {
					let cluster = &self.clusters[index];
					out.extend(id_bytes(CLUSTER));
					out.extend(size_bytes(cluster.content));
					let start = out.len();
					out.extend(uint(CLUSTER_TIMESTAMP, cluster.time.max(0) as u64));
					for op in &cluster.ops {
						match op {
							&Op::Copy(from, to) => {
								skip_to(&mut self.r, from)?;
								out.extend(read_bytes(&mut self.r, to - from)?);
							}
							Op::Line(line) => write_block(&self.outs[line.track], line, cluster.time, &mut out),
						}
					}
					if (out.len() - start) as u64 != cluster.content {
						return Err(invalid("cluster size changed while writing"));
					}
				}
			}
			self.next += 1;
		}
		self.written += out.len() as u64;
		Ok(out)
	}
}

/// The Info element between `from` and `to` with another title. Its checksum, if any, would no
/// longer match: it goes.
fn retitle_info<R: Read + Seek>(r: &mut R, from: u64, to: u64, title: &str) -> io::Result<Vec<u8>> {
	skip_to(r, from)?;
	let header = read_header(r)?;
	let end = header.end().min(to);
	let mut content = Vec::new();
	let mut position = header.start;
	while position < end {
		skip_to(r, position)?;
		let child = read_header(r)?;
		let child_end = child.end().min(end);
		if child.id != TITLE && child.id != CRC32 {
			skip_to(r, position)?;
			content.extend(read_bytes(r, child_end - position)?);
		}
		position = child_end;
	}
	if !title.is_empty() {
		content.extend(string(TITLE, title));
	}
	Ok(element(INFO, &content))
}

fn ebml_header() -> Vec<u8> {
	let content = [
		uint(0x4286, 1),
		uint(0x42F7, 1),
		uint(0x42F2, 4),
		uint(0x42F3, 8),
		string(0x4282, "matroska"),
		uint(0x4287, 4),
		uint(0x4285, 2),
	]
	.concat();
	element(mkv::EBML, &content)
}

fn seek_entries(ids: &[u32], offsets: &[u64]) -> Vec<u8> {
	ids.iter()
		.zip(offsets)
		.flat_map(|(&id, &offset)| {
			let content = [element(SEEK_ID, &id_bytes(id)), uint8(SEEK_POSITION, offset)].concat();
			element(SEEK, &content)
		})
		.collect()
}

/// The track list: kept tracks as they were, with the changes asked for, then the new ones.
fn rebuild_tracks<R: Read + Seek>(
	r: &mut R,
	elements: &HashMap<u32, (u64, u64)>,
	plan: &Plan,
	streams: &[Stream],
	outs: &[Out],
	stream_of: &[usize],
) -> io::Result<Vec<u8>> {
	let &(from, to) = elements.get(&TRACKS).ok_or_else(|| invalid("no track list"))?;
	skip_to(r, from)?;
	let tracks = read_header(r)?;
	let mut content = Vec::new();
	let mut entries: Vec<(u64, u64)> = Vec::new();
	walk(r, tracks.start, tracks.end().min(to), |_, position, entry| {
		if entry.id == TRACK_ENTRY {
			entries.push((position, entry.end()));
		}
		Ok(())
	})?;
	for (position, end) in entries {
		skip_to(r, position)?;
		let entry = read_header(r)?;
		let mut children: Vec<(u32, Vec<u8>)> = Vec::new();
		let mut number = 0;
		walk(r, entry.start, end, |r, at, field| {
			if field.id == TRACK_NUMBER {
				number = read_uint(r, field.size)?;
			}
			skip_to(r, at)?;
			children.push((field.id, read_bytes(r, field.end() - at)?));
			Ok(())
		})?;
		let choice = plan.choices.iter().find(|c| c.number == number);
		if choice.is_some_and(|c| !c.keep) {
			continue;
		}
		let stream = choice.and_then(|c| c.stream).and_then(|index| streams.get(index));
		let mut dropped = vec![CRC32, VOID];
		let mut extra = Vec::new();
		if let Some(c) = choice {
			if let Some(language) = &c.language {
				dropped.extend([LANGUAGE, LANGUAGE_BCP47]);
				extra.extend(string(LANGUAGE, language));
			}
			if let Some(name) = &c.name {
				dropped.push(NAME);
				if !name.is_empty() {
					extra.extend(string(NAME, name));
				}
			}
			if let Some(default) = c.default {
				dropped.push(FLAG_DEFAULT);
				extra.extend(uint(FLAG_DEFAULT, default as u64));
			}
			if let Some(forced) = c.forced {
				dropped.push(FLAG_FORCED);
				extra.extend(uint(FLAG_FORCED, forced as u64));
			}
		}
		if let Some(stream) = stream {
			// New lines are written plain: no compression, the codec setup that goes with them.
			dropped.extend([CODEC_ID, CODEC_PRIVATE, CONTENT_ENCODINGS]);
			extra.extend(string(CODEC_ID, &stream.codec));
			if !stream.private.is_empty() {
				extra.extend(element(CODEC_PRIVATE, &stream.private));
			}
		}
		let mut body: Vec<u8> = children
			.into_iter()
			.filter(|(id, _)| !dropped.contains(id))
			.flat_map(|(_, bytes)| bytes)
			.collect();
		body.extend(extra);
		content.extend(element(TRACK_ENTRY, &body));
	}
	let replaced = plan.choices.iter().filter(|c| c.keep && c.stream.is_some()).count();
	for (added, (out, &stream)) in plan.added.iter().zip(outs.iter().zip(stream_of).skip(replaced)) {
		let stream = &streams[stream];
		let mut body = [
			uint(TRACK_NUMBER, out.number),
			uint(TRACK_UID, added.uid.max(1)),
			uint(TRACK_TYPE, mkv::SUBTITLE_TRACK),
			uint(FLAG_LACING, 0),
			string(LANGUAGE, &added.language),
			uint(FLAG_DEFAULT, added.default as u64),
			uint(FLAG_FORCED, added.forced as u64),
			string(CODEC_ID, &stream.codec),
		]
		.concat();
		if !added.name.is_empty() {
			body.extend(string(NAME, &added.name));
		}
		if !stream.private.is_empty() {
			body.extend(element(CODEC_PRIVATE, &stream.private));
		}
		content.extend(element(TRACK_ENTRY, &body));
	}
	Ok(element(TRACKS, &content))
}

/// Index entries of the source for tracks copied as they are: time, track, cluster offset.
fn read_cues<R: Read + Seek>(
	r: &mut R,
	start: u64,
	end: u64,
	copied: &dyn Fn(u64) -> bool,
) -> io::Result<Vec<(u64, u64, u64)>> {
	let mut out = Vec::new();
	walk(r, start, end, |r, _, point| {
		if point.id != CUE_POINT {
			return Ok(());
		}
		let mut time = 0;
		let mut positions = Vec::new();
		walk(r, point.start, point.end(), |r, _, field| {
			match field.id {
				CUE_TIME => time = read_uint(r, field.size)?,
				CUE_TRACK_POSITIONS => {
					let mut track = 0;
					let mut cluster = None;
					walk(r, field.start, field.end(), |r, _, part| {
						match part.id {
							CUE_TRACK => track = read_uint(r, part.size)?,
							CUE_CLUSTER_POSITION => cluster = Some(read_uint(r, part.size)?),
							_ => {}
						}
						Ok(())
					})?;
					if let Some(cluster) = cluster {
						positions.push((track, cluster));
					}
				}
				_ => {}
			}
			Ok(())
		})?;
		for (track, cluster) in positions {
			if copied(track) {
				out.push((time, track, cluster));
			}
		}
		Ok(())
	})?;
	Ok(out)
}

/// One cue point per entry, with fixed-size positions so the index's size is known up front.
fn cue_point(time: u64, track: u64, cluster: u64, relative: Option<u64>) -> Vec<u8> {
	let mut positions = [uint(CUE_TRACK, track), uint8(CUE_CLUSTER_POSITION, cluster)].concat();
	if let Some(relative) = relative {
		positions.extend(uint8(CUE_RELATIVE_POSITION, relative));
	}
	element(
		CUE_POINT,
		&[uint(CUE_TIME, time), element(CUE_TRACK_POSITIONS, &positions)].concat(),
	)
}

fn cue_entries(
	original: &[(u64, u64, u64)],
	clusters: &[Cluster],
	by_source: Option<&HashMap<u64, u64>>,
) -> Vec<(u64, Vec<u8>)> {
	let mut points: Vec<(u64, Vec<u8>)> = Vec::new();
	for &(time, track, cluster) in original {
		let offset = match by_source {
			Some(map) => match map.get(&cluster) {
				Some(&offset) => offset,
				None => continue,
			},
			None => 0,
		};
		points.push((time, cue_point(time, track, offset, None)));
	}
	for cluster in clusters {
		// Relative positions count from the start of the cluster's content.
		for &(time, track, relative) in &cluster.cue_blocks {
			let time = time.max(0) as u64;
			points.push((time, cue_point(time, track, cluster.offset, Some(relative))));
		}
	}
	points.sort_by_key(|point| point.0);
	points
}

fn cues_size(original: &[(u64, u64, u64)], clusters: &[Cluster]) -> u64 {
	let content: u64 = cue_entries(original, clusters, None)
		.iter()
		.map(|(_, bytes)| bytes.len() as u64)
		.sum();
	header_length(CUES, content) + content
}

fn build_cues(original: &[(u64, u64, u64)], clusters: &[Cluster], by_source: &HashMap<u64, u64>) -> Vec<u8> {
	// Entries pointing at clusters that are gone are dropped: keep the size by padding.
	let expected = cues_size(original, clusters);
	let content: Vec<u8> = cue_entries(original, clusters, Some(by_source))
		.into_iter()
		.flat_map(|(_, bytes)| bytes)
		.collect();
	let mut cues = element(CUES, &content);
	let missing = expected.saturating_sub(cues.len() as u64);
	if missing > 0 {
		// A Void after the index fills what dropped entries left.
		cues.extend(void(missing));
	}
	cues
}

/// A Void element of exactly `total` bytes (at least 2).
fn void(total: u64) -> Vec<u8> {
	let length = (1..=8)
		.find(|&length| size_length(total.saturating_sub(1 + length as u64)) == length)
		.unwrap_or(8);
	let content = total.saturating_sub(1 + length as u64);
	let marked = content | (1u64 << (7 * length));
	let mut out = id_bytes(VOID);
	out.extend_from_slice(&marked.to_be_bytes()[8 - length..]);
	out.resize(total as usize, 0);
	out
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::ebml::write::{element as w_element, string as w_string, uint as w_uint};
	use std::io::Cursor;

	fn block(track: u8, timecode: i16, flags: u8, data: &[u8]) -> Vec<u8> {
		let mut out = vec![0x80 | track];
		out.extend(timecode.to_be_bytes());
		out.push(flags);
		out.extend_from_slice(data);
		out
	}

	/// Video on track 1, an SRT on track 2, two clusters, cues for the video.
	fn source() -> Vec<u8> {
		let entry = |number: u64, kind: u64, codec: &str| {
			w_element(
				TRACK_ENTRY,
				&[
					w_uint(TRACK_NUMBER, number),
					w_uint(TRACK_TYPE, kind),
					w_string(CODEC_ID, codec),
				]
				.concat(),
			)
		};
		let tracks = w_element(TRACKS, &[entry(1, 1, "V_VP9"), entry(2, 0x11, "S_TEXT/UTF8")].concat());
		let head = [w_element(INFO, &w_uint(mkv::TIMESTAMP_SCALE, 1_000_000)), tracks].concat();
		let cluster = |time: u64, text: &[u8]| {
			let group = w_element(
				BLOCK_GROUP,
				&[w_element(BLOCK, &block(2, 100, 0, text)), w_uint(BLOCK_DURATION, 500)].concat(),
			);
			w_element(
				CLUSTER,
				&[
					w_uint(CLUSTER_TIMESTAMP, time),
					w_element(SIMPLE_BLOCK, &block(1, 0, 0x80, &[0xAA; 300])),
					group,
					w_element(SIMPLE_BLOCK, &block(1, 40, 0, &[0xBB; 200])),
				]
				.concat(),
			)
		};
		let first = head.len() as u64;
		let one = cluster(0, b"Old one");
		let second = first + one.len() as u64;
		let two = cluster(5000, b"Old two");
		let point = |time: u64, at: u64| {
			w_element(
				CUE_POINT,
				&[
					w_uint(CUE_TIME, time),
					w_element(
						CUE_TRACK_POSITIONS,
						&[w_uint(CUE_TRACK, 1), w_uint(CUE_CLUSTER_POSITION, at)].concat(),
					),
				]
				.concat(),
			)
		};
		let cues = w_element(CUES, &[point(0, first), point(5000, second)].concat());
		let mut file = w_element(mkv::EBML, &w_string(0x4282, "webm"));
		file.extend(w_element(SEGMENT, &[head, one, two, cues].concat()));
		file
	}

	fn mux(bytes: Vec<u8>, plan: &Plan, streams: &[Stream]) -> Vec<u8> {
		let size = bytes.len() as u64;
		let mut muxer = Muxer::new(Cursor::new(bytes), size, plan, streams, &mut |_| {}).unwrap();
		let mut out = Vec::new();
		loop {
			let chunk = muxer.next_chunk(1000).unwrap();
			if chunk.is_empty() {
				break;
			}
			out.extend(chunk);
		}
		assert_eq!(out.len() as u64, muxer.total());
		out
	}

	fn lines(text: &[(f64, &str)]) -> Stream {
		Stream {
			codec: "S_TEXT/UTF8".into(),
			private: Vec::new(),
			packets: text
				.iter()
				.map(|&(start, text)| Packet {
					start_ms: start,
					duration_ms: Some(900.0),
					data: text.as_bytes().to_vec(),
				})
				.collect(),
		}
	}

	fn read_back(bytes: Vec<u8>, track: u64) -> Vec<(f64, String)> {
		let size = bytes.len() as u64;
		let mut cursor = Cursor::new(bytes);
		let file = mkv::probe(&mut cursor, size).unwrap();
		mkv::extract_many(&mut cursor, &file, &[track], &mut |_| {})
			.unwrap()
			.remove(0)
			.into_iter()
			.map(|p| (p.start_ms, String::from_utf8(p.data).unwrap()))
			.collect()
	}

	#[test]
	fn keeps_everything_when_nothing_changes() {
		let out = mux(source(), &Plan::default(), &[]);
		assert_eq!(
			read_back(out.clone(), 2),
			vec![(100.0, "Old one".into()), (5100.0, "Old two".into())]
		);
		let size = out.len() as u64;
		let file = mkv::probe(&mut Cursor::new(out), size).unwrap();
		assert_eq!(file.tracks.len(), 2);
		assert!(file.cues.is_some());
	}

	#[test]
	fn writes_given_attachments() {
		let font = [
			element(mkv::FILE_NAME, b"font.ttf"),
			element(mkv::FILE_MIME_TYPE, b"font/ttf"),
			element(mkv::FILE_DATA, b"glyphs"),
		]
		.concat();
		let plan = Plan {
			attachments: Some(attachments(&element(mkv::ATTACHED_FILE, &font))),
			..Plan::default()
		};
		let out = mux(source(), &plan, &[]);
		let size = out.len() as u64;
		let mut reader = Cursor::new(out);
		let file = mkv::probe(&mut reader, size).unwrap();
		assert_eq!(file.attachments.len(), 1);
		assert_eq!(file.attachments[0].name, "font.ttf");
		assert_eq!(mkv::attachment(&mut reader, &file.attachments[0]).unwrap(), b"glyphs");
		assert_eq!(read_back(reader.into_inner(), 2).len(), 2);
	}

	#[test]
	fn retitles_the_segment() {
		let plan = Plan {
			title: Some("Holiday".into()),
			..Plan::default()
		};
		let out = mux(source(), &plan, &[]);
		let size = out.len() as u64;
		let file = mkv::probe(&mut Cursor::new(out.clone()), size).unwrap();
		assert_eq!(file.timestamp_scale, 1_000_000);
		assert!(out.windows(7).any(|window| window == b"Holiday"));
		assert_eq!(read_back(out, 2).len(), 2);
	}

	#[test]
	fn replaces_adds_and_drops_tracks() {
		let plan = Plan {
			attachments: None,
			title: None,
			choices: vec![Choice {
				number: 2,
				keep: true,
				language: Some("fre".into()),
				stream: Some(0),
				..Choice::default()
			}],
			added: vec![Added {
				stream: 1,
				language: "eng".into(),
				name: "Added".into(),
				default: false,
				forced: true,
				uid: 42,
			}],
		};
		// A line far past the last cluster needs a cluster of its own.
		let streams = [
			lines(&[(2000.0, "New one"), (4000.0, "New two")]),
			lines(&[(50.0, "Early"), (90_000.0, "Late")]),
		];
		let out = mux(source(), &plan, &streams);
		assert_eq!(
			read_back(out.clone(), 2),
			vec![(2000.0, "New one".into()), (4000.0, "New two".into())]
		);
		assert_eq!(
			read_back(out.clone(), 3),
			vec![(50.0, "Early".into()), (90_000.0, "Late".into())]
		);
		let size = out.len() as u64;
		let file = mkv::probe(&mut Cursor::new(out.clone()), size).unwrap();
		let added = file.tracks.iter().find(|t| t.number == 3).unwrap();
		assert_eq!(
			(added.language.as_str(), added.name.as_str(), added.forced),
			("eng", "Added", true)
		);
		assert_eq!(file.tracks.iter().find(|t| t.number == 2).unwrap().language, "fre");
		// The video is still all there.
		assert_eq!(
			out.windows(300).filter(|w| w.iter().all(|&b| b == 0xAA)).count() > 0,
			true
		);

		let dropped = Plan {
			attachments: None,
			title: None,
			choices: vec![Choice {
				number: 2,
				keep: false,
				..Choice::default()
			}],
			added: Vec::new(),
		};
		let out = mux(source(), &dropped, &[]);
		let size = out.len() as u64;
		let file = mkv::probe(&mut Cursor::new(out), size).unwrap();
		assert_eq!(file.tracks.len(), 1);
	}
}
