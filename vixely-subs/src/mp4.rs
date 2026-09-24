//! Subtitle tracks of MP4 and QuickTime files: 3GPP timed text (`tx3g`, what phones and
//! HandBrake write), QuickTime text, and WebVTT in MP4 (`wvtt`). The track tables in `moov` say
//! where every sample is, so only the subtitle samples are read.

use std::io::{self, Read, Seek, SeekFrom};

use crate::mkv::Packet;

#[derive(Clone, Debug, Default)]
pub struct Sample {
	pub offset: u64,
	pub size: u32,
	pub start: u64,
	pub duration: u32,
}

#[derive(Clone, Debug, Default)]
pub struct Mp4Track {
	pub id: u32,
	/// Sample entry type: `tx3g`, `text`, `wvtt`, `stpp`, `c608`…
	pub codec: String,
	pub handler: String,
	pub language: String,
	pub name: String,
	pub enabled: bool,
	timescale: u32,
	/// Milliseconds added to every sample, from an edit list that starts with an empty edit.
	delay_ms: f64,
	pub samples: Vec<Sample>,
}

#[derive(Debug, Default)]
pub struct Mp4 {
	pub tracks: Vec<Mp4Track>,
	/// Fragmented files keep their samples in `moof` boxes, which are not read.
	pub fragmented: bool,
}

fn invalid(message: &str) -> io::Error {
	io::Error::new(io::ErrorKind::InvalidData, message.to_string())
}

/// Whether a file starts like MP4 or QuickTime.
pub fn is_mp4(head: &[u8]) -> bool {
	head.len() >= 8 && matches!(&head[4..8], b"ftyp" | b"moov" | b"mdat" | b"free" | b"wide" | b"skip")
}

/// A box inside a byte slice: its type and content.
struct Boxes<'a> {
	data: &'a [u8],
}

impl<'a> Iterator for Boxes<'a> {
	type Item = ([u8; 4], &'a [u8]);

	fn next(&mut self) -> Option<Self::Item> {
		if self.data.len() < 8 {
			return None;
		}
		let size = u32::from_be_bytes(self.data[0..4].try_into().ok()?) as u64;
		let kind: [u8; 4] = self.data[4..8].try_into().ok()?;
		let (header, size) = match size {
			0 => (8, self.data.len() as u64),
			1 => (16, u64::from_be_bytes(self.data.get(8..16)?.try_into().ok()?)),
			n => (8, n),
		};
		if size < header || size > self.data.len() as u64 {
			self.data = &[];
			return None;
		}
		let content = &self.data[header as usize..size as usize];
		self.data = &self.data[size as usize..];
		Some((kind, content))
	}
}

fn boxes(data: &[u8]) -> Boxes<'_> {
	Boxes { data }
}

fn find<'a>(data: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
	boxes(data).find(|(k, _)| k == kind).map(|(_, content)| content)
}

