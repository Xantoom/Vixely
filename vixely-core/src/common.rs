pub(crate) fn read_u16_be(data: &[u8], offset: usize) -> Option<u16> {
    let bytes = data.get(offset..offset + 2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

pub(crate) fn read_u32_be(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

pub(crate) fn read_u64_be(data: &[u8], offset: usize) -> Option<u64> {
    let bytes = data.get(offset..offset + 8)?;
    Some(u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]))
}

pub(crate) fn read_uint_be(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() || bytes.len() > 8 {
        return None;
    }
    let mut value = 0u64;
    for &b in bytes {
        value = (value << 8) | b as u64;
    }
    Some(value)
}

pub(crate) fn read_float_be(bytes: &[u8]) -> Option<f64> {
    if bytes.len() == 4 {
        let arr: [u8; 4] = bytes.try_into().ok()?;
        Some(f32::from_be_bytes(arr) as f64)
    } else if bytes.len() == 8 {
        let arr: [u8; 8] = bytes.try_into().ok()?;
        Some(f64::from_be_bytes(arr))
    } else {
        None
    }
}

pub(crate) fn read_utf8(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .trim_matches('\0')
        .trim()
        .to_string()
}
