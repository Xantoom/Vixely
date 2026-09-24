//! Subtitle tracks for Vixely: reading them from Matroska and MP4 files, and decoding and writing
//! PGS (Blu-ray) image subtitles.
//!
//! Files are never copied into WebAssembly memory whole: JavaScript passes a function that reads
//! a range of the file synchronously (FileReaderSync, in a worker), and only what is needed is read.

pub mod ebml;
pub mod mkv;
pub mod mp4;
pub mod mp4_mux;
pub mod mux;
pub mod pgs;

use std::io::{self, Read, Seek, SeekFrom};

use js_sys::{Function, Uint8Array};
use wasm_bindgen::prelude::*;

/// Reads a little when jumping around (cues, attachments), then more and more when reading on.
const SMALL_READ: usize = 64 << 10;
const LARGE_READ: usize = 4 << 20;
/// A jump forward this short still reads on.
const SKIP_AHEAD: u64 = 1 << 20;

/// The file, read through a JavaScript function `(offset, length) => Uint8Array`.
struct JsSource {
	read: Function,
	size: u64,
	position: u64,
	buffer: Vec<u8>,
	buffer_start: u64,
	chunk: usize,
}

impl JsSource {
	fn new(read: Function, size: u64) -> Self {
		Self {
			read,
			size,
			position: 0,
			buffer: Vec::new(),
			buffer_start: 0,
			chunk: SMALL_READ,
		}
	}

	fn fill(&mut self, wanted: usize) -> io::Result<()> {
		let buffer_end = self.buffer_start + self.buffer.len() as u64;
		// Reading on, or skipping a little ahead (from block header to block header), counts as
		// reading through: the next read is larger.
		let onward = self.position >= buffer_end && self.position - buffer_end <= SKIP_AHEAD;
		self.chunk = if onward && !self.buffer.is_empty() {
			(self.chunk * 2).min(LARGE_READ)
		} else {
			SMALL_READ
		};
		let length = (self.chunk.max(wanted) as u64).min(self.size - self.position);
		let result = self
			.read
			.call2(
				&JsValue::NULL,
				&JsValue::from_f64(self.position as f64),
				&JsValue::from_f64(length as f64),
			)
			.map_err(|_| io::Error::other("the file could not be read"))?;
		self.buffer = Uint8Array::new(&result).to_vec();
		self.buffer_start = self.position;
		Ok(())
	}
}

impl Read for JsSource {
	fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
		if self.position >= self.size || out.is_empty() {
			return Ok(0);
		}
		let buffer_end = self.buffer_start + self.buffer.len() as u64;
		if self.position < self.buffer_start || self.position >= buffer_end {
			self.fill(out.len())?;
		}
		let from = (self.position - self.buffer_start) as usize;
		let count = out.len().min(self.buffer.len() - from);
		if count == 0 {
			return Ok(0);
		}
		out[..count].copy_from_slice(&self.buffer[from..from + count]);
		self.position += count as u64;
		Ok(count)
	}
}

impl Seek for JsSource {
	fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
		self.position = match to {
			SeekFrom::Start(offset) => offset,
			SeekFrom::End(offset) => self.size.saturating_add_signed(offset),
			SeekFrom::Current(offset) => self.position.saturating_add_signed(offset),
		};
		Ok(self.position)
	}
}

fn error(error: io::Error) -> JsError {
	JsError::new(&error.to_string())
}

fn json_string(value: &str) -> String {
	let mut out = String::from("\"");
	for c in value.chars() {
		match c {
			'"' => out.push_str("\\\""),
			'\\' => out.push_str("\\\\"),
			c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
			c => out.push(c),
		}
	}
	out.push('"');
	out
}

enum Container {
	Matroska(mkv::Matroska),
	Mp4(mp4::Mp4),
}

/// A video file whose subtitle tracks can be listed and read.
#[wasm_bindgen]
pub struct SubtitleSource {
	source: JsSource,
	container: Container,
}

