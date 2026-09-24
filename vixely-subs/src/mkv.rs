//! Subtitle tracks and attachments of Matroska and WebM files.
//!
//! Only what subtitles need is read: the track list, the attached fonts, and the blocks of one
//! track. Muxers (mkvmerge, FFmpeg) index every subtitle block in the Cues, so when the index
//! covers the track only those blocks are read, a few kilobytes of a film of several gigabytes.
//! Otherwise the clusters are walked, skipping the content of other tracks' blocks.

use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Seek};

use crate::ebml::{Header, UNKNOWN, read_bytes, read_float, read_header, read_string, read_uint, read_vint, skip_to};

pub(crate) const EBML: u32 = 0x1A45_DFA3;
pub(crate) const SEGMENT: u32 = 0x1853_8067;
pub(crate) const SEEK_HEAD: u32 = 0x114D_9B74;
pub(crate) const SEEK: u32 = 0x4DBB;
pub(crate) const SEEK_ID: u32 = 0x53AB;
pub(crate) const SEEK_POSITION: u32 = 0x53AC;
pub(crate) const INFO: u32 = 0x1549_A966;
pub(crate) const TIMESTAMP_SCALE: u32 = 0x2A_D7B1;
pub(crate) const DURATION: u32 = 0x4489;
pub(crate) const TRACKS: u32 = 0x1654_AE6B;
pub(crate) const TRACK_ENTRY: u32 = 0xAE;
pub(crate) const TRACK_NUMBER: u32 = 0xD7;
pub(crate) const TRACK_TYPE: u32 = 0x83;
pub(crate) const CODEC_ID: u32 = 0x86;
pub(crate) const CODEC_PRIVATE: u32 = 0x63A2;
pub(crate) const LANGUAGE: u32 = 0x22_B59C;
pub(crate) const LANGUAGE_BCP47: u32 = 0x22_B59D;
pub(crate) const NAME: u32 = 0x536E;
pub(crate) const FLAG_DEFAULT: u32 = 0x88;
pub(crate) const FLAG_FORCED: u32 = 0x55AA;
pub(crate) const CONTENT_ENCODINGS: u32 = 0x6D80;
pub(crate) const CONTENT_ENCODING: u32 = 0x6240;
pub(crate) const CONTENT_ENCODING_TYPE: u32 = 0x5033;
pub(crate) const CONTENT_COMPRESSION: u32 = 0x5034;
pub(crate) const CONTENT_COMP_ALGO: u32 = 0x4254;
pub(crate) const CONTENT_COMP_SETTINGS: u32 = 0x4255;
pub(crate) const ATTACHMENTS: u32 = 0x1941_A469;
pub(crate) const ATTACHED_FILE: u32 = 0x61A7;
pub(crate) const FILE_NAME: u32 = 0x466E;
pub(crate) const FILE_MIME_TYPE: u32 = 0x4660;
pub(crate) const FILE_DATA: u32 = 0x465C;
pub(crate) const CLUSTER: u32 = 0x1F43_B675;
pub(crate) const CLUSTER_TIMESTAMP: u32 = 0xE7;
pub(crate) const SIMPLE_BLOCK: u32 = 0xA3;
pub(crate) const BLOCK_GROUP: u32 = 0xA0;
pub(crate) const BLOCK: u32 = 0xA1;
pub(crate) const BLOCK_DURATION: u32 = 0x9B;
pub(crate) const CUES: u32 = 0x1C53_BB6B;
pub(crate) const CUE_POINT: u32 = 0xBB;
pub(crate) const CUE_TRACK_POSITIONS: u32 = 0xB7;
pub(crate) const CUE_TRACK: u32 = 0xF7;
pub(crate) const CUE_CLUSTER_POSITION: u32 = 0xF1;
pub(crate) const CUE_RELATIVE_POSITION: u32 = 0xF0;
pub(crate) const TAGS: u32 = 0x1254_C367;
pub(crate) const CHAPTERS: u32 = 0x1043_A770;

