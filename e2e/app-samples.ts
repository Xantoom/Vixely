/**
 * The example files the editors offer ("Try an example"), written to public/samples/. All made
 * here, so they carry no one else's rights: a painted landscape, the same landscape as a 10 s
 * video at sunset with music and English and French subtitles, a GIF of it, and the music alone.
 *
 *   FFMPEG=/path/to/ffmpeg bun app-samples.ts
 */
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG;
if (!ffmpeg) throw new Error('Set FFMPEG to an ffmpeg binary');
const out = join(import.meta.dir, '..', 'public', 'samples');
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'vixely-samples-'));

/** A lake among mountains at sunset; `k` from 0 to 1 moves the sun down and warms the sky. */
function landscape(ctx: SKRSContext2D, w: number, h: number, k: number) {
	const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
	sky.addColorStop(0, `hsl(${222 - k * 30}, 62%, ${24 + k * 8}%)`);
	sky.addColorStop(0.55, `hsl(${280 - k * 40}, 48%, ${48 + k * 6}%)`);
	sky.addColorStop(1, `hsl(${24 + k * 8}, 92%, ${66 + k * 4}%)`);
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, w, h);
	const sx = w * (0.62 - k * 0.25);
	const sy = h * (0.5 - k * 0.12);
	const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.38);
	glow.addColorStop(0, 'rgba(255,230,180,.95)');
	glow.addColorStop(0.08, 'rgba(255,200,130,.75)');
	glow.addColorStop(1, 'rgba(255,150,90,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#fff4dc';
	ctx.beginPath();
	ctx.arc(sx, sy, w * 0.035, 0, Math.PI * 2);
	ctx.fill();
	const ridge = (base: number, amp: number, seed: number, top: string, bottom: string) => {
		ctx.beginPath();
		ctx.moveTo(0, h);
		for (let x = 0; x <= w; x += w / 180) {
			const y =
				base +
				Math.sin((x / w) * 7 + seed) * amp * 0.5 +
				Math.sin((x / w) * 17 + seed * 2) * amp * 0.22 +
				Math.sin((x / w) * 41 + seed) * amp * 0.08;
			ctx.lineTo(x, h * y);
		}
		ctx.lineTo(w, h);
		ctx.closePath();
		const g = ctx.createLinearGradient(0, h * (base - amp), 0, h);
		g.addColorStop(0, top);
		g.addColorStop(1, bottom);
		ctx.fillStyle = g;
		ctx.fill();
	};
	ridge(0.5, 0.12, 1.3, 'hsl(268, 30%, 52%)', 'hsl(250, 30%, 30%)');
	ridge(0.58, 0.1, 4.1, 'hsl(252, 32%, 36%)', 'hsl(240, 34%, 20%)');
	ridge(0.66, 0.08, 2.2, 'hsl(232, 36%, 22%)', 'hsl(228, 40%, 12%)');
	const lake = ctx.createLinearGradient(0, h * 0.74, 0, h);
	lake.addColorStop(0, 'hsl(28, 70%, 58%)');
	lake.addColorStop(0.35, 'hsl(262, 30%, 32%)');
	lake.addColorStop(1, 'hsl(230, 40%, 10%)');
	ctx.fillStyle = lake;
	ctx.fillRect(0, h * 0.76, w, h * 0.24);
	ctx.fillStyle = 'rgba(255,225,180,.55)';
	for (let i = 0; i < 26; i++) {
		const y = h * (0.78 + i * 0.008);
		ctx.fillRect(sx - w * (0.05 - i * 0.0012) + Math.sin(i * 3.1 + k * 20) * w * 0.004, y, w * (0.1 - i * 0.0025), h * (0.0012 + i * 0.00006));
	}
	ctx.fillStyle = 'hsl(230, 40%, 7%)';
	for (let i = 0; i < 9; i++) {
		const x = w * (0.03 + i * 0.045);
		const th = h * (0.16 + (i % 3) * 0.05);
		ctx.beginPath();
		ctx.moveTo(x, h * 0.8 - th);
		ctx.lineTo(x - th * 0.28, h * 0.8);
		ctx.lineTo(x + th * 0.28, h * 0.8);
		ctx.fill();
	}
}