#[wasm_bindgen]
impl SubtitleSource {
	/// Opens a Matroska, WebM, MP4 or QuickTime file. `read(offset, length)` returns its bytes.
	#[wasm_bindgen(constructor)]
	pub fn open(read: Function, size: f64) -> Result<SubtitleSource, JsError> {
		let mut source = JsSource::new(read, size as u64);
		let mut head = [0u8; 12];
		let count = source.read(&mut head).map_err(error)?;
		let head = &head[..count];
		let container = if mkv::is_matroska(head) {
			Container::Matroska(mkv::probe(&mut source, size as u64).map_err(error)?)
		} else if mp4::is_mp4(head) {
			Container::Mp4(mp4::probe(&mut source, size as u64).map_err(error)?)
		} else {
			return Err(JsError::new("not a Matroska or MP4 file"));
		};
		Ok(SubtitleSource { source, container })
	}

	/// The subtitle tracks, as JSON: `[{ id, codec, language, name, default, forced }]`.
	pub fn tracks(&self) -> String {
		let entries: Vec<String> = match &self.container {
			Container::Matroska(file) => file
				.tracks
				.iter()
				.filter(|track| track.kind == mkv::SUBTITLE_TRACK)
				.map(|track| {
					format!(
						"{{\"id\":{},\"codec\":{},\"language\":{},\"name\":{},\"default\":{},\"forced\":{},\"readable\":{}}}",
						track.number,
						json_string(&track.codec),
						json_string(&track.language),
						json_string(&track.name),
						track.default,
						track.forced,
						track.compression != Some(mkv::Compression::Other),
					)
				})
				.collect(),
			Container::Mp4(file) => file
				.tracks
				.iter()
				.map(|track| {
					format!(
						"{{\"id\":{},\"codec\":{},\"language\":{},\"name\":{},\"default\":{},\"forced\":false,\"readable\":{}}}",
						track.id,
						json_string(&track.codec),
						json_string(&track.language),
						json_string(&track.name),
						track.enabled,
						!file.fragmented,
					)
				})
				.collect(),
		};
		format!("[{}]", entries.join(","))
	}

	/// Video and audio tracks, as JSON: `[{ id, kind, codec, language, name, default }]`. Codecs are
	/// Matroska codec IDs or MP4 sample entries.
	pub fn media_tracks(&self) -> String {
		let file = match &self.container {
			Container::Matroska(file) => file,
			Container::Mp4(file) => {
				let entries: Vec<String> = file
					.media
					.iter()
					.map(|track| {
						format!(
							"{{\"id\":{},\"kind\":\"{}\",\"codec\":{},\"language\":{},\"name\":{},\"default\":{}}}",
							track.id,
							if track.video { "video" } else { "audio" },
							json_string(&track.codec),
							json_string(&track.language),
							json_string(&track.name),
							track.enabled,
						)
					})
					.collect();
				return format!("[{}]", entries.join(","));
			}
		};
		let entries: Vec<String> = file
			.tracks
			.iter()
			.filter(|track| track.kind == 1 || track.kind == 2)
			.map(|track| {
				format!(
					"{{\"id\":{},\"kind\":\"{}\",\"codec\":{},\"language\":{},\"name\":{},\"default\":{}}}",
					track.number,
					if track.kind == 1 { "video" } else { "audio" },
					json_string(&track.codec),
					json_string(&track.language),
					json_string(&track.name),
					track.default,
				)
			})
			.collect();
		format!("[{}]", entries.join(","))
	}

	/// Setup data of a track: the ASS header of ASS tracks.
	pub fn codec_private(&self, track: u32) -> Vec<u8> {
		match &self.container {
			Container::Matroska(file) => file
				.tracks
				.iter()
				.find(|t| t.number == track as u64)
				.map(|t| t.private.clone())
				.unwrap_or_default(),
			Container::Mp4(_) => Vec::new(),
		}
	}