/// Elements found directly in the segment: in a cluster of unknown size, one of them ends it.
pub(crate) const TOP_LEVEL: [u32; 8] = [CLUSTER, CUES, TAGS, CHAPTERS, ATTACHMENTS, SEEK_HEAD, INFO, TRACKS];

/// Matroska track type of subtitles.
pub const SUBTITLE_TRACK: u64 = 0x11;

#[derive(Clone, Debug, PartialEq)]
pub enum Compression {
	Zlib,
	/// Bytes removed from the start of every block, to put back.
	Strip(Vec<u8>),
	/// bzip2, LZO or encryption: not supported.
	Other,
}

#[derive(Clone, Debug, Default)]
pub struct Track {
	pub number: u64,
	pub kind: u64,
	pub codec: String,
	pub private: Vec<u8>,
	pub language: String,
	pub name: String,
	pub default: bool,
	pub forced: bool,
	pub compression: Option<Compression>,
}

#[derive(Clone, Debug)]
pub struct Attachment {
	pub name: String,
	pub mime: String,
	pub offset: u64,
	pub size: u64,
}

#[derive(Debug)]
pub struct Matroska {
	pub timestamp_scale: u64,
	pub duration_ms: Option<f64>,
	pub tracks: Vec<Track>,
	pub attachments: Vec<Attachment>,
	pub(crate) segment_start: u64,
	pub(crate) segment_end: u64,
	pub(crate) first_cluster: Option<u64>,
	pub(crate) cues: Option<(u64, u64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Packet {
	pub start_ms: f64,
	pub duration_ms: Option<f64>,
	pub data: Vec<u8>,
}

pub(crate) fn invalid(message: &str) -> io::Error {
	io::Error::new(io::ErrorKind::InvalidData, message.to_string())
}

/// Calls `f` for each child element between `start` and `end`.
pub(crate) fn children<R: Read + Seek>(
	r: &mut R,
	start: u64,
	end: u64,
	mut f: impl FnMut(&mut R, &Header) -> io::Result<()>,
) -> io::Result<()> {
	let mut position = start;
	while position < end {
		skip_to(r, position)?;
		let header = match read_header(r) {
			Ok(header) => header,
			Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
			Err(error) => return Err(error),
		};
		f(r, &header)?;
		if header.size == UNKNOWN {
			break;
		}
		position = header.end();
	}
	Ok(())
}

/// Whether a file starts like Matroska or WebM.
pub fn is_matroska(head: &[u8]) -> bool {
	head.starts_with(&[0x1A, 0x45, 0xDF, 0xA3])
}

/// Reads the track list, the attachments and where things are. Nothing of the clusters is read.
pub fn probe<R: Read + Seek>(r: &mut R, file_size: u64) -> io::Result<Matroska> {
	skip_to(r, 0)?;
	let header = read_header(r)?;
	if header.id != EBML || header.size == UNKNOWN {
		return Err(invalid("not a Matroska file"));
	}
	skip_to(r, header.end())?;
	let segment = read_header(r)?;
	if segment.id != SEGMENT {
		return Err(invalid("no Matroska segment"));
	}
	let segment_end = segment.end().min(file_size);
	let mut file = Matroska {
		timestamp_scale: 1_000_000,
		duration_ms: None,
		tracks: Vec::new(),
		attachments: Vec::new(),
		segment_start: segment.start,
		segment_end,
		first_cluster: None,
		cues: None,
	};
	let mut seeks: Vec<(u32, u64)> = Vec::new();
	let mut seen: Vec<u32> = Vec::new();
	let mut position = segment.start;
	while position < segment_end {
		skip_to(r, position)?;
		let Ok(element) = read_header(r) else { break };
		if element.id == CLUSTER {
			file.first_cluster = Some(position);
			break;
		}
		read_top_level(r, &element, &mut file, &mut seeks)?;
		seen.push(element.id);
		if element.size == UNKNOWN {
			break;
		}
		position = element.end();
	}
	// Tracks, attachments and cues written after the clusters are found through the seek head.
	for (id, offset) in seeks {
		if seen.contains(&id) || ![TRACKS, ATTACHMENTS, CUES, INFO].contains(&id) {
			continue;
		}
		let at = file.segment_start + offset;
		if at >= file_size {
			continue;
		}
		skip_to(r, at)?;
		let Ok(element) = read_header(r) else { continue };
		if element.id == id {
			read_top_level(r, &element, &mut file, &mut Vec::new())?;
			seen.push(id);
		}
	}
	Ok(file)
}

fn read_top_level<R: Read + Seek>(
	r: &mut R,
	element: &Header,
	file: &mut Matroska,
	seeks: &mut Vec<(u32, u64)>,
) -> io::Result<()> {
	let end = element.end().min(file.segment_end);
	match element.id {
		SEEK_HEAD => children(r, element.start, end, |r, seek| {
			if seek.id != SEEK {
				return Ok(());
			}
			let mut id = 0u32;
			let mut offset = None;
			children(r, seek.start, seek.end(), |r, field| {
				match field.id {
					SEEK_ID => id = read_uint(r, field.size)? as u32,
					SEEK_POSITION => offset = Some(read_uint(r, field.size)?),
					_ => {}
				}
				Ok(())
			})?;
			if let Some(offset) = offset {
				seeks.push((id, offset));
			}
			Ok(())
		}),
		INFO => children(r, element.start, end, |r, field| {
			match field.id {
				TIMESTAMP_SCALE => file.timestamp_scale = read_uint(r, field.size)?.max(1),
				DURATION => file.duration_ms = Some(read_float(r, field.size)?),
				_ => {}
			}
			Ok(())
		})
		.map(|()| {
			// Duration is counted in timestamp units.
			if let Some(duration) = file.duration_ms.as_mut() {
				*duration *= file.timestamp_scale as f64 / 1e6;
			}
		}),
		TRACKS => children(r, element.start, end, |r, entry| {
			if entry.id == TRACK_ENTRY {
				file.tracks.push(read_track(r, entry)?);
			}
			Ok(())
		}),
		ATTACHMENTS => children(r, element.start, end, |r, attached| {
			if attached.id != ATTACHED_FILE {
				return Ok(());
			}
			let mut attachment = Attachment {
				name: String::new(),
				mime: String::new(),
				offset: 0,
				size: 0,
			};
			children(r, attached.start, attached.end(), |r, field| {
				match field.id {
					FILE_NAME => attachment.name = read_string(r, field.size)?,
					FILE_MIME_TYPE => attachment.mime = read_string(r, field.size)?,
					FILE_DATA => {
						attachment.offset = field.start;
						attachment.size = field.size;
					}
					_ => {}
				}
				Ok(())
			})?;
			file.attachments.push(attachment);
			Ok(())
		}),
		CUES => {
			file.cues = Some((element.start, end));
			Ok(())
		}
		_ => Ok(()),
	}
}

fn read_track<R: Read + Seek>(r: &mut R, entry: &Header) -> io::Result<Track> {
	// Defaults from the specification: tracks are default unless said otherwise, in English.
	let mut track = Track {
		default: true,
		language: "eng".into(),
		..Track::default()
	};
	let mut bcp47 = None;
	children(r, entry.start, entry.end(), |r, field| {
		match field.id {
			TRACK_NUMBER => track.number = read_uint(r, field.size)?,
			TRACK_TYPE => track.kind = read_uint(r, field.size)?,
			CODEC_ID => track.codec = read_string(r, field.size)?,
			CODEC_PRIVATE => track.private = read_bytes(r, field.size)?,
			LANGUAGE => track.language = read_string(r, field.size)?,
			LANGUAGE_BCP47 => bcp47 = Some(read_string(r, field.size)?),
			NAME => track.name = read_string(r, field.size)?,
			FLAG_DEFAULT => track.default = read_uint(r, field.size)? != 0,
			FLAG_FORCED => track.forced = read_uint(r, field.size)? != 0,
			CONTENT_ENCODINGS => track.compression = read_encodings(r, field)?,
			_ => {}
		}
		Ok(())
	})?;
	if let Some(language) = bcp47 {
		track.language = language;
	}
	Ok(track)
}

fn read_encodings<R: Read + Seek>(r: &mut R, encodings: &Header) -> io::Result<Option<Compression>> {
	let mut found = None;
	children(r, encodings.start, encodings.end(), |r, encoding| {
		if encoding.id != CONTENT_ENCODING {
			return Ok(());
		}
		let mut kind = 0;
		let mut algorithm = 0;
		let mut settings = Vec::new();
		children(r, encoding.start, encoding.end(), |r, field| {
			match field.id {
				CONTENT_ENCODING_TYPE => kind = read_uint(r, field.size)?,
				CONTENT_COMPRESSION => children(r, field.start, field.end(), |r, part| {
					match part.id {
						CONTENT_COMP_ALGO => algorithm = read_uint(r, part.size)?,
						CONTENT_COMP_SETTINGS => settings = read_bytes(r, part.size)?,
						_ => {}
					}
					Ok(())
				})?,
				_ => {}
			}
			Ok(())
		})?;
		found = Some(match (kind, algorithm) {
			(0, 0) => Compression::Zlib,
			(0, 3) => Compression::Strip(settings),
			_ => Compression::Other,
		});
		Ok(())
	})?;
	Ok(found)
}

/// The content of an attached file, such as a font.
pub fn attachment<R: Read + Seek>(r: &mut R, attachment: &Attachment) -> io::Result<Vec<u8>> {
	skip_to(r, attachment.offset)?;
	read_bytes(r, attachment.size)
}

/// Where the cues say the blocks of each wanted track are: cluster offsets in the segment, and the
/// block offset in the cluster when written. Tracks the cues don't mention get no entry.
fn cue_positions<R: Read + Seek>(
	r: &mut R,
	file: &Matroska,
	tracks: &[u64],
) -> io::Result<HashMap<u64, Vec<(u64, Option<u64>)>>> {
	let mut positions: HashMap<u64, Vec<(u64, Option<u64>)>> = HashMap::new();
	let Some((start, end)) = file.cues else {
		return Ok(positions);
	};
	children(r, start, end, |r, point| {
		if point.id != CUE_POINT {
			return Ok(());
		}
		children(r, point.start, point.end(), |r, entry| {
			if entry.id != CUE_TRACK_POSITIONS {
				return Ok(());
			}
			let mut number = 0;
			let mut cluster = None;
			let mut relative = None;
			children(r, entry.start, entry.end(), |r, field| {
				match field.id {
					CUE_TRACK => number = read_uint(r, field.size)?,
					CUE_CLUSTER_POSITION => cluster = Some(read_uint(r, field.size)?),
					CUE_RELATIVE_POSITION => relative = Some(read_uint(r, field.size)?),
					_ => {}
				}
				Ok(())
			})?;
			if let (true, Some(cluster)) = (tracks.contains(&number), cluster) {
				positions.entry(number).or_default().push((cluster, relative));
			}
			Ok(())
		})
	})?;
	Ok(positions)
}

struct Reader<'a> {
	file: &'a Matroska,
	tracks: Vec<&'a Track>,
	/// Blocks of each track, in the order of `tracks`.
	packets: Vec<Vec<Packet>>,
	/// Blocks already read, by position: cues can lead to the same block twice.
	seen: HashSet<u64>,
}

impl Reader<'_> {
	fn to_ms(&self, units: i64) -> f64 {
		units as f64 * self.file.timestamp_scale as f64 / 1e6
	}

