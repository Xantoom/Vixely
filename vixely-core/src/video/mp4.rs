use crate::common::{read_u16_be, read_u32_be, read_u64_be};
use crate::video::{QuickProbeResult, QuickStreamInfo};

#[derive(Default)]
pub(crate) struct Mp4TrackTemp {
    pub kind: Option<String>,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub language: Option<String>,
    pub duration: Option<f64>,
}

pub(crate) fn parse_mp4(data: &[u8]) -> Option<QuickProbeResult> {
    if data.len() < 12 {
        return None;
    }

    let mut has_ftyp = false;
    let mut format = "mp4".to_string();
    let mut duration = 0.0f64;
    let mut tracks: Vec<Mp4TrackTemp> = Vec::new();

    let mut offset = 0usize;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, data.len()) {
        match &typ {
            b"ftyp" => {
                has_ftyp = true;
                if payload_end >= payload_start + 4 {
                    let major = &data[payload_start..payload_start + 4];
                    let major_str = String::from_utf8_lossy(major).to_ascii_lowercase();
                    if major_str == "qt  " {
                        format = "mov".to_string();
                    } else {
                        format = major_str.trim().to_string();
                    }
                }
            }
            b"moov" => parse_moov(data, payload_start, payload_end, &mut duration, &mut tracks),
            _ => {}
        }
        if next <= offset {
            break;
        }
        offset = next;
    }

    if !has_ftyp {
        return None;
    }

    if duration <= 0.0 {
        duration = tracks
            .iter()
            .filter_map(|t| t.duration)
            .fold(0.0f64, |acc, value| if value > acc { value } else { acc });
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
                is_default: None,
                is_forced: None,
            })
        })
        .collect();

    if streams.is_empty() {
        return None;
    }

    Some(QuickProbeResult {
        duration,
        bitrate: 0,
        format,
        streams,
        font_attachments: vec![],
    })
}

fn parse_moov(data: &[u8], start: usize, end: usize, duration: &mut f64, tracks: &mut Vec<Mp4TrackTemp>) {
    let mut offset = start;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, end) {
        match &typ {
            b"mvhd" => {
                if let Some(dur) = parse_mvhd(&data[payload_start..payload_end]) {
                    *duration = dur;
                }
            }
            b"trak" => {
                let track = parse_trak(data, payload_start, payload_end);
                if track.kind.is_some() {
                    tracks.push(track);
                }
            }
            _ => {}
        }
        if next <= offset {
            break;
        }
        offset = next;
    }
}

fn parse_mvhd(payload: &[u8]) -> Option<f64> {
    if payload.len() < 24 {
        return None;
    }
    let version = payload[0];
    if version == 1 {
        if payload.len() < 32 {
            return None;
        }
        let timescale = read_u32_be(payload, 20)?;
        let dur = read_u64_be(payload, 24)?;
        if timescale == 0 {
            return None;
        }
        Some(dur as f64 / timescale as f64)
    } else {
        let timescale = read_u32_be(payload, 12)?;
        let dur = read_u32_be(payload, 16)?;
        if timescale == 0 {
            return None;
        }
        Some(dur as f64 / timescale as f64)
    }
}

fn parse_trak(data: &[u8], start: usize, end: usize) -> Mp4TrackTemp {
    let mut track = Mp4TrackTemp::default();

    let mut offset = start;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, end) {
        match &typ {
            b"tkhd" => parse_tkhd(&data[payload_start..payload_end], &mut track),
            b"mdia" => parse_mdia(data, payload_start, payload_end, &mut track),
            _ => {}
        }
        if next <= offset {
            break;
        }
        offset = next;
    }

    track
}

fn parse_tkhd(payload: &[u8], track: &mut Mp4TrackTemp) {
    if payload.len() < 84 {
        return;
    }
    let version = payload[0];
    let (width_off, height_off) = if version == 1 { (88usize, 92usize) } else { (76usize, 80usize) };
    let width = read_u32_be(payload, width_off).map(|v| v >> 16);
    let height = read_u32_be(payload, height_off).map(|v| v >> 16);
    if track.width.is_none() {
        track.width = width;
    }
    if track.height.is_none() {
        track.height = height;
    }
}

fn parse_mdia(data: &[u8], start: usize, end: usize, track: &mut Mp4TrackTemp) {
    let mut timescale: Option<u32> = None;

    let mut offset = start;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, end) {
        match &typ {
            b"hdlr" => parse_hdlr(&data[payload_start..payload_end], track),
            b"mdhd" => parse_mdhd(&data[payload_start..payload_end], &mut timescale, track),
            b"minf" => parse_minf(data, payload_start, payload_end, timescale, track),
            _ => {}
        }
        if next <= offset {
            break;
        }
        offset = next;
    }
}

fn parse_hdlr(payload: &[u8], track: &mut Mp4TrackTemp) {
    if payload.len() < 12 {
        return;
    }
    let handler = &payload[8..12];
    let kind = match handler {
        b"vide" => Some("video"),
        b"soun" => Some("audio"),
        b"text" | b"sbtl" | b"subt" | b"clcp" => Some("subtitle"),
        _ => None,
    };
    if let Some(k) = kind {
        track.kind = Some(k.to_string());
    }
}

