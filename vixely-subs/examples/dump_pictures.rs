//! Decodes the image subtitles of a Matroska track and writes each picture as a PPM file, to
//! check VobSub and DVB decoding against real files: `cargo run --example dump_pictures -- file.mkv 2 out/`.

use std::fs::{File, write};
use std::io::BufReader;

use vixely_subs::{dvb, mkv, pgs, vobsub};

fn main() {
	let args: Vec<String> = std::env::args().collect();
	let (path, number, out) = (&args[1], args[2].parse::<u64>().unwrap(), &args[3]);
	let size = std::fs::metadata(path).unwrap().len();
	let mut reader = BufReader::new(File::open(path).unwrap());
	let file = mkv::probe(&mut reader, size).unwrap();
	let track = file.tracks.iter().find(|t| t.number == number).unwrap().clone();
	let packets = mkv::extract_many(&mut reader, &file, &[number], &mut |_| {})
		.unwrap()
		.remove(0);
	println!("{} packets of {}", packets.len(), track.codec);
	let pictures: Vec<pgs::Picture> = match track.codec.as_str() {
		"S_VOBSUB" => {
			let mut stream = vobsub::Stream::new(&track.private);
			for (k, p) in packets.iter().enumerate() {
				stream.push(k as f64 * 2000.0, p.duration_ms, &p.data);
			}
			stream.take(true)
		}
		"S_DVBSUB" => {
			let mut stream = dvb::Stream::new();
			for (k, p) in packets.iter().enumerate() {
				stream.push(k as f64 * 1000.0, &p.data);
			}
			stream.take(true)
		}
		_ => panic!("not VobSub or DVB"),
	};
	for (k, picture) in pictures.iter().enumerate() {
		let (rect, rgba) = pgs::decode(&picture.set).unwrap();
		println!(
			"picture {k}: {:?} → {:?}, at {},{} {}×{} on {}×{}",
			picture.start_ms,
			picture.end_ms,
			rect.x,
			rect.y,
			rect.width,
			rect.height,
			picture.video_width,
			picture.video_height
		);
		// On grey, so transparency shows.
		let mut ppm = format!("P6 {} {} 255\n", rect.width, rect.height).into_bytes();
		for p in rgba.chunks_exact(4) {
			let a = u16::from(p[3]);
			for c in &p[..3] {
				ppm.push(((u16::from(*c) * a + 96 * (255 - a)) / 255) as u8);
			}
		}
		write(format!("{out}/{k}.ppm"), ppm).unwrap();
	}
}