	fn decode(track: &Track, data: Vec<u8>) -> io::Result<Vec<u8>> {
		match &track.compression {
			None => Ok(data),
			Some(Compression::Zlib) => miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(&data, 64 << 20)
				.map_err(|_| invalid("corrupt compressed block")),
			Some(Compression::Strip(prefix)) => {
				let mut out = prefix.clone();
				out.extend(data);
				Ok(out)
			}
			Some(Compression::Other) => Err(invalid("unsupported track compression")),
		}
	}

	/// Reads a block if it belongs to a wanted track: which one, its time relative to the cluster,
	/// and its data.
	fn block<R: Read + Seek>(&mut self, r: &mut R, block: &Header) -> io::Result<Option<(usize, i16, Vec<u8>)>> {
		let (number, length) = read_vint(r)?;
		let Some(index) = self.tracks.iter().position(|track| track.number == number) else {
			return Ok(None);
		};
		if block.size < length as u64 + 3 {
			return Ok(None);
		}
		let rest = read_bytes(r, block.size - length as u64)?;
		let timecode = i16::from_be_bytes([rest[0], rest[1]]);
		Ok(Some((index, timecode, rest[3..].to_vec())))
	}

	/// A SimpleBlock or a BlockGroup of the cluster whose timestamp is `cluster_time`.
	fn element<R: Read + Seek>(&mut self, r: &mut R, element: &Header, cluster_time: u64) -> io::Result<()> {
		if !matches!(element.id, SIMPLE_BLOCK | BLOCK_GROUP) || !self.seen.insert(element.start) {
			return Ok(());
		}
		let (found, duration) = if element.id == SIMPLE_BLOCK {
			(self.block(r, element)?, None)
		} else {
			let mut found = None;
			let mut duration = None;
			let mut other_track = false;
			children(r, element.start, element.end(), |r, field| {
				if other_track {
					return Ok(());
				}
				match field.id {
					BLOCK => {
						found = self.block(r, field)?;
						other_track = found.is_none();
					}
					BLOCK_DURATION => duration = Some(read_uint(r, field.size)?),
					_ => {}
				}
				Ok(())
			})?;
			(found, duration)
		};
		if let Some((index, timecode, data)) = found {
			let start_ms = self.to_ms(cluster_time as i64 + timecode as i64);
			let duration_ms = duration.map(|d| self.to_ms(d as i64));
			let data = Self::decode(self.tracks[index], data)?;
			self.packets[index].push(Packet {
				start_ms,
				duration_ms,
				data,
			});
		}
		Ok(())
	}