	/// Attached files (fonts) as JSON: `[{ name, mime, size }]`, in order.
	pub fn attachments(&self) -> String {
		let Container::Matroska(file) = &self.container else {
			return "[]".into();
		};
		let entries: Vec<String> = file
			.attachments
			.iter()
			.map(|a| {
				format!(
					"{{\"name\":{},\"mime\":{},\"size\":{}}}",
					json_string(&a.name),
					json_string(&a.mime),
					a.size
				)
			})
			.collect();
		format!("[{}]", entries.join(","))
	}

	pub fn attachment(&mut self, index: usize) -> Result<Vec<u8>, JsError> {
		let Container::Matroska(file) = &self.container else {
			return Err(JsError::new("no attachments"));
		};
		let attachment = file
			.attachments
			.get(index)
			.ok_or_else(|| JsError::new("no such attachment"))?;
		mkv::attachment(&mut self.source, attachment).map_err(error)
	}

	/// Every packet of several tracks, read in one pass over the file, in the order asked.
	/// `progress(share)` is called as it goes.
	pub fn extract_all(&mut self, tracks: &[u32], progress: &Function) -> Result<Vec<Packets>, JsError> {
		let mut report = |share: f64| {
			let _ = progress.call1(&JsValue::NULL, &JsValue::from_f64(share));
		};
		let packets = match &self.container {
			Container::Matroska(file) => {
				let numbers: Vec<u64> = tracks.iter().map(|&track| track as u64).collect();
				mkv::extract_many(&mut self.source, file, &numbers, &mut report)
			}
			Container::Mp4(file) => {
				let count = tracks.len().max(1) as f64;
				tracks
					.iter()
					.enumerate()
					.map(|(index, &track)| {
						mp4::extract(&mut self.source, file, track, &mut |share| {
							report((index as f64 + share) / count)
						})
					})
					.collect()
			}
		}
		.map_err(error)?;
		Ok(packets.into_iter().map(Packets::from).collect())
	}
}

/// Packets side by side: times in milliseconds (NaN for an unknown duration) and the data of
/// packet `k` at `offsets[k]..offsets[k + 1]`.
#[wasm_bindgen]
pub struct Packets {
	starts: Vec<f64>,
	durations: Vec<f64>,
	offsets: Vec<u32>,
	data: Vec<u8>,
}

impl From<Vec<mkv::Packet>> for Packets {
	fn from(packets: Vec<mkv::Packet>) -> Self {
		let mut out = Packets {
			starts: Vec::new(),
			durations: Vec::new(),
			offsets: vec![0],
			data: Vec::new(),
		};
		for packet in packets {
			out.starts.push(packet.start_ms);
			out.durations.push(packet.duration_ms.unwrap_or(f64::NAN));
			out.data.extend(packet.data);
			out.offsets.push(out.data.len() as u32);
		}
		out
	}
}

#[wasm_bindgen]
impl Packets {
	pub fn starts(&self) -> Vec<f64> {
		self.starts.clone()
	}
	pub fn durations(&self) -> Vec<f64> {
		self.durations.clone()
	}
	pub fn offsets(&self) -> Vec<u32> {
		self.offsets.clone()
	}
	pub fn data(&self) -> Vec<u8> {
		self.data.clone()
	}
}

/// PGS pictures side by side, as `Packets`, with where each is on screen.
#[wasm_bindgen]
pub struct Pictures {
	packets: Packets,
	/// x, y, width, height of each picture, then the video width and height.
	rects: Vec<u16>,
	forced: Vec<u8>,
}

impl From<Vec<pgs::Picture>> for Pictures {
	fn from(pictures: Vec<pgs::Picture>) -> Self {
		let mut rects = Vec::new();
		let mut forced = Vec::new();
		let packets: Vec<mkv::Packet> = pictures
			.into_iter()
			.map(|picture| {
				let r = &picture.rect;
				rects.extend([r.x, r.y, r.width, r.height, picture.video_width, picture.video_height]);
				forced.push(picture.forced as u8);
				mkv::Packet {
					start_ms: picture.start_ms,
					duration_ms: picture.end_ms.map(|end| end - picture.start_ms),
					data: picture.set,
				}
			})
			.collect();
		Pictures {
			packets: Packets::from(packets),
			rects,
			forced,
		}
	}
}

