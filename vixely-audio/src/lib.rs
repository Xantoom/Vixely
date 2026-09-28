//! Audio analysis for Vixely, loaded by the audio editor only.
//!
//! Loudness follows EBU R128 (ITU-R BS.1770): audio is K-weighted, and its energy over 400 ms
//! blocks, taken every 100 ms, is what integrated loudness gates and averages. The meter here
//! reports those blocks one by one instead of a single figure, so the page can measure any part of
//! the file (the audio left after cuts, with its gain and fades) without decoding it again.

mod denoise;
mod import;

use ebur128::{EbuR128, Mode};
use wasm_bindgen::prelude::*;

/// Reduces background noise (hiss, hum, fans, street) and keeps voices, as a stream of planar
/// audio at any rate. The output lines up with the input and is exactly as long.
#[wasm_bindgen]
pub struct NoiseReducer {
	inner: denoise::Denoiser,
	channels: usize,
	frames: usize,
}

#[wasm_bindgen]
impl NoiseReducer {
	/// `amount` is the share of denoised sound, 0 to 1.
	#[wasm_bindgen(constructor)]
	pub fn new(channels: u32, rate: u32, amount: f32) -> NoiseReducer {
		NoiseReducer {
			inner: denoise::Denoiser::new(channels as usize, rate, amount),
			channels: channels as usize,
			frames: 0,
		}
	}

	/// Adds `frames` frames of planar input and returns the planar output ready so far; its
	/// frame count is `ready_frames()`.
	pub fn process(&mut self, planar: &[f32], frames: usize) -> Vec<f32> {
		let (out, ready) = self
			.inner
			.process(planar, frames.min(planar.len() / self.channels.max(1)));
		self.frames = ready;
		out
	}

	/// The rest of the output, once all the input has been added.
	pub fn finish(&mut self) -> Vec<f32> {
		let (out, ready) = self.inner.finish();
		self.frames = ready;
		out
	}

	/// Frames in what `process` or `finish` last returned.
	pub fn ready_frames(&self) -> usize {
		self.frames
	}
}

/// Measures the momentary loudness and the true peak of audio fed in 100 ms steps.
#[wasm_bindgen]
pub struct LoudnessMeter {
	meter: EbuR128,
	channels: usize,
}

#[wasm_bindgen]
impl LoudnessMeter {
	#[wasm_bindgen(constructor)]
	pub fn new(channels: u32, rate: u32) -> Result<LoudnessMeter, JsError> {
		Self::create(channels, rate).map_err(|error| JsError::new(&error))
	}

	/// Adds `frames` frames given as planar data: every channel's samples, one channel after the other.
	pub fn add(&mut self, planar: &[f32], frames: usize) -> Result<(), JsError> {
		self.add_planar(planar, frames).map_err(|error| JsError::new(&error))
	}

	/// Loudness of the last 400 ms, in LUFS. Minus infinity for silence.
	pub fn momentary(&self) -> f64 {
		self.meter.loudness_momentary().unwrap_or(f64::NEG_INFINITY)
	}

	/// Highest true peak of any channel in the audio added since the previous call, as a linear
	/// amplitude where 1 is full scale. True peak includes the overshoot between samples that a
	/// converter or an encoder produces.
	pub fn true_peak(&self) -> f64 {
		(0..self.channels as u32)
			.filter_map(|c| self.meter.prev_true_peak(c).ok())
			.fold(0.0, f64::max)
	}
}

impl LoudnessMeter {
	fn create(channels: u32, rate: u32) -> Result<LoudnessMeter, String> {
		let meter = EbuR128::new(channels, rate, Mode::M | Mode::TRUE_PEAK).map_err(|error| error.to_string())?;
		Ok(LoudnessMeter {
			meter,
			channels: channels as usize,
		})
	}