	/// Walks a cluster; returns where the next top-level element starts.
	fn cluster<R: Read + Seek>(&mut self, r: &mut R, cluster: &Header) -> io::Result<u64> {
		let end = if cluster.size == UNKNOWN {
			self.file.segment_end
		} else {
			cluster.end()
		};
		let mut time = 0;
		let mut position = cluster.start;
		while position < end {
			skip_to(r, position)?;
			let element = match read_header(r) {
				Ok(element) => element,
				Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(end),
				Err(error) => return Err(error),
			};
			if cluster.size == UNKNOWN && TOP_LEVEL.contains(&element.id) {
				return Ok(position);
			}
			if element.id == CLUSTER_TIMESTAMP {
				time = read_uint(r, element.size)?;
			} else {
				self.element(r, &element, time)?;
			}
			if element.size == UNKNOWN {
				return Ok(end);
			}
			position = element.end();
		}
		Ok(end)
	}

	/// Reads the blocks the cues point to. Returns false when they can't be used.
	fn from_cues<R: Read + Seek>(
		&mut self,
		r: &mut R,
		positions: &[(u64, Option<u64>)],
		progress: &mut dyn FnMut(f64),
	) -> io::Result<bool> {
		let mut scanned = HashSet::new();
		for (index, &(cluster_offset, relative)) in positions.iter().enumerate() {
			if index % 64 == 0 {
				progress(index as f64 / positions.len() as f64);
			}
			if scanned.contains(&cluster_offset) {
				continue;
			}
			skip_to(r, self.file.segment_start + cluster_offset)?;
			let cluster = read_header(r)?;
			if cluster.id != CLUSTER {
				return Ok(false);
			}
			match relative {
				Some(relative) => {
					// The cluster timestamp comes first in the cluster.
					let mut time = None;
					children(r, cluster.start, cluster.start + 64, |r, field| {
						if field.id == CLUSTER_TIMESTAMP && time.is_none() {
							time = Some(read_uint(r, field.size)?);
						}
						Ok(())
					})?;
					let Some(time) = time else { return Ok(false) };
					skip_to(r, cluster.start + relative)?;
					let element = read_header(r)?;
					self.element(r, &element, time)?;
				}
				None => {
					scanned.insert(cluster_offset);
					self.cluster(r, &cluster)?;
				}
			}
		}
		Ok(true)
	}