#[wasm_bindgen]
impl Pictures {
	pub fn starts(&self) -> Vec<f64> {
		self.packets.starts.clone()
	}
	pub fn durations(&self) -> Vec<f64> {
		self.packets.durations.clone()
	}
	pub fn offsets(&self) -> Vec<u32> {
		self.packets.offsets.clone()
	}
	pub fn data(&self) -> Vec<u8> {
		self.packets.data.clone()
	}
	/// Six values per picture: x, y, width, height, video width, video height.
	pub fn rects(&self) -> Vec<u16> {
		self.rects.clone()
	}
	pub fn forced(&self) -> Vec<u8> {
		self.forced.clone()
	}
}

/// Pictures of a `.sup` file.
#[wasm_bindgen]
pub fn pgs_from_sup(data: &[u8]) -> Pictures {
	Pictures::from(pgs::read_sup(data))
}

/// Pictures of a Matroska PGS track, from its packets in file order.
#[wasm_bindgen]
pub fn pgs_from_packets(starts: &[f64], durations: &[f64], offsets: &[u32], data: &[u8]) -> Pictures {
	let blocks = starts.iter().enumerate().map(|(k, &start)| {
		let (from, to) = (offsets[k] as usize, offsets[k + 1] as usize);
		(
			start,
			durations.get(k).copied().filter(|d| d.is_finite()),
			&data[from..to],
		)
	});
	Pictures::from(pgs::read_blocks(blocks))
}

/// A decoded picture: where it goes and its RGBA pixels.
#[wasm_bindgen]
pub struct DecodedPicture {
	pub x: u16,
	pub y: u16,
	pub width: u16,
	pub height: u16,
	pixels: Vec<u8>,
}

#[wasm_bindgen]
impl DecodedPicture {
	pub fn pixels(&self) -> Vec<u8> {
		self.pixels.clone()
	}
}

#[wasm_bindgen]
pub fn pgs_decode(set: &[u8]) -> Option<DecodedPicture> {
	let (rect, pixels) = pgs::decode(set)?;
	Some(DecodedPicture {
		x: rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
		pixels,
	})
}

/// A `.sup` file from pictures: start and end in milliseconds, sets as in `Pictures`.
#[wasm_bindgen]
pub fn pgs_write(starts: &[f64], ends: &[f64], offsets: &[u32], data: &[u8]) -> Vec<u8> {
	let pictures: Vec<(f64, f64, &[u8])> = starts
		.iter()
		.enumerate()
		.map(|(k, &start)| (start, ends[k], &data[offsets[k] as usize..offsets[k + 1] as usize]))
		.collect();
	pgs::write_sup(&pictures)
}

/// PGS pictures as Matroska blocks: one display set per block, clearing sets included.
#[wasm_bindgen]
pub fn pgs_mkv_packets(starts: &[f64], ends: &[f64], offsets: &[u32], data: &[u8]) -> Packets {
	let pictures: Vec<(f64, f64, &[u8])> = starts
		.iter()
		.enumerate()
		.map(|(k, &start)| (start, ends[k], &data[offsets[k] as usize..offsets[k + 1] as usize]))
		.collect();
	let packets = pgs::mkv_blocks(&pictures)
		.into_iter()
		.map(|(start_ms, data)| mkv::Packet {
			start_ms,
			duration_ms: None,
			data,
		})
		.collect::<Vec<_>>();
	Packets::from(packets)
}

/// What to write: the subtitle streams, and what becomes of each track. Built from JavaScript,
/// then handed to a `Remuxer`.
#[wasm_bindgen]
#[derive(Default)]
pub struct RemuxPlan {
	plan: mux::Plan,
	streams: Vec<mux::Stream>,
}

#[wasm_bindgen]
impl RemuxPlan {
	#[wasm_bindgen(constructor)]
	pub fn new() -> RemuxPlan {
		RemuxPlan::default()
	}