	fn add_planar(&mut self, planar: &[f32], frames: usize) -> Result<(), String> {
		if planar.len() < frames * self.channels {
			return Err("Fewer samples than announced.".to_owned());
		}
		let planes: Vec<&[f32]> = (0..self.channels)
			.map(|c| &planar[c * frames..(c + 1) * frames])
			.collect();
		self.meter
			.add_frames_planar_f32(&planes)
			.map_err(|error| error.to_string())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn sine(rate: usize, seconds: usize, amplitude: f32) -> Vec<f32> {
		(0..rate * seconds)
			.map(|i| (i as f32 / rate as f32 * 1000.0 * std::f32::consts::TAU).sin() * amplitude)
			.collect()
	}

	/// BS.1770 is calibrated so a full-scale 1 kHz sine in one channel reads −3.01 LUFS: the same
	/// sine at −20 dBFS on both channels reads −20 LUFS.
	#[test]
	fn reads_the_reference_level() {
		let rate = 48_000;
		let mono = sine(rate, 2, 0.1);
		let mut meter = LoudnessMeter::create(2, rate as u32).unwrap();
		let block = rate / 10;
		let mut last = f64::NEG_INFINITY;
		let mut peak: f64 = 0.0;
		for step in 0..20 {
			let part = &mono[step * block..(step + 1) * block];
			let mut planar = part.to_vec();
			planar.extend(part);
			meter.add_planar(&planar, block).unwrap();
			last = meter.momentary();
			peak = peak.max(meter.true_peak());
		}
		assert!((last + 20.0).abs() < 0.1, "{last}");
		assert!((peak - 0.1).abs() < 0.002, "{peak}");
	}

	#[test]
	fn rejects_short_input() {
		let mut meter = LoudnessMeter::create(2, 48_000).unwrap();
		assert!(meter.add_planar(&[0.0; 10], 10).is_err());
	}
}

/// An AIFF file as WAV: the header to put in front of its sound data, and how that data changes.
#[wasm_bindgen]
pub struct AiffWav {
	header: Vec<u8>,
	reorder: import::Reorder,
	sample_bytes: u32,
	data_length: u32,
}

#[wasm_bindgen]
impl AiffWav {
	/// From the COMM chunk of an AIFF (or, `compressed`, AIFF-C) file and the length of its sound;
	/// `trailing` bytes of other chunks follow the sound.
	#[wasm_bindgen(constructor)]
	pub fn new(comm: &[u8], compressed: bool, sound_length: u32, trailing: u32) -> Result<AiffWav, JsError> {
		let format = import::aiff_format(comm, compressed).map_err(|error| JsError::new(&error))?;
		let sample_bytes = u32::from(format.bits.div_ceil(8));
		// A cut-off last frame is left out.
		let frame = sample_bytes * u32::from(format.channels);
		let data_length = sound_length - sound_length % frame;
		Ok(AiffWav {
			header: import::wav_header(
				format.channels,
				format.rate,
				format.bits,
				format.tag,
				data_length,
				trailing,
			),
			reorder: format.reorder,
			sample_bytes,
			data_length,
		})
	}

	pub fn header(&self) -> Vec<u8> {
		self.header.clone()
	}

	/// Bytes of one sample: sound data is converted in pieces of a multiple of it.
	pub fn sample_bytes(&self) -> u32 {
		self.sample_bytes
	}

	/// Bytes of sound data the WAV holds, whole frames only.
	pub fn data_length(&self) -> u32 {
		self.data_length
	}

	/// Turns a piece of AIFF sound data, of whole samples, into WAV sound data.
	pub fn convert(&self, data: &mut [u8]) {
		import::reorder(data, self.reorder);
	}
}

/// Interleaved little-endian PCM samples.
#[wasm_bindgen]
pub struct Pcm {
	inner: import::Pcm,
}

#[wasm_bindgen]
impl Pcm {
	pub fn channels(&self) -> u16 {
		self.inner.channels
	}

	pub fn rate(&self) -> u32 {
		self.inner.rate
	}

	/// 16, 24 or 32.
	pub fn bits(&self) -> u16 {
		self.inner.bits
	}

	/// The samples, handed over once.
	pub fn take_data(&mut self) -> Vec<u8> {
		std::mem::take(&mut self.inner.data)
	}
}

/// Decodes the Apple Lossless track of an MP4 (`.m4a`) file.
#[wasm_bindgen]
pub fn decode_alac(file: Vec<u8>) -> Result<Pcm, JsError> {
	import::decode_alac(file)
		.map(|inner| Pcm { inner })
		.map_err(|error| JsError::new(&error))
}