	/// Walks every cluster of the file.
	fn scan<R: Read + Seek>(&mut self, r: &mut R, progress: &mut dyn FnMut(f64)) -> io::Result<()> {
		let file = self.file;
		let mut position = file.first_cluster.unwrap_or(file.segment_end);
		let span = (file.segment_end - position).max(1) as f64;
		let first = position;
		while position < file.segment_end {
			skip_to(r, position)?;
			let Ok(element) = read_header(r) else { break };
			let next = if element.id == CLUSTER {
				self.cluster(r, &element)?
			} else if element.size == UNKNOWN {
				break;
			} else {
				element.end()
			};
			if next <= position {
				break;
			}
			position = next;
			progress((position - first) as f64 / span);
		}
		Ok(())
	}
}

/// Every block of several subtitle tracks, read in one pass, each track's in file order (PGS
/// segments of one display set carry different times). `progress` receives the share done, 0 to 1.
pub fn extract_many<R: Read + Seek>(
	r: &mut R,
	file: &Matroska,
	track_numbers: &[u64],
	progress: &mut dyn FnMut(f64),
) -> io::Result<Vec<Vec<Packet>>> {
	let tracks = track_numbers
		.iter()
		.map(|&number| {
			file.tracks
				.iter()
				.find(|t| t.number == number)
				.ok_or_else(|| invalid("no such track"))
		})
		.collect::<io::Result<Vec<_>>>()?;
	let mut reader = Reader {
		file,
		packets: vec![Vec::new(); tracks.len()],
		tracks,
		seen: HashSet::new(),
	};
	// The cues are used when they list every wanted track; otherwise the whole file is walked once.
	let by_track = cue_positions(r, file, track_numbers)?;
	let indexed = track_numbers.iter().all(|number| by_track.contains_key(number));
	let mut positions: Vec<_> = by_track.into_values().flatten().collect();
	positions.sort_unstable();
	positions.dedup();
	let found = indexed
		&& reader.from_cues(r, &positions, progress)?
		&& reader.packets.iter().all(|packets| !packets.is_empty());
	if !found {
		reader.packets.iter_mut().for_each(Vec::clear);
		reader.seen.clear();
		reader.scan(r, progress)?;
	}
	progress(1.0);
	Ok(reader.packets)
}