const run = async (args: string[]) => {
	const proc = Bun.spawn([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', ...args], { stderr: 'inherit' });
	if ((await proc.exited) !== 0) throw new Error(`ffmpeg ${args.join(' ')}`);
};

// Photo.
{
	const canvas = createCanvas(2400, 1600);
	landscape(canvas.getContext('2d'), 2400, 1600, 0.15);
	writeFileSync(join(out, 'lake.jpg'), canvas.toBuffer('image/jpeg', 90));
}

// Music: A minor, F, C, G, arpeggios over a soft pad, 20 s at 48 kHz.
const RATE = 48000;
const LENGTH = 20;
{
	const chords = [
		[57, 60, 64],
		[53, 57, 60],
		[48, 52, 55],
		[55, 59, 62],
	];
	const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);
	const left = new Float32Array(RATE * LENGTH);
	const right = new Float32Array(RATE * LENGTH);
	const bar = 2.5;
	for (let i = 0; i < left.length; i++) {
		const t = i / RATE;
		const chord = chords[Math.floor(t / bar) % 4]!;
		// Pad: the chord, a slow swell per bar.
		const swell = Math.sin(Math.PI * ((t % bar) / bar)) ** 0.5;
		let pad = 0;
		for (const note of chord) pad += Math.sin(2 * Math.PI * freq(note - 12) * t) + 0.3 * Math.sin(4 * Math.PI * freq(note - 12) * t);
		// Arpeggio: eighth notes up the chord, each decaying.
		const step = Math.floor(t / (bar / 8));
		const since = t - step * (bar / 8);
		const note = chord[step % 3]! + (step % 8 >= 4 ? 12 : 0);
		const pluck = Math.exp(-since * 6) * (Math.sin(2 * Math.PI * freq(note) * t) + 0.25 * Math.sin(6 * Math.PI * freq(note) * t));
		const fade = Math.min(1, t / 1.5, (LENGTH - t) / 2);
		left[i] = (pad * 0.05 * swell + pluck * 0.22) * fade;
		right[i] = (pad * 0.05 * swell + pluck * 0.16 * (0.6 + 0.4 * Math.sin(t))) * fade;
	}
	const pcm = Buffer.alloc(left.length * 4);
	for (let i = 0; i < left.length; i++) {
		pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i]!)) * 32767), i * 4);
		pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i]!)) * 32767), i * 4 + 2);
	}
	writeFileSync(join(work, 'music.raw'), pcm);
	await run(['-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', join(work, 'music.raw'), '-c:a', 'libmp3lame', '-b:a', '128k', '-metadata', 'title=Lake at sunset', '-metadata', 'artist=Vixely', join(out, 'sunset.mp3')]);
}

// Video: 10 s, 1280 × 720, 30 fps, the sun going down, with the music and two subtitle tracks.
{
	const frames = join(work, 'frames');
	mkdirSync(frames);
	const canvas = createCanvas(1280, 720);
	const ctx = canvas.getContext('2d');
	for (let f = 0; f < 300; f++) {
		landscape(ctx, 1280, 720, f / 300);
		writeFileSync(join(frames, `${String(f).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
	}
	const srt = (lines: string[]) =>
		lines.map((text, i) => `${i + 1}\n00:00:0${i * 3 + 1},000 --> 00:00:0${i * 3 + 3},500\n${text}\n`).join('\n');
	writeFileSync(join(work, 'en.srt'), srt(['The sun goes down over the lake.', 'Everything was made in the browser.', 'Nothing left this device.']));
	writeFileSync(join(work, 'fr.srt'), srt(['Le soleil se couche sur le lac.', 'Tout a été fait dans le navigateur.', "Rien n'a quitté cet appareil."]));
	await run([
		'-framerate', '30', '-i', join(frames, '%04d.png'),
		'-t', '10', '-i', join(out, 'sunset.mp3'),
		'-i', join(work, 'en.srt'), '-i', join(work, 'fr.srt'),
		'-map', '0:v', '-map', '1:a', '-map', '2', '-map', '3',
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-g', '60',
		'-c:a', 'libopus', '-b:a', '96k', '-c:s', 'srt',
		'-metadata:s:a:0', 'title=Music',
		'-metadata:s:s:0', 'language=eng', '-metadata:s:s:1', 'language=fre', '-disposition:s:0', 'default',
		'-t', '10', join(out, 'sunset.mkv'),
	]);
	// GIF: 3 s, 360 px wide, 12 fps.
	await run([
		'-framerate', '30', '-i', join(frames, '%04d.png'), '-t', '3',
		'-vf', 'fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
		join(out, 'sunset.gif'),
	]);
}

rmSync(work, { recursive: true });
for (const name of ['lake.jpg', 'sunset.mkv', 'sunset.gif', 'sunset.mp3']) console.log(name, Bun.file(join(out, name)).size, 'bytes');