fn parse_mdhd(payload: &[u8], timescale: &mut Option<u32>, track: &mut Mp4TrackTemp) {
    if payload.len() < 24 {
        return;
    }
    let version = payload[0];
    if version == 1 {
        if payload.len() < 36 {
            return;
        }
        let ts = match read_u32_be(payload, 20) {
            Some(v) => v,
            None => return,
        };
        let dur = match read_u64_be(payload, 24) {
            Some(v) => v,
            None => return,
        };
        let lang = read_u16_be(payload, 32);
        *timescale = Some(ts);
        if ts > 0 {
            track.duration = Some(dur as f64 / ts as f64);
        }
        track.language = lang.and_then(decode_mp4_language);
    } else {
        let ts = match read_u32_be(payload, 12) {
            Some(v) => v,
            None => return,
        };
        let dur = match read_u32_be(payload, 16) {
            Some(v) => v,
            None => return,
        };
        let lang = read_u16_be(payload, 20);
        *timescale = Some(ts);
        if ts > 0 {
            track.duration = Some(dur as f64 / ts as f64);
        }
        track.language = lang.and_then(decode_mp4_language);
    }
}

fn parse_minf(data: &[u8], start: usize, end: usize, timescale: Option<u32>, track: &mut Mp4TrackTemp) {
    let mut offset = start;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, end) {
        if &typ == b"stbl" {
            parse_stbl(data, payload_start, payload_end, timescale, track);
        }
        if next <= offset {
            break;
        }
        offset = next;
    }
}

fn parse_stbl(data: &[u8], start: usize, end: usize, timescale: Option<u32>, track: &mut Mp4TrackTemp) {
    let mut offset = start;
    while let Some((typ, payload_start, payload_end, next)) = next_mp4_box(data, offset, end) {
        match &typ {
            b"stsd" => parse_stsd(&data[payload_start..payload_end], track),
            b"stts" => parse_stts(&data[payload_start..payload_end], timescale, track),
            _ => {}
        }
        if next <= offset {
            break;
        }
        offset = next;
    }
}

fn parse_stsd(payload: &[u8], track: &mut Mp4TrackTemp) {
    if payload.len() < 16 {
        return;
    }

    let entry_count = match read_u32_be(payload, 4) {
        Some(v) => v as usize,
        None => return,
    };
    if entry_count == 0 {
        return;
    }

    let offset = 8usize;
    if offset + 8 > payload.len() {
        return;
    }
    let size = match read_u32_be(payload, offset) {
        Some(v) => v as usize,
        None => return,
    };
    if size < 8 || offset + size > payload.len() {
        return;
    }

    let typ = &payload[offset + 4..offset + 8];
    let codec = String::from_utf8_lossy(typ).to_ascii_lowercase();
    track.codec = Some(codec.trim().to_string());

    if track.kind.as_deref() == Some("video") && size >= 36 {
        track.width = read_u16_be(payload, offset + 32).map(|v| v as u32);
        track.height = read_u16_be(payload, offset + 34).map(|v| v as u32);
    } else if track.kind.as_deref() == Some("audio") && size >= 36 {
        track.channels = read_u16_be(payload, offset + 24).map(|v| v as u32);
        track.sample_rate = read_u32_be(payload, offset + 32).map(|v| v >> 16);
    }
}

fn parse_stts(payload: &[u8], timescale: Option<u32>, track: &mut Mp4TrackTemp) {
    if track.kind.as_deref() != Some("video") {
        return;
    }
    let ts = match timescale {
        Some(v) if v > 0 => v,
        _ => return,
    };
    if payload.len() < 16 {
        return;
    }
    let entry_count = match read_u32_be(payload, 4) {
        Some(v) => v,
        None => return,
    };
    if entry_count == 0 {
        return;
    }
    let sample_duration = match read_u32_be(payload, 12) {
        Some(v) if v > 0 => v,
        _ => return,
    };
    track.fps = Some(ts as f64 / sample_duration as f64);
}

fn decode_mp4_language(raw: u16) -> Option<String> {
    if raw == 0 {
        return None;
    }
    let a = (((raw >> 10) & 0x1F) as u8).saturating_add(0x60);
    let b = (((raw >> 5) & 0x1F) as u8).saturating_add(0x60);
    let c = ((raw & 0x1F) as u8).saturating_add(0x60);
    if !(a.is_ascii_lowercase() && b.is_ascii_lowercase() && c.is_ascii_lowercase()) {
        return None;
    }
    Some(String::from_utf8_lossy(&[a, b, c]).to_string())
}

fn next_mp4_box(
    data: &[u8],
    offset: usize,
    limit: usize,
) -> Option<([u8; 4], usize, usize, usize)> {
    if offset + 8 > limit || offset + 8 > data.len() {
        return None;
    }

    let size32 = read_u32_be(data, offset)? as u64;
    let mut typ = [0u8; 4];
    typ.copy_from_slice(&data[offset + 4..offset + 8]);

    let (size, header) = if size32 == 1 {
        if offset + 16 > limit || offset + 16 > data.len() {
            return None;
        }
        (read_u64_be(data, offset + 8)?, 16usize)
    } else if size32 == 0 {
        ((limit - offset) as u64, 8usize)
    } else {
        (size32, 8usize)
    };

    if size < header as u64 {
        return None;
    }

    let end = offset.checked_add(size as usize)?;
    if end > limit || end > data.len() {
        return None;
    }

    Some((typ, offset + header, end, end))
}