/// Every block of one subtitle track.
#[cfg(test)]
pub fn extract<R: Read + Seek>(
	r: &mut R,
	file: &Matroska,
	track_number: u64,
	progress: &mut dyn FnMut(f64),
) -> io::Result<Vec<Packet>> {
	Ok(extract_many(r, file, &[track_number], progress)?.swap_remove(0))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::ebml::write::*;
	use std::io::Cursor;

	fn block(track: u8, timecode: i16, data: &[u8]) -> Vec<u8> {
		let mut out = vec![0x80 | track];
		out.extend(timecode.to_be_bytes());
		out.push(0);
		out.extend_from_slice(data);
		out
	}

	fn group(track: u8, timecode: i16, duration: u64, data: &[u8]) -> Vec<u8> {
		let mut content = element(BLOCK, &block(track, timecode, data));
		content.extend(uint(BLOCK_DURATION, duration));
		element(BLOCK_GROUP, &content)
	}

	/// A file with a video track, an SRT track (zlib-compressed when asked), a font, two clusters,
	/// and cues pointing at the subtitle blocks when asked.
	fn sample(compressed: bool, with_cues: bool) -> Vec<u8> {
		let mut subtitle = [
			uint(TRACK_NUMBER, 2),
			uint(TRACK_TYPE, SUBTITLE_TRACK),
			string(CODEC_ID, "S_TEXT/UTF8"),
			string(LANGUAGE, "fre"),
			string(NAME, "Français"),
			uint(FLAG_DEFAULT, 0),
			uint(FLAG_FORCED, 1),
		]
		.concat();
		if compressed {
			let compression = element(CONTENT_COMPRESSION, &uint(CONTENT_COMP_ALGO, 0));
			subtitle.extend(element(CONTENT_ENCODINGS, &element(CONTENT_ENCODING, &compression)));
		}
		let video_track = [uint(TRACK_NUMBER, 1), uint(TRACK_TYPE, 1), string(CODEC_ID, "V_VP9")].concat();
		let tracks = element(
			TRACKS,
			&[element(TRACK_ENTRY, &video_track), element(TRACK_ENTRY, &subtitle)].concat(),
		);
		let font = [
			string(FILE_NAME, "font.ttf"),
			string(FILE_MIME_TYPE, "font/ttf"),
			element(FILE_DATA, b"FONTDATA"),
		];
		let attachments = element(ATTACHMENTS, &element(ATTACHED_FILE, &font.concat()));
		let text = |s: &str| {
			if compressed {
				miniz_oxide::deflate::compress_to_vec_zlib(s.as_bytes(), 6)
			} else {
				s.as_bytes().to_vec()
			}
		};
		let video = element(SIMPLE_BLOCK, &block(1, 0, &[0xAB; 5000]));
		let cluster = |time: u64, group: Vec<u8>| {
			let lead = [uint(CLUSTER_TIMESTAMP, time), video.clone()].concat();
			(
				element(CLUSTER, &[lead.clone(), group, video.clone()].concat()),
				lead.len() as u64,
			)
		};
		let (cluster1, relative1) = cluster(0, group(2, 1000, 1500, &text("Bonjour")));
		let (cluster2, relative2) = cluster(5000, group(2, 250, 2000, &text("<i>Au revoir</i>")));
		let head = [element(INFO, &uint(TIMESTAMP_SCALE, 1_000_000)), tracks, attachments].concat();
		let first = head.len() as u64;
		let second = first + cluster1.len() as u64;
		let mut segment = [head, cluster1, cluster2].concat();
		if with_cues {
			let point = |time: u64, cluster: u64, relative: u64| {
				let position = [
					uint(CUE_TRACK, 2),
					uint(CUE_CLUSTER_POSITION, cluster),
					uint(CUE_RELATIVE_POSITION, relative),
				];
				element(
					CUE_POINT,
					&[uint(0xB3, time), element(CUE_TRACK_POSITIONS, &position.concat())].concat(),
				)
			};
			segment.extend(element(
				CUES,
				&[point(1000, first, relative1), point(5250, second, relative2)].concat(),
			));
		}
		let mut file = element(EBML, &string(0x4282, "matroska"));
		file.extend(element(SEGMENT, &segment));
		file
	}

	fn run(bytes: Vec<u8>) -> (Matroska, Vec<Packet>, Vec<u8>) {
		let size = bytes.len() as u64;
		let mut cursor = Cursor::new(bytes);
		let file = probe(&mut cursor, size).unwrap();
		let packets = extract(&mut cursor, &file, 2, &mut |_| {}).unwrap();
		let font = attachment(&mut cursor, &file.attachments[0]).unwrap();
		(file, packets, font)
	}

	#[test]
	fn reads_tracks_blocks_and_fonts() {
		for (compressed, cues) in [(false, false), (true, false), (false, true), (true, true)] {
			let (file, packets, font) = run(sample(compressed, cues));
			let track = &file.tracks[1];
			assert_eq!(
				(track.codec.as_str(), track.language.as_str(), track.name.as_str()),
				("S_TEXT/UTF8", "fre", "Français")
			);
			assert!(!track.default && track.forced);
			assert_eq!(file.attachments[0].name, "font.ttf");
			assert_eq!(font, b"FONTDATA");
			assert_eq!(packets.len(), 2, "compressed {compressed} cues {cues}");
			assert_eq!(
				packets[0],
				Packet {
					start_ms: 1000.0,
					duration_ms: Some(1500.0),
					data: b"Bonjour".to_vec()
				}
			);
			assert_eq!(packets[1].start_ms, 5250.0);
			assert_eq!(packets[1].data, b"<i>Au revoir</i>");
		}
	}

	/// Two subtitle tracks sharing clusters, with cues for both, for one, or none.
	fn two_tracks(cued: &[u64]) -> Vec<u8> {
		let entry = |number: u64, language: &str| {
			let fields = [
				uint(TRACK_NUMBER, number),
				uint(TRACK_TYPE, SUBTITLE_TRACK),
				string(CODEC_ID, "S_TEXT/UTF8"),
				string(LANGUAGE, language),
			];
			element(TRACK_ENTRY, &fields.concat())
		};
		let tracks = element(TRACKS, &[entry(2, "fre"), entry(3, "eng")].concat());
		let head = [element(INFO, &uint(TIMESTAMP_SCALE, 1_000_000)), tracks].concat();
		let lead = uint(CLUSTER_TIMESTAMP, 0);
		let first = group(2, 100, 900, b"Un");
		let second = group(3, 100, 900, b"One");
		let relative = [lead.len() as u64, (lead.len() + first.len()) as u64];
		let cluster = element(CLUSTER, &[lead, first, second].concat());
		let mut segment = [head.clone(), cluster].concat();
		let points: Vec<u8> = cued
			.iter()
			.map(|&track| {
				let position = [
					uint(CUE_TRACK, track),
					uint(CUE_CLUSTER_POSITION, head.len() as u64),
					uint(CUE_RELATIVE_POSITION, relative[track as usize - 2]),
				];
				element(
					CUE_POINT,
					&[uint(0xB3, 100), element(CUE_TRACK_POSITIONS, &position.concat())].concat(),
				)
			})
			.collect::<Vec<_>>()
			.concat();
		if !points.is_empty() {
			segment.extend(element(CUES, &points));
		}
		let mut file = element(EBML, &string(0x4282, "matroska"));
		file.extend(element(SEGMENT, &segment));
		file
	}

	#[test]
	fn reads_several_tracks_in_one_pass() {
		for cued in [&[2, 3][..], &[2], &[]] {
			let bytes = two_tracks(cued);
			let size = bytes.len() as u64;
			let mut cursor = Cursor::new(bytes);
			let file = probe(&mut cursor, size).unwrap();
			let packets = extract_many(&mut cursor, &file, &[3, 2], &mut |_| {}).unwrap();
			let texts: Vec<Vec<&[u8]>> = packets
				.iter()
				.map(|track| track.iter().map(|p| p.data.as_slice()).collect())
				.collect();
			assert_eq!(texts, vec![vec![&b"One"[..]], vec![&b"Un"[..]]], "cued {cued:?}");
		}
	}

	#[test]
	fn rejects_other_files() {
		let mut cursor = Cursor::new(b"not a matroska file at all".to_vec());
		assert!(probe(&mut cursor, 26).is_err());
		assert!(is_matroska(&crate::ebml::write::id(EBML)));
	}
}
