//! Audio files browsers can't read, turned into WAV, which they can.
//!
//! AIFF is the Mac's WAV: the same PCM, stored big-endian, with the sample rate as an 80-bit
//! float. Its sound data only needs a WAV header in front and its bytes swapped. Apple Lossless
//! (ALAC, in `.m4a` files) is compressed: it is decoded to PCM, which the page writes as WAV.

use std::io::Cursor;

use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{CODEC_TYPE_ALAC, Decoder, DecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::default::codecs::AlacDecoder;
use symphonia::default::formats::IsoMp4Reader;

const PCM: u16 = 1;
const IEEE_FLOAT: u16 = 3;
const ALAW: u16 = 6;
const MULAW: u16 = 7;

/// How the bytes of AIFF sound data become WAV sound data.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reorder {
	/// Already as WAV wants it.
	None,
	/// Each sample's bytes reversed: samples of this many bytes.
	Swap(u8),
	/// 8-bit samples: signed in AIFF, unsigned in WAV.
	Unsign,
}

#[derive(Debug, PartialEq)]
pub struct AiffFormat {
	pub channels: u16,
	pub rate: u32,
	pub bits: u16,
	pub tag: u16,
	pub reorder: Reorder,
}

/// An IEEE 754 80-bit extended float, as AIFF writes its sample rate.
fn extended(b: &[u8]) -> f64 {
	let exponent = i32::from(u16::from_be_bytes([b[0], b[1]]) & 0x7FFF);
	let mantissa = u64::from_be_bytes([b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9]]);
	if exponent == 0 && mantissa == 0 {
		return 0.0;
	}
	mantissa as f64 * 2f64.powi(exponent - 16383 - 63)
}

/// Reads the COMM chunk of an AIFF (`compressed` false) or AIFF-C file.
pub fn aiff_format(comm: &[u8], compressed: bool) -> Result<AiffFormat, String> {
	if comm.len() < 18 {
		return Err("AIFF: COMM chunk too short".into());
	}
	let channels = u16::from_be_bytes([comm[0], comm[1]]);
	let bits = u16::from_be_bytes([comm[6], comm[7]]);
	let rate = extended(&comm[8..18]).round();
	if channels == 0 || !(1.0..=1_000_000.0).contains(&rate) {
		return Err("AIFF: bad channel count or sample rate".into());
	}
	let kind = if compressed {
		comm.get(18..22).ok_or("AIFF-C: no compression type")?
	} else {
		b"NONE"
	};
	let bytes = bits.div_ceil(8);
	let (tag, bits, reorder) = match kind {
		b"NONE" | b"twos" if bytes == 1 => (PCM, 8, Reorder::Unsign),
		b"NONE" | b"twos" if (2..=4).contains(&bytes) => (PCM, bytes * 8, Reorder::Swap(bytes as u8)),
		b"sowt" if (2..=4).contains(&bytes) => (PCM, bytes * 8, Reorder::None),
		b"raw " if bytes == 1 => (PCM, 8, Reorder::None),
		b"fl32" | b"FL32" => (IEEE_FLOAT, 32, Reorder::Swap(4)),
		b"fl64" | b"FL64" => (IEEE_FLOAT, 64, Reorder::Swap(8)),
		b"ulaw" | b"ULAW" => (MULAW, 8, Reorder::None),
		b"alaw" | b"ALAW" => (ALAW, 8, Reorder::None),
		other => {
			return Err(format!(
				"AIFF-C: {} audio is not supported",
				String::from_utf8_lossy(other).trim()
			));
		}
	};
	Ok(AiffFormat {
		channels,
		rate: rate as u32,
		bits,
		tag,
		reorder,
	})
}

/// A WAV header for `data_length` bytes of sound data, followed by `trailing` bytes of other
/// chunks (padding included).
pub fn wav_header(channels: u16, rate: u32, bits: u16, tag: u16, data_length: u32, trailing: u32) -> Vec<u8> {
	let block = channels * bits.div_ceil(8);
	let mut out = Vec::with_capacity(44);
	out.extend(b"RIFF");
	out.extend((36 + data_length + data_length % 2 + trailing).to_le_bytes());
	out.extend(b"WAVEfmt ");
	out.extend(16u32.to_le_bytes());
	out.extend(tag.to_le_bytes());
	out.extend(channels.to_le_bytes());
	out.extend(rate.to_le_bytes());
	out.extend((rate * u32::from(block)).to_le_bytes());
	out.extend(block.to_le_bytes());
	out.extend(bits.to_le_bytes());
	out.extend(b"data");
	out.extend(data_length.to_le_bytes());
	out
}

/// Reorders sound data in place, `data` holding whole samples.
pub fn reorder(data: &mut [u8], reorder: Reorder) {
	match reorder {
		Reorder::None => {}
		Reorder::Swap(width) => {
			for sample in data.chunks_exact_mut(usize::from(width)) {
				sample.reverse();
			}
		}
		Reorder::Unsign => {
			for byte in data {
				*byte ^= 0x80;
			}
		}
	}
}

