//! Noise reduction with RNNoise (Jean-Marc Valin's recurrent network, through its Rust port
//! nnnoiseless). The network works on 48 kHz audio in 10 ms frames: other rates are converted to
//! 48 kHz and back with a windowed-sinc resampler. The output lines up with the input sample for
//! sample, as long as the input, so it can replace it anywhere.

use nnnoiseless::DenoiseState;
use std::collections::VecDeque;

const RATE: u32 = 48_000;
const FRAME: usize = DenoiseState::FRAME_SIZE;
/// RNNoise hands back each frame one frame late: its analysis window overlaps the next one.
const NETWORK_DELAY: usize = FRAME;
/// Half the length of the resampler's kernel, in input samples.
const RADIUS: usize = 16;
/// Steps of the kernel table between two input samples.
const PHASES: usize = 256;

/// Converts a stream from one rate to another. Output sample `n` is the input read at time
/// `n / to`, so the two line up exactly; each comes out once the input around it has arrived.
struct Resampler {
	step: f64,
	/// Input position of the next output sample, from the start of `buffer`.
	position: f64,
	buffer: Vec<f32>,
	/// The kernel sampled `PHASES` times per input sample, from −RADIUS to +RADIUS.
	table: Vec<f32>,
	scale: f32,
}

impl Resampler {
	fn new(from: u32, to: u32) -> Resampler {
		let step = f64::from(from) / f64::from(to);
		// Going down, the kernel widens to cut what the lower rate can't hold.
		let cutoff = (1.0 / step).min(1.0) * 0.97;
		let size = 2 * RADIUS * PHASES + 1;
		let table = (0..size)
			.map(|index| {
				let x = index as f64 / PHASES as f64 - RADIUS as f64;
				let sinc = if x.abs() < 1e-9 {
					1.0
				} else {
					(std::f64::consts::PI * x * cutoff).sin() / (std::f64::consts::PI * x * cutoff)
				};
				// Blackman window over the kernel's length.
				let t = (index as f64 / (size - 1) as f64) * std::f64::consts::TAU;
				let window = 0.42 - 0.5 * t.cos() + 0.08 * (2.0 * t).cos();
				(sinc * window) as f32
			})
			.collect();
		Resampler {
			step,
			position: RADIUS as f64,
			// Silence before the start, so the first samples have their whole window.
			buffer: vec![0.0; RADIUS],
			table,
			scale: cutoff as f32,
		}
	}

	fn push(&mut self, input: &[f32], output: &mut Vec<f32>) {
		self.buffer.extend_from_slice(input);
		while (self.position.floor() as usize) + RADIUS < self.buffer.len() {
			let base = self.position.floor() as usize;
			let fraction = self.position - base as f64;
			let mut sum = 0.0f32;
			for k in 0..2 * RADIUS {
				// Input sample base − RADIUS + 1 + k, at distance d = k + 1 − RADIUS − fraction.
				let distance = (k + 1) as f64 - RADIUS as f64 - fraction;
				let at = ((distance + RADIUS as f64) * PHASES as f64).round() as usize;
				let weight = self.table.get(at).copied().unwrap_or(0.0);
				sum += self.buffer[base + 1 + k - RADIUS] * weight;
			}
			output.push(sum * self.scale);
			self.position += self.step;
		}
		// What no later output needs any more.
		let keep_from = (self.position.floor() as usize).saturating_sub(RADIUS);
		if keep_from > 4096 {
			self.buffer.drain(..keep_from);
			self.position -= keep_from as f64;
		}
	}
}

/// One channel: resampled to 48 kHz, denoised frame by frame, resampled back.
struct Channel {
	up: Option<Resampler>,
	down: Option<Resampler>,
	state: Box<DenoiseState<'static>>,
	/// 48 kHz samples waiting for a whole frame.
	pending: Vec<f32>,
	/// Frames' output still to skip, the network's delay.
	skip: usize,
	/// Input kept to mix back in, in step with the output.
	dry: VecDeque<f32>,
	/// Denoised samples at the input rate, not yet handed out.
	wet: VecDeque<f32>,
}

