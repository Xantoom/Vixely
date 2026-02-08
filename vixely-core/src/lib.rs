use wasm_bindgen::prelude::*;

/// Apply brightness, contrast, and saturation adjustments to raw RGBA pixel data.
///
/// - `image_data`: mutable RGBA u8 slice (length must be divisible by 4)
/// - `brightness`: additive offset in [-1.0, 1.0] range (0.0 = no change)
/// - `contrast`:   multiplier where 1.0 = no change, >1.0 = more contrast
/// - `saturation`: multiplier where 1.0 = no change, 0.0 = grayscale
#[wasm_bindgen]
pub fn apply_filters(image_data: &mut [u8], brightness: f32, contrast: f32, saturation: f32) {
    let len = image_data.len();
    if !len.is_multiple_of(4) {
        return;
    }

    let pixel_count = len / 4;

    for i in 0..pixel_count {
        let base = i * 4;

        // Read RGB, skip alpha
        let mut r = image_data[base] as f32 / 255.0;
        let mut g = image_data[base + 1] as f32 / 255.0;
        let mut b = image_data[base + 2] as f32 / 255.0;

        // --- Brightness (additive) ---
        r += brightness;
        g += brightness;
        b += brightness;

        // --- Contrast (pivot around 0.5) ---
        r = (r - 0.5) * contrast + 0.5;
        g = (g - 0.5) * contrast + 0.5;
        b = (b - 0.5) * contrast + 0.5;

        // --- Saturation (lerp toward luminance) ---
        // ITU-R BT.709 luma coefficients
        let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * saturation;
        g = luma + (g - luma) * saturation;
        b = luma + (b - luma) * saturation;

        // Clamp and write back
        image_data[base] = clamp_u8(r);
        image_data[base + 1] = clamp_u8(g);
        image_data[base + 2] = clamp_u8(b);
        // Alpha (base + 3) is untouched
    }
}

#[inline(always)]
fn clamp_u8(v: f32) -> u8 {
    (v * 255.0).round().clamp(0.0, 255.0) as u8
}