/// Interleaved little-endian PCM samples.
pub struct Pcm {
	pub channels: u16,
	pub rate: u32,
	/// 16, 24 or 32.
	pub bits: u16,
	pub data: Vec<u8>,
}

/// Decodes the Apple Lossless track of an MP4 file. Samples keep their depth: 16 bits, else 24,
/// or 32.
pub fn decode_alac(file: Vec<u8>) -> Result<Pcm, String> {
	let failed = |error: SymphoniaError| format!("ALAC: {error}");
	let stream = MediaSourceStream::new(Box::new(Cursor::new(file)), Default::default());
	let mut reader = IsoMp4Reader::try_new(stream, &FormatOptions::default()).map_err(failed)?;
	let track = reader
		.tracks()
		.iter()
		.find(|track| track.codec_params.codec == CODEC_TYPE_ALAC)
		.ok_or("no Apple Lossless track")?;
	let id = track.id;
	let params = track.codec_params.clone();
	let mut decoder = AlacDecoder::try_new(&params, &DecoderOptions::default()).map_err(failed)?;
	// The channels, rate and depth are in the codec setup (the "magic cookie"), which the decoder
	// has just checked.
	let cookie = params.extra_data.as_deref().ok_or("ALAC: no codec setup")?;
	let depth = u32::from(cookie[5]);
	let channels = u16::from(cookie[9]);
	let rate = u32::from_be_bytes([cookie[20], cookie[21], cookie[22], cookie[23]]);
	let bytes: usize = if depth <= 16 {
		2
	} else if depth <= 24 {
		3
	} else {
		4
	};
	let frames = params.n_frames.unwrap_or(0) as usize;
	let mut data = Vec::with_capacity(frames * usize::from(channels) * bytes);
	loop {
		let packet = match reader.next_packet() {
			Ok(packet) => packet,
			Err(SymphoniaError::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => break,
			Err(error) => return Err(failed(error)),
		};
		if packet.track_id() != id {
			continue;
		}
		let buffer = match decoder.decode(&packet) {
			Ok(AudioBufferRef::S32(buffer)) => buffer,
			Ok(_) => return Err("ALAC: unexpected sample format".into()),
			// A damaged packet is skipped, as players do.
			Err(SymphoniaError::DecodeError(_)) => continue,
			Err(error) => return Err(failed(error)),
		};
		let planes = buffer.planes();
		for frame in 0..buffer.frames() {
			for plane in planes.planes() {
				// Samples come scaled to 32 bits: the top bytes are the sample.
				data.extend_from_slice(&plane[frame].to_le_bytes()[4 - bytes..]);
			}
		}
	}
	Ok(Pcm {
		channels,
		rate,
		bits: bytes as u16 * 8,
		data,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	fn comm(channels: u16, frames: u32, bits: u16, rate_extended: [u8; 10], kind: &[u8]) -> Vec<u8> {
		let mut out = channels.to_be_bytes().to_vec();
		out.extend(frames.to_be_bytes());
		out.extend(bits.to_be_bytes());
		out.extend(rate_extended);
		out.extend(kind);
		out
	}

	/// 44100 as an 80-bit float.
	const RATE_44100: [u8; 10] = [0x40, 0x0E, 0xAC, 0x44, 0, 0, 0, 0, 0, 0];

	#[test]
	fn reads_aiff_formats() {
		assert_eq!(extended(&RATE_44100), 44100.0);
		let format = aiff_format(&comm(2, 10, 16, RATE_44100, b""), false).unwrap();
		assert_eq!(
			format,
			AiffFormat {
				channels: 2,
				rate: 44100,
				bits: 16,
				tag: PCM,
				reorder: Reorder::Swap(2)
			}
		);
		assert_eq!(
			aiff_format(&comm(1, 10, 24, RATE_44100, b"sowt"), true)
				.unwrap()
				.reorder,
			Reorder::None
		);
		assert_eq!(
			aiff_format(&comm(1, 10, 32, RATE_44100, b"fl32"), true).unwrap().tag,
			IEEE_FLOAT
		);
		assert_eq!(
			aiff_format(&comm(1, 10, 8, RATE_44100, b""), false).unwrap().reorder,
			Reorder::Unsign
		);
		assert!(aiff_format(&comm(1, 10, 16, RATE_44100, b"ima4"), true).is_err());
	}

	#[test]
	fn reorders_samples() {
		let mut data = [1, 2, 3, 4, 5, 6];
		reorder(&mut data, Reorder::Swap(3));
		assert_eq!(data, [3, 2, 1, 6, 5, 4]);
		let mut data = [0x00, 0xFF];
		reorder(&mut data, Reorder::Unsign);
		assert_eq!(data, [0x80, 0x7F]);
	}

	#[test]
	fn writes_wav_headers() {
		let header = wav_header(2, 48000, 24, PCM, 600, 20);
		assert_eq!(header.len(), 44);
		assert_eq!(&header[0..4], b"RIFF");
		assert_eq!(u32::from_le_bytes(header[4..8].try_into().unwrap()), 656);
		assert_eq!(u16::from_le_bytes([header[32], header[33]]), 6);
		assert_eq!(u32::from_le_bytes(header[40..44].try_into().unwrap()), 600);
	}
}