	/// Adds the lines of a subtitle track; returns its index. Durations are NaN when there is none.
	pub fn add_stream(
		&mut self,
		codec: String,
		private: Vec<u8>,
		starts: &[f64],
		durations: &[f64],
		offsets: &[u32],
		data: &[u8],
	) -> usize {
		let packets = starts
			.iter()
			.enumerate()
			.map(|(k, &start_ms)| mux::Packet {
				start_ms,
				duration_ms: durations.get(k).copied().filter(|d| d.is_finite()),
				data: data[offsets[k] as usize..offsets[k + 1] as usize].to_vec(),
			})
			.collect();
		self.streams.push(mux::Stream {
			codec,
			private,
			packets,
		});
		self.streams.len() - 1
	}

	/// What becomes of a track of the source. `default` and `forced`: -1 unchanged, 0 or 1;
	/// `stream`: -1 to keep its lines, else the stream replacing them.
	#[allow(clippy::too_many_arguments)]
	pub fn choose(
		&mut self,
		number: u32,
		keep: bool,
		language: Option<String>,
		name: Option<String>,
		default: i8,
		forced: i8,
		stream: i32,
	) {
		self.plan.choices.push(mux::Choice {
			number: number as u64,
			keep,
			language,
			name,
			default: (default >= 0).then_some(default == 1),
			forced: (forced >= 0).then_some(forced == 1),
			stream: usize::try_from(stream).ok(),
		});
	}

	/// A new subtitle track. `uid` identifies it in the file; any random number fits.
	pub fn add_track(&mut self, stream: usize, language: String, name: String, default: bool, forced: bool, uid: f64) {
		self.plan.added.push(mux::Added {
			stream,
			language,
			name,
			default,
			forced,
			uid: uid as u64,
		});
	}
}

enum Writer {
	Matroska(mux::Muxer<JsSource>),
	Mp4(mp4_mux::Mp4Muxer<JsSource>),
}

/// Writes a new Matroska or MP4 file from a source of the same kind and a plan, chunk by chunk.
#[wasm_bindgen]
pub struct Remuxer {
	writer: Writer,
}

#[wasm_bindgen]
impl Remuxer {
	/// Lays the file out; `progress(share)` follows the reading of the source.
	#[wasm_bindgen(constructor)]
	pub fn new(read: Function, size: f64, plan: &RemuxPlan, progress: &Function) -> Result<Remuxer, JsError> {
		let mut report = |share: f64| {
			let _ = progress.call1(&JsValue::NULL, &JsValue::from_f64(share));
		};
		let mut source = JsSource::new(read, size as u64);
		let mut head = [0u8; 12];
		let count = source.read(&mut head).map_err(error)?;
		let head = &head[..count];
		let writer = if mkv::is_matroska(head) {
			Writer::Matroska(
				mux::Muxer::new(source, size as u64, &plan.plan, &plan.streams, &mut report).map_err(error)?,
			)
		} else if mp4::is_mp4(head) {
			let muxer = mp4_mux::Mp4Muxer::new(source, size as u64, &plan.plan, &plan.streams).map_err(error)?;
			report(1.0);
			Writer::Mp4(muxer)
		} else {
			return Err(JsError::new("not a Matroska or MP4 file"));
		};
		Ok(Remuxer { writer })
	}

	/// Size of the file written, in bytes.
	pub fn total(&self) -> f64 {
		match &self.writer {
			Writer::Matroska(muxer) => muxer.total() as f64,
			Writer::Mp4(muxer) => muxer.total() as f64,
		}
	}

	/// The next bytes of the file, a few megabytes at a time; empty at the end.
	pub fn next_chunk(&mut self) -> Result<Vec<u8>, JsError> {
		match &mut self.writer {
			Writer::Matroska(muxer) => muxer.next_chunk(LARGE_READ),
			Writer::Mp4(muxer) => muxer.next_chunk(LARGE_READ),
		}
		.map_err(error)
	}
}
