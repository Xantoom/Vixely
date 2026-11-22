//! Dolby TrueHD, decoded access unit by access unit.
//!
//! A stream carries its sound as presentations of 2, 6, 8 and 16 channels (Atmos). The 6-channel
//! one is decoded, or the stereo one when it is all there is: browsers mix 5.1 down to any
//! speakers, while past 6 channels they only keep the first two, which would lose the dialogue.

use truehd::process::decode::{DecodedAccessUnit, Decoder};
use truehd::process::extract::Extractor;
use truehd::process::parse::Parser;

/// The presentation decoded: 6 channels, or fewer when the stream has no such presentation.
const PRESENTATION: usize = 1;
/// Samples are 24-bit integers.
const SCALE: f32 = 1.0 / 8_388_608.0;

/// Channels and sample rate.
type Layout = (usize, u32);

#[derive(Default)]
pub struct TrueHd {
	extractor: Extractor,
	parser: Parser,
	decoder: Decoder,
	layout: Layout,
	/// Sound in a new layout, decoded along with the end of the previous one: handed on next.
	carried: Option<(Layout, Vec<f32>)>,
}

impl TrueHd {
	/// The sound of the access units in `data`, interleaved, in the layout `layout` then gives.
	/// Nothing comes out before the first major sync, nor for damaged access units: decoding
	/// starts again at the next major sync.
	pub fn decode(&mut self, data: &[u8]) -> Vec<f32> {
		self.extractor.push_bytes(data);
		let mut samples = Vec::new();
		if let Some((layout, carried)) = self.carried.take() {
			self.layout = layout;
			samples = carried;
		}
		while let Some(frame) = self.extractor.next() {
			// Bytes that are no access unit are skipped by the extractor.
			let Ok(frame) = frame else { continue };
			let decoded = self
				.parser
				.parse(&frame)
				.and_then(|unit| self.decoder.decode_presentation(&unit, PRESENTATION));
			let decoded = match decoded {
				Ok(decoded) if !decoded.is_duplicate => decoded,
				Ok(_) => continue,
				Err(_) => {
					self.parser.reset_for_next_major_sync();
					self.decoder.reset_for_next_major_sync();
					continue;
				}
			};
			let layout = (decoded.channel_count, decoded.sampling_frequency);
			let unit = interleave(&decoded);
			// A change of layout ends the sound decoded so far, which goes first.
			if layout != self.layout && !samples.is_empty() {
				self.carried = Some((layout, unit));
				break;
			}
			self.layout = layout;
			samples.extend(unit);
		}
		samples
	}

	/// Channels and sample rate of the sound `decode` last gave.
	pub fn layout(&self) -> Layout {
		self.layout
	}
}

fn interleave(decoded: &DecodedAccessUnit) -> Vec<f32> {
	decoded.pcm_data[..decoded.sample_length]
		.iter()
		.flat_map(|frame| &frame[..decoded.channel_count])
		.map(|&sample| sample as f32 * SCALE)
		.collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	/// FNV-1a of the 24-bit samples.
	fn fingerprint(samples: &[f32]) -> u64 {
		samples.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &sample| {
			let bits = u64::from((sample / SCALE) as i32 as u32);
			(hash ^ bits).wrapping_mul(0x0100_0000_01b3)
		})
	}

	/// A 5.1 stream made by FFmpeg's encoder decodes to the samples of its decoder, whatever
	/// pieces it comes in.
	#[test]
	fn decodes_like_ffmpeg() {
		let stream = include_bytes!("../tests/five-one.thd");
		for size in [stream.len(), 1000, 7] {
			let mut decoder = TrueHd::default();
			let samples: Vec<f32> = stream.chunks(size).flat_map(|piece| decoder.decode(piece)).collect();
			assert_eq!(decoder.layout(), (6, 48_000));
			assert_eq!(samples.len(), 6 * 2400);
			assert_eq!(fingerprint(&samples), 0x061d_b142_f8b4_9b28);
		}
	}

	/// Decoding starts at a major sync: what comes before is skipped.
	#[test]
	fn starts_at_a_major_sync() {
		let stream = include_bytes!("../tests/five-one.thd");
		let mut decoder = TrueHd::default();
		let samples = decoder.decode(&stream[100..]);
		assert!(!samples.is_empty() && samples.len() < 6 * 2400);
		assert_eq!(samples.len() % 6, 0);
	}
}
