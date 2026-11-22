//! Dolby TrueHD, the lossless sound of Blu-ray films, for Vixely: loaded when a film has it.

mod decoder;

use wasm_bindgen::prelude::*;

/// A Dolby TrueHD decoder, fed the stream's packets in order.
#[wasm_bindgen]
#[derive(Default)]
pub struct TrueHdDecoder {
	inner: decoder::TrueHd,
}

#[wasm_bindgen]
impl TrueHdDecoder {
	#[wasm_bindgen(constructor)]
	pub fn new() -> TrueHdDecoder {
		TrueHdDecoder::default()
	}

	/// The sound of a packet, interleaved: none until the first major sync.
	pub fn decode(&mut self, packet: &[u8]) -> Vec<f32> {
		self.inner.decode(packet)
	}

	/// Channels of the sound `decode` last gave.
	pub fn channels(&self) -> usize {
		self.inner.layout().0
	}

	/// Sample rate of the sound `decode` last gave.
	pub fn rate(&self) -> u32 {
		self.inner.layout().1
	}
}