impl Channel {
	fn new(rate: u32) -> Channel {
		let resampled = rate != RATE;
		Channel {
			up: resampled.then(|| Resampler::new(rate, RATE)),
			down: resampled.then(|| Resampler::new(RATE, rate)),
			state: DenoiseState::new(),
			pending: Vec::new(),
			skip: NETWORK_DELAY,
			dry: VecDeque::new(),
			wet: VecDeque::new(),
		}
	}

	fn feed(&mut self, input: &[f32]) {
		self.dry.extend(input);
		let mut high = Vec::new();
		match &mut self.up {
			Some(up) => up.push(input, &mut high),
			None => high.extend_from_slice(input),
		}
		self.pending.extend(high);
		let mut denoised = Vec::new();
		let mut frame_in = [0.0f32; FRAME];
		let mut frame_out = [0.0f32; FRAME];
		let whole = self.pending.len() / FRAME * FRAME;
		for chunk in self.pending[..whole].chunks_exact(FRAME) {
			// The network expects 16-bit levels.
			for (to, from) in frame_in.iter_mut().zip(chunk) {
				*to = from * 32_768.0;
			}
			self.state.process_frame(&mut frame_out, &frame_in);
			let skipped = self.skip.min(FRAME);
			self.skip -= skipped;
			denoised.extend(frame_out[skipped..].iter().map(|value| value / 32_768.0));
		}
		self.pending.drain(..whole);
		match &mut self.down {
			Some(down) => {
				let mut low = Vec::new();
				down.push(&denoised, &mut low);
				self.wet.extend(low);
			}
			None => self.wet.extend(denoised),
		}
	}
}

/// Denoises planar audio of any rate, as a stream: each call hands back what is ready, and
/// `finish` the rest, so that the output is exactly as long as the input.
pub struct Denoiser {
	channels: Vec<Channel>,
	/// Share of the denoised sound, 0 to 1; the rest is the original.
	amount: f32,
}

impl Denoiser {
	pub fn new(channels: usize, rate: u32, amount: f32) -> Denoiser {
		Denoiser {
			channels: (0..channels).map(|_| Channel::new(rate)).collect(),
			amount: amount.clamp(0.0, 1.0),
		}
	}

	/// Adds `frames` frames of planar input; returns the planar output ready, and its frame count.
	pub fn process(&mut self, planar: &[f32], frames: usize) -> (Vec<f32>, usize) {
		for (index, channel) in self.channels.iter_mut().enumerate() {
			channel.feed(&planar[index * frames..(index + 1) * frames]);
		}
		self.take(false)
	}

	/// Pushes silence through until every input sample has its output.
	pub fn finish(&mut self) -> (Vec<f32>, usize) {
		let silence = vec![0.0f32; FRAME * 4 + 4 * RADIUS];
		for _ in 0..4 {
			for channel in &mut self.channels {
				let dry = channel.dry.len();
				channel.feed(&silence);
				// The silence itself is never output.
				channel.dry.truncate(dry);
			}
		}
		self.take(true)
	}

