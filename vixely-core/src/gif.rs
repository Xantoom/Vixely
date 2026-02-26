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
    encode_gif_frames_ex(
        rgba_data,
        width,
        height,
        frame_count,
        delay_cs,
        _max_colors,
        speed,
        0,
        &[],
    )
}

/// Extended GIF encoder with loop count and per-frame delays.
///
/// `loop_count`: 0 = infinite, N = play N times, 0xFFFF = no loop extension
/// `frame_delays_cs`: optional per-frame delays (centiseconds). If empty, uses `delay_cs` for all.
#[allow(clippy::too_many_arguments)] // wasm-bindgen exports a flat ABI, so this intentionally stays explicit.
#[wasm_bindgen]
pub fn encode_gif_frames_ex(
    rgba_data: &[u8],
    width: u16,
    height: u16,
    frame_count: u32,
    delay_cs: u16,
    _max_colors: u16,
    speed: i32,
    loop_count: u16,
    frame_delays_cs: &[u16],
) -> Vec<u8> {
    let frame_size = width as usize * height as usize * 4;
    let mut output = Vec::new();

    {
        let mut encoder = Encoder::new(&mut output, width, height, &[]).unwrap();

        let repeat = if loop_count == 0 {
            Repeat::Infinite
        } else {
            Repeat::Finite(loop_count)
        };
        encoder.set_repeat(repeat).unwrap();

        let speed = speed.clamp(1, 30);

        for i in 0..frame_count as usize {
            let start = i * frame_size;
            let end = start + frame_size;

            if end > rgba_data.len() {
                break;
            }

            let mut frame_data = rgba_data[start..end].to_vec();
            let mut frame = Frame::from_rgba_speed(width, height, &mut frame_data, speed);
            frame.delay = if i < frame_delays_cs.len() {
                frame_delays_cs[i]
            } else {
                delay_cs
            };
            encoder.write_frame(&frame).unwrap();
        }
    }

    output
}