fn u16_at(data: &[u8], at: usize) -> Option<u16> {
	Some(u16::from_be_bytes(data.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(data: &[u8], at: usize) -> Option<u32> {
	Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

fn u64_at(data: &[u8], at: usize) -> Option<u64> {
	Some(u64::from_be_bytes(data.get(at..at + 8)?.try_into().ok()?))
}

/// ISO 639-2 code packed in three 5-bit letters.
fn packed_language(code: u16) -> String {
	let letters = [(code >> 10) & 0x1F, (code >> 5) & 0x1F, code & 0x1F];
	if letters.iter().any(|&l| l == 0) {
		return "und".into();
	}
	letters.iter().map(|&l| char::from(b'`' + l as u8)).collect()
}

fn text(data: &[u8]) -> String {
	let end = data.iter().position(|&b| b == 0).unwrap_or(data.len());
	String::from_utf8_lossy(&data[..end]).trim().to_string()
}

/// Reads `moov` and the sample tables of subtitle tracks.
pub fn probe<R: Read + Seek>(r: &mut R, file_size: u64) -> io::Result<Mp4> {
	let mut position = 0u64;
	let mut moov = None;
	while position + 8 <= file_size {
		r.seek(SeekFrom::Start(position))?;
		let mut header = [0u8; 16];
		r.read_exact(&mut header[..8])?;
		let mut size = u32::from_be_bytes(header[0..4].try_into().unwrap_or_default()) as u64;
		let mut header_size = 8;
		if size == 1 {
			r.read_exact(&mut header[8..16])?;
			size = u64::from_be_bytes(header[8..16].try_into().unwrap_or_default());
			header_size = 16;
		} else if size == 0 {
			size = file_size - position;
		}
		if size < header_size {
			return Err(invalid("corrupt MP4 box"));
		}
		if &header[4..8] == b"moov" {
			if size > 256 << 20 {
				return Err(invalid("moov too large"));
			}
			let mut content = vec![0u8; (size - header_size) as usize];
			r.read_exact(&mut content)?;
			moov = Some(content);
			break;
		}
		position += size;
	}
	let moov = moov.ok_or_else(|| invalid("no moov box"))?;
	let movie_timescale = find(&moov, b"mvhd")
		.and_then(|mvhd| {
			if mvhd.first() == Some(&1) {
				u32_at(mvhd, 20)
			} else {
				u32_at(mvhd, 12)
			}
		})
		.unwrap_or(1000)
		.max(1);
	let mut file = Mp4 {
		fragmented: find(&moov, b"mvex").is_some(),
		..Mp4::default()
	};
	for (kind, trak) in boxes(&moov) {
		if &kind != b"trak" {
			continue;
		}
		if let Some(track) = read_track(trak, movie_timescale) {
			file.tracks.push(track);
		}
	}
	Ok(file)
}

const SUBTITLE_HANDLERS: [&str; 4] = ["sbtl", "subt", "text", "clcp"];
const SUBTITLE_CODECS: [&str; 6] = ["tx3g", "text", "wvtt", "stpp", "c608", "c708"];

fn read_track(trak: &[u8], movie_timescale: u32) -> Option<Mp4Track> {
	let mdia = find(trak, b"mdia")?;
	let handler =
		find(mdia, b"hdlr").map(|hdlr| String::from_utf8_lossy(hdlr.get(8..12).unwrap_or_default()).into_owned())?;
	let stbl = find(find(find(mdia, b"minf")?, b"stbl")?, b"stsd")
		.map(|stsd| String::from_utf8_lossy(stsd.get(12..16).unwrap_or_default()).into_owned());
	let codec = stbl.unwrap_or_default();
	if !SUBTITLE_HANDLERS.contains(&handler.as_str()) && !SUBTITLE_CODECS.contains(&codec.as_str()) {
		return None;
	}
	let tkhd = find(trak, b"tkhd")?;
	let id = if tkhd.first() == Some(&1) {
		u32_at(tkhd, 20)?
	} else {
		u32_at(tkhd, 12)?
	};
	let mdhd = find(mdia, b"mdhd")?;
	let (timescale, language) = if mdhd.first() == Some(&1) {
		(u32_at(mdhd, 20)?, u16_at(mdhd, 32)?)
	} else {
		(u32_at(mdhd, 12)?, u16_at(mdhd, 20)?)
	};
	let language = find(mdia, b"elng")
		.map(|elng| text(&elng[4.min(elng.len())..]))
		.unwrap_or_else(|| packed_language(language));
	// Muxers write their own name in the handler ("SubtitleHandler", "Core Media Text"): not a title.
	let name = find(mdia, b"hdlr")
		.map(|hdlr| text(hdlr.get(24..).unwrap_or_default()))
		.filter(|name| !name.contains("Handler") && !name.starts_with("Core Media") && !name.starts_with("GPAC"))
		.unwrap_or_default();
	let mut track = Mp4Track {
		id,
		codec,
		handler,
		language,
		name,
		enabled: u32_at(tkhd, 0).is_some_and(|flags| flags & 1 != 0),
		timescale: timescale.max(1),
		delay_ms: 0.0,
		samples: Vec::new(),
	};
	let stbl = find(find(mdia, b"minf")?, b"stbl")?;
	track.samples = sample_table(stbl).unwrap_or_default();
	track.delay_ms = edit_delay(trak, movie_timescale, track.timescale);
	Some(track)
}

/// Offset of the first sample, from an edit list: an empty edit first delays the track, and a
/// media time skips into it.
fn edit_delay(trak: &[u8], movie_timescale: u32, timescale: u32) -> f64 {
	let Some(elst) = find(trak, b"edts").and_then(|edts| find(edts, b"elst")) else {
		return 0.0;
	};
	let version = elst.first().copied().unwrap_or(0);
	let count = u32_at(elst, 4).unwrap_or(0) as usize;
	let entry = if version == 1 { 20 } else { 12 };
	let mut delay = 0.0;
	for k in 0..count.min(2) {
		let at = 8 + k * entry;
		let (duration, media_time) = if version == 1 {
			(
				u64_at(elst, at).unwrap_or(0) as f64,
				u64_at(elst, at + 8).map(|t| t as i64).unwrap_or(0) as f64,
			)
		} else {
			(
				u32_at(elst, at).unwrap_or(0) as f64,
				u32_at(elst, at + 4).map(|t| t as i32).unwrap_or(0) as f64,
			)
		};
		if media_time < 0.0 {
			delay += duration / movie_timescale as f64 * 1000.0;
		} else {
			delay -= media_time / timescale as f64 * 1000.0;
			break;
		}
	}
	delay
}

/// Where each sample is and when it plays, from the sample tables.
fn sample_table(stbl: &[u8]) -> Option<Vec<Sample>> {
	let stsz = find(stbl, b"stsz")?;
	let fixed = u32_at(stsz, 4)?;
	let count = u32_at(stsz, 8)? as usize;
	let sizes: Vec<u32> = if fixed != 0 {
		vec![fixed; count]
	} else {
		(0..count).map(|k| u32_at(stsz, 12 + k * 4)).collect::<Option<_>>()?
	};
	let chunks: Vec<u64> = if let Some(stco) = find(stbl, b"stco") {
		(0..u32_at(stco, 4)? as usize)
			.map(|k| u32_at(stco, 8 + k * 4).map(u64::from))
			.collect::<Option<_>>()?
	} else {
		let co64 = find(stbl, b"co64")?;
		(0..u32_at(co64, 4)? as usize)
			.map(|k| u64_at(co64, 8 + k * 8))
			.collect::<Option<_>>()?
	};
	let stsc = find(stbl, b"stsc")?;
	let runs: Vec<(u32, u32)> = (0..u32_at(stsc, 4)? as usize)
		.map(|k| Some((u32_at(stsc, 8 + k * 12)?, u32_at(stsc, 12 + k * 12)?)))
		.collect::<Option<_>>()?;
	let stts = find(stbl, b"stts")?;
	let deltas: Vec<(u32, u32)> = (0..u32_at(stts, 4)? as usize)
		.map(|k| Some((u32_at(stts, 8 + k * 8)?, u32_at(stts, 12 + k * 8)?)))
		.collect::<Option<_>>()?;

	let mut samples = Vec::with_capacity(count);
	let mut index = 0usize;
	for (chunk_index, &chunk_offset) in chunks.iter().enumerate() {
		let chunk_number = chunk_index as u32 + 1;
		let per_chunk = runs
			.iter()
			.rev()
			.find(|(first, _)| *first <= chunk_number)
			.map(|r| r.1)
			.unwrap_or(0);
		let mut offset = chunk_offset;
		for _ in 0..per_chunk {
			let Some(&size) = sizes.get(index) else { break };
			samples.push(Sample {
				offset,
				size,
				start: 0,
				duration: 0,
			});
			offset += size as u64;
			index += 1;
		}
	}
	let mut time = 0u64;
	let mut k = 0usize;
	for (run, delta) in deltas {
		for _ in 0..run {
			if let Some(sample) = samples.get_mut(k) {
				sample.start = time;
				sample.duration = delta;
			}
			time += delta as u64;
			k += 1;
		}
	}
	Some(samples)
}

/// Every sample of a track, as it is stored. Empty samples (gaps between lines) are left out.
pub fn extract<R: Read + Seek>(
	r: &mut R,
	file: &Mp4,
	track_id: u32,
	progress: &mut dyn FnMut(f64),
) -> io::Result<Vec<Packet>> {
	let track = file
		.tracks
		.iter()
		.find(|t| t.id == track_id)
		.ok_or_else(|| invalid("no such track"))?;
	let scale = 1000.0 / track.timescale as f64;
	let mut packets = Vec::new();
	for (index, sample) in track.samples.iter().enumerate() {
		if index % 256 == 0 {
			progress(index as f64 / track.samples.len().max(1) as f64);
		}
		// A tx3g sample of two bytes is an empty line: the gap until the next one.
		if sample.size <= 2 || sample.size > 16 << 20 {
			continue;
		}
		r.seek(SeekFrom::Start(sample.offset))?;
		let mut data = vec![0u8; sample.size as usize];
		r.read_exact(&mut data)?;
		packets.push(Packet {
			start_ms: sample.start as f64 * scale + track.delay_ms,
			duration_ms: Some(sample.duration as f64 * scale),
			data,
		});
	}
	progress(1.0);
	Ok(packets)
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::io::Cursor;

	fn mp4_box(kind: &[u8; 4], content: &[u8]) -> Vec<u8> {
		let mut out = ((content.len() + 8) as u32).to_be_bytes().to_vec();
		out.extend_from_slice(kind);
		out.extend_from_slice(content);
		out
	}

	fn full(kind: &[u8; 4], content: &[u8]) -> Vec<u8> {
		mp4_box(kind, &[&[0, 0, 0, 0][..], content].concat())
	}

	fn tx3g(text: &str) -> Vec<u8> {
		[(text.len() as u16).to_be_bytes().to_vec(), text.as_bytes().to_vec()].concat()
	}

	#[test]
	fn reads_timed_text_samples() {
		// Three samples in one chunk: a line, a gap, a line. Timescale 1000.
		let samples = [tx3g("Hello"), tx3g(""), tx3g("World")];
		let mdat_content: Vec<u8> = samples.concat();
		let ftyp = mp4_box(b"ftyp", b"isom\0\0\0\0");
		let mdat_offset = ftyp.len() as u32 + 8;
		let sizes: Vec<u8> = [&0u32.to_be_bytes()[..], &3u32.to_be_bytes()]
			.concat()
			.into_iter()
			.chain(samples.iter().flat_map(|s| (s.len() as u32).to_be_bytes()))
			.collect();
		let stbl = [
			full(
				b"stsd",
				&[&1u32.to_be_bytes()[..], &mp4_box(b"tx3g", &[0; 30])].concat(),
			),
			full(
				b"stts",
				&[2u32, 1, 1000, 2, 2000]
					.iter()
					.flat_map(|v| v.to_be_bytes())
					.collect::<Vec<_>>(),
			),
			full(
				b"stsc",
				&[1u32, 1, 3, 1].iter().flat_map(|v| v.to_be_bytes()).collect::<Vec<_>>(),
			),
			full(b"stsz", &sizes),
			full(
				b"stco",
				&[1u32, mdat_offset]
					.iter()
					.flat_map(|v| v.to_be_bytes())
					.collect::<Vec<_>>(),
			),
		]
		.concat();
		let mdhd = full(
			b"mdhd",
			&[
				&[0u8; 8][..],
				&1000u32.to_be_bytes(),
				&0u32.to_be_bytes(),
				&0x15C7u16.to_be_bytes(),
				&[0, 0],
			]
			.concat(),
		);
		let hdlr = full(b"hdlr", &[&[0u8; 4][..], b"sbtl", &[0u8; 12], b"Subtitles\0"].concat());
		let mdia = mp4_box(
			b"mdia",
			&[mdhd, hdlr, mp4_box(b"minf", &mp4_box(b"stbl", &stbl))].concat(),
		);
		let tkhd = mp4_box(
			b"tkhd",
			&[&[0, 0, 0, 1][..], &[0u8; 8], &7u32.to_be_bytes(), &[0u8; 60]].concat(),
		);
		let moov = mp4_box(b"moov", &mp4_box(b"trak", &[tkhd, mdia].concat()));
		let file = [ftyp, mp4_box(b"mdat", &mdat_content), moov].concat();
		let size = file.len() as u64;
		let mut cursor = Cursor::new(file);
		let mp4 = probe(&mut cursor, size).unwrap();
		let track = &mp4.tracks[0];
		assert_eq!(
			(track.id, track.codec.as_str(), track.language.as_str()),
			(7, "tx3g", "eng")
		);
		let packets = extract(&mut cursor, &mp4, 7, &mut |_| {}).unwrap();
		assert_eq!(packets.len(), 2);
		assert_eq!((packets[0].start_ms, packets[0].duration_ms), (0.0, Some(1000.0)));
		assert_eq!(&packets[0].data[2..], b"Hello");
		assert_eq!(packets[1].start_ms, 3000.0);
		assert_eq!(&packets[1].data[2..], b"World");
	}
}
