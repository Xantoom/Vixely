use gif::{Encoder, Frame, Repeat};
use wasm_bindgen::prelude::*;

/// Encode RGBA frames into a GIF.
///
/// `rgba_data`: all frames concatenated (width * height * 4 bytes per frame)
/// `width`, `height`: frame dimensions
/// `frame_count`: number of frames
/// `delay_cs`: delay between frames in centiseconds (100 = 1 second)
/// `max_colors`: max palette colors (2-256)
/// `speed`: quantization speed (1=best quality, 30=fastest)
#[wasm_bindgen]
pub fn encode_gif_frames(
    rgba_data: &[u8],
    width: u16,
    height: u16,
    frame_count: u32,
    delay_cs: u16,
    _max_colors: u16,
    speed: i32,
) -> Vec<u8> {
    let frame_size = width as usize * height as usize * 4;
    let mut output = Vec::new();

    {
        let mut encoder = Encoder::new(&mut output, width, height, &[]).unwrap();
        encoder.set_repeat(Repeat::Infinite).unwrap();

        let speed = speed.clamp(1, 30);

        for i in 0..frame_count as usize {
            let start = i * frame_size;
            let end = start + frame_size;

            if end > rgba_data.len() {
                break;
            }

            let mut frame_data = rgba_data[start..end].to_vec();
            let mut frame = Frame::from_rgba_speed(width, height, &mut frame_data, speed);
            frame.delay = delay_cs;
            encoder.write_frame(&frame).unwrap();
        }
    }

    output
}
