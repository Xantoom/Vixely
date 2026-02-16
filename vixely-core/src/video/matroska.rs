use crate::common::{read_float_be, read_uint_be, read_utf8};
use crate::video::{QuickProbeResult, QuickStreamInfo};

#[derive(Default)]
pub(crate) struct MkvTrackTemp {
    pub kind: Option<String>,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub language: Option<String>,
    pub is_default: Option<bool>,
    pub is_forced: Option<bool>,
}

pub(crate) fn parse_matroska(data: &[u8]) -> Option<QuickProbeResult> {
    if data.len() < 4 || data[0..4] != [0x1A, 0x45, 0xDF, 0xA3] {
        return None;
    }

    let mut format = "matroska".to_string();
    let mut duration_ticks: Option<f64> = None;
    let mut timecode_scale: u64 = 1_000_000;
    let mut tracks: Vec<MkvTrackTemp> = Vec::new();

    let mut offset = 0usize;
    while offset < data.len() {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > data.len() {
            break;
        }
        let payload_end = if unknown {
            data.len()
        } else {
            payload_start.saturating_add(size as usize).min(data.len())
        };
        if payload_end <= payload_start {
            break;
        }

        match id {
            0x4282 => {
                let s = read_utf8(&data[payload_start..payload_end]);
                if !s.is_empty() {
                    format = s;
                }
            }
            0x1853_8067 => parse_matroska_segment(
                data,
                payload_start,
                payload_end,
                &mut duration_ticks,
                &mut timecode_scale,
                &mut tracks,
            ),
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }

    let streams: Vec<QuickStreamInfo> = tracks
        .into_iter()
        .enumerate()
        .filter_map(|(index, t)| {
            let kind = t.kind?;
            Some(QuickStreamInfo {
                index,
                kind,
                codec: t.codec.unwrap_or_else(|| "unknown".to_string()),
                width: t.width,
                height: t.height,
                fps: t.fps,
                sample_rate: t.sample_rate,
                channels: t.channels,
                language: t.language,
                bitrate: None,
                is_default: t.is_default,
                is_forced: t.is_forced,
            })
        })
        .collect();

    if streams.is_empty() {
        return None;
    }

    let duration = duration_ticks
        .map(|ticks| ticks * (timecode_scale as f64) / 1_000_000_000.0)
        .unwrap_or(0.0);

    Some(QuickProbeResult {
        duration,
        bitrate: 0,
        format,
        streams,
        font_attachments: vec![],
    })
}

fn parse_matroska_segment(
    data: &[u8],
    start: usize,
    end: usize,
    duration_ticks: &mut Option<f64>,
    timecode_scale: &mut u64,
    tracks: &mut Vec<MkvTrackTemp>,
) {
    let mut offset = start;
    while offset < end {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > end {
            break;
        }
        let payload_end = if unknown {
            end
        } else {
            payload_start.saturating_add(size as usize).min(end)
        };
        if payload_end <= payload_start {
            break;
        }

        match id {
            0x1549_A966 => {
                parse_matroska_info(
                    data,
                    payload_start,
                    payload_end,
                    duration_ticks,
                    timecode_scale,
                )
            }
            0x1654_AE6B => parse_matroska_tracks(data, payload_start, payload_end, tracks),
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }
}

fn parse_matroska_info(
    data: &[u8],
    start: usize,
    end: usize,
    duration_ticks: &mut Option<f64>,
    timecode_scale: &mut u64,
) {
    let mut offset = start;
    while offset < end {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > end {
            break;
        }
        let payload_end = if unknown {
            end
        } else {
            payload_start.saturating_add(size as usize).min(end)
        };
        if payload_end <= payload_start {
            break;
        }

        match id {
            0x002A_D7B1 => {
                if let Some(v) = read_uint_be(&data[payload_start..payload_end]) {
                    *timecode_scale = v.max(1);
                }
            }
            0x4489 => {
                *duration_ticks = read_float_be(&data[payload_start..payload_end]);
            }
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }
}

fn parse_matroska_tracks(data: &[u8], start: usize, end: usize, tracks: &mut Vec<MkvTrackTemp>) {
    let mut offset = start;
    while offset < end {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > end {
            break;
        }
        let payload_end = if unknown {
            end
        } else {
            payload_start.saturating_add(size as usize).min(end)
        };
        if payload_end <= payload_start {
            break;
        }

        if id == 0xAE {
            let track = parse_matroska_track_entry(data, payload_start, payload_end);
            if track.kind.is_some() {
                tracks.push(track);
            }
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }
}

fn parse_matroska_track_entry(data: &[u8], start: usize, end: usize) -> MkvTrackTemp {
    let mut track = MkvTrackTemp::default();

    let mut offset = start;
    while offset < end {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > end {
            break;
        }
        let payload_end = if unknown {
            end
        } else {
            payload_start.saturating_add(size as usize).min(end)
        };
        if payload_end <= payload_start {
            break;
        }

        let payload = &data[payload_start..payload_end];

        match id {
            0x83 => {
                if let Some(v) = read_uint_be(payload) {
                    track.kind = match v {
                        1 => Some("video".to_string()),
                        2 => Some("audio".to_string()),
                        17 => Some("subtitle".to_string()),
                        _ => None,
                    }
                }
            }
            0x86 => {
                let codec = read_utf8(payload);
                if !codec.is_empty() {
                    track.codec = Some(normalize_mkv_codec(&codec));
                }
            }
            0x0022_B59C => {
                let lang = read_utf8(payload);
                if !lang.is_empty() {
                    track.language = Some(lang);
                }
            }
            0x88 => track.is_default = read_uint_be(payload).map(|v| v != 0),
            0x55AA => track.is_forced = read_uint_be(payload).map(|v| v != 0),
            0x0023_E383 => {
                if let Some(v) = read_uint_be(payload) && v > 0 {
                    track.fps = Some(1_000_000_000f64 / v as f64);
                }
            }
            0xE0 => parse_matroska_video(payload, &mut track),
            0xE1 => parse_matroska_audio(payload, &mut track),
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }

    track
}

fn parse_matroska_video(data: &[u8], track: &mut MkvTrackTemp) {
    let mut offset = 0usize;
    while offset < data.len() {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > data.len() {
            break;
        }
        let payload_end = if unknown {
            data.len()
        } else {
            payload_start.saturating_add(size as usize).min(data.len())
        };
        if payload_end <= payload_start {
            break;
        }

        match id {
            0xB0 => track.width = read_uint_be(&data[payload_start..payload_end]).map(|v| v as u32),
            0xBA => track.height = read_uint_be(&data[payload_start..payload_end]).map(|v| v as u32),
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }
}

fn parse_matroska_audio(data: &[u8], track: &mut MkvTrackTemp) {
    let mut offset = 0usize;
    while offset < data.len() {
        let (id, id_len) = match read_ebml_id(data, offset) {
            Some(v) => v,
            None => break,
        };
        let (size, size_len, unknown) = match read_ebml_size(data, offset + id_len) {
            Some(v) => v,
            None => break,
        };
        let payload_start = offset + id_len + size_len;
        if payload_start > data.len() {
            break;
        }
        let payload_end = if unknown {
            data.len()
        } else {
            payload_start.saturating_add(size as usize).min(data.len())
        };
        if payload_end <= payload_start {
            break;
        }

        match id {
            0x9F => track.channels = read_uint_be(&data[payload_start..payload_end]).map(|v| v as u32),
            0xB5 => {
                track.sample_rate = read_float_be(&data[payload_start..payload_end]).map(|v| v.round() as u32)
            }
            _ => {}
        }

        if unknown {
            break;
        }
        offset = payload_end;
    }
}

fn normalize_mkv_codec(codec: &str) -> String {
    let lower = codec.to_ascii_lowercase();
    if lower.contains("av1") {
        "av1".to_string()
    } else if lower.contains("vp9") {
        "vp9".to_string()
    } else if lower.contains("vp8") {
        "vp8".to_string()
    } else if lower.contains("h264") || lower.contains("avc") {
        "h264".to_string()
    } else if lower.contains("hevc") || lower.contains("h265") {
        "hevc".to_string()
    } else if lower.contains("opus") {
        "opus".to_string()
    } else if lower.contains("aac") {
        "aac".to_string()
    } else if lower.contains("vorbis") {
        "vorbis".to_string()
    } else {
        lower
    }
}

pub(crate) fn read_ebml_id(data: &[u8], offset: usize) -> Option<(u32, usize)> {
    let first = *data.get(offset)?;
    let mut mask = 0x80u8;
    let mut len = 1usize;
    while len <= 4 && (first & mask) == 0 {
        mask >>= 1;
        len += 1;
    }
    if len > 4 || offset + len > data.len() {
        return None;
    }

    let mut id = 0u32;
    for i in 0..len {
        id = (id << 8) | (*data.get(offset + i)? as u32);
    }
    Some((id, len))
}

pub(crate) fn read_ebml_size(data: &[u8], offset: usize) -> Option<(u64, usize, bool)> {
    let first = *data.get(offset)?;
    let mut mask = 0x80u8;
    let mut len = 1usize;
    while len <= 8 && (first & mask) == 0 {
        mask >>= 1;
        len += 1;
    }
    if len > 8 || offset + len > data.len() {
        return None;
    }

    let mut value = (first & !mask) as u64;
    for i in 1..len {
        value = (value << 8) | (*data.get(offset + i)? as u64);
    }

    let usable_bits = 7 * len;
    let unknown_marker = if usable_bits >= 64 {
        u64::MAX
    } else {
        (1u64 << usable_bits) - 1
    };
    let unknown = value == unknown_marker;

    Some((value, len, unknown))
}