	fn take(&mut self, all: bool) -> (Vec<f32>, usize) {
		let ready = self
			.channels
			.iter()
			.map(|channel| if all { channel.dry.len() } else { channel.wet.len().min(channel.dry.len()) })
			.min()
			.unwrap_or(0);
		let mut out = Vec::with_capacity(ready * self.channels.len());
		for channel in &mut self.channels {
			for _ in 0..ready {
				let dry = channel.dry.pop_front().unwrap_or(0.0);
				let wet = channel.wet.pop_front().unwrap_or(0.0);
				out.push(wet * self.amount + dry * (1.0 - self.amount));
			}
		}
		(out, ready)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A voiced sound: bursts of a 150 Hz buzz with harmonics, as speech has.
	fn voice(rate: u32, seconds: f32) -> Vec<f32> {
		let count = (rate as f32 * seconds) as usize;
		(0..count)
			.map(|i| {
				let t = i as f32 / rate as f32;
				let on = ((t * 3.0).fract() < 0.6) as u8 as f32;
				let buzz: f32 = (1..12)
					.map(|h| (t * 150.0 * h as f32 * std::f32::consts::TAU).sin() / h as f32)
					.sum();
				buzz * 0.2 * on
			})
			.collect()
	}

	fn noise(count: usize, seed: &mut u32) -> Vec<f32> {
		(0..count)
			.map(|_| {
				*seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
				(*seed >> 8) as f32 / (1 << 24) as f32 - 0.5
			})
			.collect()
	}

	fn run(rate: u32, input: &[f32], chunk: usize, amount: f32) -> Vec<f32> {
		let mut denoiser = Denoiser::new(1, rate, amount);
		let mut out = Vec::new();
		for part in input.chunks(chunk) {
			out.extend(denoiser.process(part, part.len()).0);
		}
		out.extend(denoiser.finish().0);
		out
	}

	/// The lag, in samples, at which `output` best matches `input`.
	fn best_lag(input: &[f32], output: &[f32]) -> i32 {
		(-200..200)
			.max_by(|&a, &b| {
				let score = |lag: i32| -> f32 {
					(10_000..input.len() - 10_000)
						.map(|i| input[i] * output[(i as i32 + lag) as usize])
						.sum()
				};
				score(a).total_cmp(&score(b))
			})
			.unwrap()
	}

	fn energy(samples: &[f32]) -> f32 {
		samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32
	}

	#[test]
	fn keeps_length_and_timing_at_every_rate() {
		for rate in [48_000, 44_100, 16_000] {
			let input = voice(rate, 2.0);
			let output = run(rate, &input, 1_000, 1.0);
			assert_eq!(output.len(), input.len(), "{rate}");
			// The network's filters shift the phase by a sample or two at most.
			assert!(best_lag(&input, &output).abs() <= 3, "{rate}: {}", best_lag(&input, &output));
		}
	}

	#[test]
	fn resamples_without_moving_or_losing_the_sound() {
		let input = voice(44_100, 1.0);
		let mut up = Resampler::new(44_100, 48_000);
		let mut down = Resampler::new(48_000, 44_100);
		let mut high = Vec::new();
		up.push(&input, &mut high);
		up.push(&[0.0; 64], &mut high);
		let mut back = Vec::new();
		down.push(&high, &mut back);
		down.push(&[0.0; 64], &mut back);
		let error: f32 = input[1000..40_000].iter().zip(&back[1000..40_000]).map(|(a, b)| (a - b).powi(2)).sum();
		let signal: f32 = input[1000..40_000].iter().map(|a| a * a).sum();
		assert!(error / signal < 1e-3, "{}", error / signal);
	}

	#[test]
	fn removes_noise_and_keeps_the_voice() {
		let rate = 48_000;
		let clean = voice(rate, 3.0);
		let mut seed = 7;
		let hiss: Vec<f32> = noise(clean.len(), &mut seed).iter().map(|n| n * 0.1).collect();
		let noisy: Vec<f32> = clean.iter().zip(&hiss).map(|(c, n)| c + n).collect();
		let output = run(rate, &noisy, 4_096, 1.0);
		// Between the bursts only the hiss was left: it mostly goes.
		let gap = |samples: &[f32]| energy(&samples[(rate as f32 * 2.88) as usize..(rate as f32 * 2.99) as usize]);
		assert!(gap(&output) < gap(&noisy) * 0.1, "{} {}", gap(&output), gap(&noisy));
		// The voice stays.
		let burst = |samples: &[f32]| energy(&samples[(rate as f32 * 2.1) as usize..(rate as f32 * 2.5) as usize]);
		assert!(burst(&output) > burst(&clean) * 0.3, "{} {}", burst(&output), burst(&clean));
		// Half the amount is half-way between.
		let half = run(rate, &noisy, 4_096, 0.5);
		assert!(gap(&half) > gap(&output) && gap(&half) < gap(&noisy));
	}
}
