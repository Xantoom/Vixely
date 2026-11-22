//! EBML, the binary layout of Matroska: every element is an ID, a size, then its content, both
//! written as variable-length integers whose first byte tells their length.

use std::io::{self, Read, Seek, SeekFrom};

/// Size of an element whose end is not written (live recordings): it runs until its parent ends
/// or an element of a higher level starts.
pub const UNKNOWN: u64 = u64::MAX;

pub struct Header {
	pub id: u32,
	/// Content size in bytes, or UNKNOWN.
	pub size: u64,
	/// Where the content starts.
	pub start: u64,
}

impl Header {
	pub fn end(&self) -> u64 {
		if self.size == UNKNOWN {
			UNKNOWN
		} else {
			self.start + self.size
		}
	}
}

fn byte<R: Read>(r: &mut R) -> io::Result<u8> {
	let mut b = [0u8; 1];
	r.read_exact(&mut b)?;
	Ok(b[0])
}

/// Length of a variable-length integer from its first byte, 1 to 8.
fn vint_length(first: u8) -> io::Result<usize> {
	if first == 0 {
		return Err(io::Error::new(io::ErrorKind::InvalidData, "invalid EBML number"));
	}
	Ok(first.leading_zeros() as usize + 1)
}

/// An element ID: the length marker is kept, as IDs are written with it.
pub fn read_id<R: Read>(r: &mut R) -> io::Result<u32> {
	let first = byte(r)?;
	let length = vint_length(first)?;
	if length > 4 {
		return Err(io::Error::new(io::ErrorKind::InvalidData, "invalid EBML ID"));
	}
	let mut id = first as u32;
	for _ in 1..length {
		id = (id << 8) | byte(r)? as u32;
	}
	Ok(id)
}

/// A size or number: the length marker is removed. All ones means unknown.
pub fn read_vint<R: Read>(r: &mut R) -> io::Result<(u64, usize)> {
	let first = byte(r)?;
	let length = vint_length(first)?;
	let mut value = (first as u64) & (0xFF >> length);
	let mut all_ones = value == (0xFF >> length);
	for _ in 1..length {
		let b = byte(r)?;
		all_ones &= b == 0xFF;
		value = (value << 8) | b as u64;
	}
	Ok((if all_ones { UNKNOWN } else { value }, length))
}

pub fn read_header<R: Read + Seek>(r: &mut R) -> io::Result<Header> {
	let id = read_id(r)?;
	let (size, _) = read_vint(r)?;
	let start = r.stream_position()?;
	Ok(Header { id, size, start })
}

pub fn read_bytes<R: Read>(r: &mut R, size: u64) -> io::Result<Vec<u8>> {
	// Sizes come from the file: a corrupt one must not reserve gigabytes.
	if size > 256 << 20 {
		return Err(io::Error::new(io::ErrorKind::InvalidData, "element too large"));
	}
	let mut data = vec![0u8; size as usize];
	r.read_exact(&mut data)?;
	Ok(data)
}

pub fn read_uint<R: Read>(r: &mut R, size: u64) -> io::Result<u64> {
	if size > 8 {
		return Err(io::Error::new(io::ErrorKind::InvalidData, "integer too long"));
	}
	let mut value = 0u64;
	for _ in 0..size {
		value = (value << 8) | byte(r)? as u64;
	}
	Ok(value)
}

pub fn read_float<R: Read>(r: &mut R, size: u64) -> io::Result<f64> {
	match size {
		4 => Ok(f32::from_bits(read_uint(r, 4)? as u32) as f64),
		8 => Ok(f64::from_bits(read_uint(r, 8)?)),
		0 => Ok(0.0),
		_ => Err(io::Error::new(io::ErrorKind::InvalidData, "invalid float size")),
	}
}

/// A string, stopped at the first zero byte (Matroska pads strings with zeros).
pub fn read_string<R: Read>(r: &mut R, size: u64) -> io::Result<String> {
	let data = read_bytes(r, size)?;
	let end = data.iter().position(|&b| b == 0).unwrap_or(data.len());
	Ok(String::from_utf8_lossy(&data[..end]).into_owned())
}

pub fn skip_to<R: Seek>(r: &mut R, position: u64) -> io::Result<()> {
	r.seek(SeekFrom::Start(position))?;
	Ok(())
}

#[cfg(test)]
pub mod write {
	//! Writes EBML, to build test files.

	pub fn id(id: u32) -> Vec<u8> {
		let bytes = id.to_be_bytes();
		let skip = bytes.iter().position(|&b| b != 0).unwrap_or(3);
		bytes[skip..].to_vec()
	}

	pub fn size(size: u64) -> Vec<u8> {
		// Always 8 bytes: simple, and valid.
		let mut out = vec![0x01];
		out.extend_from_slice(&size.to_be_bytes()[1..]);
		out
	}

	pub fn element(element_id: u32, content: &[u8]) -> Vec<u8> {
		let mut out = id(element_id);
		out.extend(size(content.len() as u64));
		out.extend_from_slice(content);
		out
	}

	pub fn uint(element_id: u32, value: u64) -> Vec<u8> {
		element(element_id, &value.to_be_bytes())
	}

	pub fn string(element_id: u32, value: &str) -> Vec<u8> {
		element(element_id, value.as_bytes())
	}
}
