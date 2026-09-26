import { spawnSync } from 'node:child_process';
/**
 * Creates the sample files the scenarios open, in e2e/samples/. Needs the dev server running.
 *
 * - anim.gif: 60 frames of a moving circle on a gradient, 480 × 270, 3 s, made by gifski itself.
 * - long.wav: three hours of mono 8 kHz audio whose loudness follows a slow wave (173 MB).
 * - photo.heic: the example photo of the libheif project.
 * - sample.mkv, sup2.sup: PGS and ASS tracks muxed by mkvmerge, from the PGS-Subtitle-Parser project.
 * - film.mkv, live.mkv, film.mp4: a minute of test pattern with French SRT and English ASS tracks
 *   and an embedded font; live.mkv has no cues; film.mp4 carries the SRT as timed text. Made with
 *   FFmpeg when the FFMPEG variable points to it (a static build is enough).
 * - h264.mp4: 12 s of 1080p H.264 with B-frames and two audio tracks (English, French commentary).
 * - rotated.mp4: the same, stored turned as phones do (a display matrix of 90°); silent.mp4: the
 *   same without sound.
 * - ac3.mkv, dts.mkv: 8 s of test pattern with Dolby Digital 5.1 and DTS sound, which browsers
 *   don't decode; vfr.mp4: 6 s whose pictures come at irregular times, as phones record them;
 *   extra.fr.srt: a subtitle file to add to a video.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

mkdirSync('samples', { recursive: true });
mkdirSync('shots', { recursive: true });

if (!existsSync('samples/anim.gif')) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto('http://localhost:5173/');
	const bytes: number[] = await page.evaluate(async () => {
		const gif: any = await import('/src/wasm/vixely-gif/vixely_gif.js');
		await gif.default();
		const [w, h, n] = [480, 270, 60];
		const canvas = new OffscreenCanvas(w, h);
		const g = canvas.getContext('2d', { willReadFrequently: true })!;
		const writer = new gif.GifWriter(90, 100, 0, false);
		for (let i = 0; i < n; i++) {
			const grad = g.createLinearGradient(0, 0, w, h);
			grad.addColorStop(0, `hsl(${i * 6} 80% 50%)`);
			grad.addColorStop(1, `hsl(${i * 6 + 120} 80% 60%)`);
			g.fillStyle = grad;
			g.fillRect(0, 0, w, h);
			g.fillStyle = '#fff';
			g.beginPath();
			g.arc(40 + i * 7, h / 2 + Math.sin(i / 5) * 60, 30, 0, Math.PI * 2);
			g.fill();
			writer.add_frame(new Uint8Array(g.getImageData(0, 0, w, h).data.buffer), w, h, i / 20);
		}
		return Array.from(writer.finish() as Uint8Array);
	});
	writeFileSync('samples/anim.gif', Buffer.from(bytes));
	await browser.close();
	console.log('samples/anim.gif');
}

if (!existsSync('samples/long.wav')) {
	const rate = 8000;
	const seconds = 3 * 3600;
	const frames = rate * seconds;
	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + frames * 2, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(rate, 24);
	header.writeUInt32LE(rate * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36);
	header.writeUInt32LE(frames * 2, 40);
	const file = Bun.file('samples/long.wav').writer();
	file.write(header);
	const block = new Int16Array(rate);
	for (let s = 0; s < seconds; s++) {
		const level = 0.1 + 0.8 * Math.abs(Math.sin((s / 600) * Math.PI));
		for (let i = 0; i < rate; i++) block[i] = Math.round(Math.sin(((i % 40) / 40) * 2 * Math.PI) * level * 32000);
		file.write(new Uint8Array(block.buffer.slice(0)));
	}
	await file.end();
	console.log('samples/long.wav');
}

if (!existsSync('samples/photo.heic')) {
	const response = await fetch('https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic');
	if (response.ok) {
		writeFileSync('samples/photo.heic', Buffer.from(await response.arrayBuffer()));
		console.log('samples/photo.heic');
	} else {
		console.log('photo.heic: download failed', response.status);
	}
}

const PGS_SAMPLES = 'https://raw.githubusercontent.com/C0bra5/PGS-Subtitle-Parser/master/sample';
for (const name of ['sample.mkv', 'sup2.sup']) {
	if (existsSync(`samples/${name}`)) continue;
	const response = await fetch(`${PGS_SAMPLES}/${name}`);
	if (response.ok) {
		writeFileSync(`samples/${name}`, Buffer.from(await response.arrayBuffer()));
		console.log(`samples/${name}`);
	} else {
		console.log(`${name}: download failed`, response.status);
	}
}

const ffmpeg = process.env.FFMPEG;
if (!existsSync('samples/film.mkv') && ffmpeg) {
	const time = (s: number, comma: boolean) => {
		const ms = Math.round(s * 1000);
		const hms = [Math.floor(ms / 3_600_000), Math.floor(ms / 60_000) % 60, Math.floor(ms / 1000) % 60];
		return comma
			? `${hms.map((v) => String(v).padStart(2, '0')).join(':')},${String(ms % 1000).padStart(3, '0')}`
			: `${hms[0]}:${String(hms[1]).padStart(2, '0')}:${String(hms[2]).padStart(2, '0')}.${String(Math.round((ms % 1000) / 10)).padStart(2, '0')}`;
	};
	const starts = Array.from({ length: 20 }, (_, i) => 2 + i * 2.5);
	writeFileSync(
		'samples/fr.srt',
		starts
			.map(
				(s, i) =>
					`${i + 1}\n${time(s, true)} --> ${time(s + 1.8, true)}\n${i % 2 ? 'Ligne' : 'Réplique numéro'} ${i + 1}\n`,
			)
			.join('\n'),
	);
	// The embedded font is Ubuntu Condensed, whose family name is "Ubuntu".
	const style = (name: string, size: number, colour: string, bold: number, align: number) =>
		`Style: ${name},Ubuntu,${size},${colour},&H000000FF,&H00000000,&H80000000,${bold},0,0,0,100,100,0,0,1,2,1,${align},20,20,30,1`;
	writeFileSync(
		'samples/en.ass',
		[
			'[Script Info]',
			'ScriptType: v4.00+',
			'PlayResX: 1280',
			'PlayResY: 720',
			'',
			'[V4+ Styles]',
			'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
			style('Default', 44, '&H00FFFFFF', 0, 2),
			style('Sign', 36, '&H0000FFFF', -1, 8),
			'',
			'[Events]',
			'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
			...starts.map(
				(s, i) =>
					`Dialogue: 0,${time(s, false)},${time(s + 1.8, false)},Default,,0,0,0,,{\\i1}English{\\i0} line ${i + 1}, with comma`,
			),
			'Dialogue: 1,0:00:01.00,0:00:10.00,Sign,,0,0,0,,{\\pos(640,60)}A SIGN',
		].join('\n'),
	);
	const run = (...args: string[]) =>
		spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
	const font = '/usr/share/fonts/truetype/ubuntu/Ubuntu-C.ttf';
	run(
		'-f',
		'lavfi',
		'-i',
		'testsrc2=size=1280x720:rate=25:duration=60',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=330:duration=60',
		'-i',
		'samples/fr.srt',
		'-i',
		'samples/en.ass',
		'-map',
		'0',
		'-map',
		'1',
		'-map',
		'2',
		'-map',
		'3',
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'libopus',
		'-b:a',
		'64k',
		'-c:s:0',
		'srt',
		'-c:s:1',
		'ass',
		'-metadata:s:s:0',
		'language=fre',
		'-metadata:s:s:1',
		'language=eng',
		'-metadata:s:s:1',
		'title=English (styled)',
		'-disposition:s:0',
		'default',
		'-disposition:s:1',
		'0',
		...(existsSync(font) ? ['-attach', font, '-metadata:s:t', 'mimetype=font/ttf'] : []),
		'samples/film.mkv',
	);
	run('-i', 'samples/film.mkv', '-map', '0', '-c', 'copy', '-live', '1', '-f', 'matroska', 'samples/live.mkv');
	run(
		'-i',
		'samples/film.mkv',
		'-map',
		'0:v',
		'-map',
		'0:a',
		'-map',
		'0:s:0',
		'-c:v',
		'copy',
		'-c:a',
		'aac',
		'-c:s',
		'mov_text',
		'-metadata:s:s:0',
		'language=fre',
		'samples/film.mp4',
	);
	console.log('samples/film.mkv, live.mkv, film.mp4');
} else if (!existsSync('samples/film.mkv')) {
	console.log('film.mkv: set FFMPEG to an ffmpeg binary to make the subtitle samples');
}

if (!existsSync('samples/h264.mp4') && ffmpeg) {
	// Plain 1080p H.264 with B-frames (its first picture comes after zero) and two audio tracks.
	spawnSync(
		ffmpeg,
		[
			'-hide_banner',
			'-loglevel',
			'error',
			'-y',
			...['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30000/1001'],
			...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'],
			...['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000'],
			...['-t', '12', '-map', '0:v', '-map', '1:a', '-map', '2:a'],
			...['-c:v', 'libx264', '-profile:v', 'high', '-bf', '3', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
			...[
				'-metadata:s:a:0',
				'language=eng',
				'-metadata:s:a:1',
				'language=fre',
				'-metadata:s:a:1',
				'title=Commentaire',
			],
			...['-movflags', '+faststart', 'samples/h264.mp4'],
		],
		{ stdio: 'inherit' },
	);
	console.log('samples/h264.mp4');
}

if (existsSync('samples/h264.mp4') && ffmpeg) {
	// Phones store portrait video turned, with a rotation for players to apply.
	if (!existsSync('samples/rotated.mp4')) {
		spawnSync(ffmpeg, ['-v', 'error', '-y', '-display_rotation:v:0', '90', '-i', 'samples/h264.mp4', '-map', '0', '-c', 'copy', 'samples/rotated.mp4'], {
			stdio: 'inherit',
		});
		console.log('samples/rotated.mp4');
	}
	if (!existsSync('samples/silent.mp4')) {
		spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', 'samples/h264.mp4', '-an', '-c', 'copy', 'samples/silent.mp4'], {
			stdio: 'inherit',
		});
		console.log('samples/silent.mp4');
	}
}

if (ffmpeg) {
	const make = (name: string, args: string[]) => {
		if (existsSync(`samples/${name}`)) return;
		spawnSync(ffmpeg, ['-v', 'error', '-y', ...args, `samples/${name}`], { stdio: 'inherit' });
		console.log(`samples/${name}`);
	};
	const pattern = ['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=8'];
	const h264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
	make('ac3.mkv', [...pattern, '-f', 'lavfi', '-i', 'sine=f=440:d=8', ...h264, '-c:a', 'ac3', '-ac', '6', '-b:a', '384k']);
	make('dts.mkv', [...pattern, '-f', 'lavfi', '-i', 'sine=f=330:d=8', ...h264, '-c:a', 'dca', '-strict', '-2', '-ac', '2']);
	// Pictures 17 to 50 ms apart, off any regular lattice.
	make('vfr.mp4', [
		'-f',
		'lavfi',
		'-i',
		'testsrc2=s=640x360:r=30:d=6',
		'-vf',
		"settb=1/90000,setpts='(N/30+if(gte(N\\,60)\\,(N-60)*0.012\\,0)+0.011*sin(N*1.7))/TB'",
		'-fps_mode',
		'vfr',
		'-enc_time_base',
		'1/90000',
		'-video_track_timescale',
		'90000',
		...h264,
	]);
}
if (!existsSync('samples/extra.fr.srt')) {
	writeFileSync(
		'samples/extra.fr.srt',
		'1\n00:00:01,000 --> 00:00:03,000\nAdded line one\n\n2\n00:00:04,000 --> 00:00:06,000\nAdded line two\n',
	);
	console.log('samples/extra.fr.srt');
}
