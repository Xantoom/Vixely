//! Audio analysis for Vixely, loaded by the audio editor only.
//!
//! Loudness follows EBU R128 (ITU-R BS.1770): audio is K-weighted, and its energy over 400 ms
//! blocks, taken every 100 ms, is what integrated loudness gates and averages. The meter here
//! reports those blocks one by one instead of a single figure, so the page can measure any part of
//! the file (the audio left after cuts, with its gain and fades) without decoding it again.

use ebur128::{EbuR128, Mode};
use wasm_bindgen::prelude::*;

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
		(0..self.channels as u32).filter_map(|c| self.meter.prev_true_peak(c).ok()).fold(0.0, f64::max)
	}
}

impl LoudnessMeter {
	fn create(channels: u32, rate: u32) -> Result<LoudnessMeter, String> {
		let meter = EbuR128::new(channels, rate, Mode::M | Mode::TRUE_PEAK).map_err(|error| error.to_string())?;
		Ok(LoudnessMeter { meter, channels: channels as usize })
	}

	fn add_planar(&mut self, planar: &[f32], frames: usize) -> Result<(), String> {
		if planar.len() < frames * self.channels {
			return Err("Fewer samples than announced.".to_owned());
		}
		let planes: Vec<&[f32]> = (0..self.channels).map(|c| &planar[c * frames..(c + 1) * frames]).collect();
		self.meter.add_frames_planar_f32(&planes).map_err(|error| error.to_string())
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
