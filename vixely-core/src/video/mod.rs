mod matroska;
mod mp4;

use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuickProbeResult {
    pub duration: f64,
    pub bitrate: u64,
    pub format: String,
    pub streams: Vec<QuickStreamInfo>,
    #[serde(rename = "fontAttachments")]
    pub font_attachments: Vec<QuickFontAttachment>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuickStreamInfo {
    pub index: usize,
    #[serde(rename = "type")]
    pub kind: String,
    pub codec: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_forced: Option<bool>,
}

#[derive(Default, Serialize)]
pub(crate) struct QuickFontAttachment {
    pub index: usize,
    pub filename: String,
}

#[wasm_bindgen]
pub fn parse_media_header_json(data: &[u8]) -> String {
    let parsed = mp4::parse_mp4(data).or_else(|| matroska::parse_matroska(data));
    match parsed {
        Some(mut p) => {
            if !p.duration.is_finite() || p.duration < 0.0 {
                p.duration = 0.0;
            }
            serde_json::to_string(&p).unwrap_or_else(|_| "{}".to_string())
        }
        None => "{}".to_string(),
    }
}
