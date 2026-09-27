/**
 * The complete video editor: a turned video copied without encoding, metadata and a cover, timed
 * text encoded at constant quality, the TikTok format, Dolby Digital and DTS sound decoded, a
 * subtitle file added as a track, and a variable frame rate read. With FFPROBE set, each file is
 * checked by FFmpeg's probe.
 */
import { engine, sample, BASE } from './engine';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ffprobe = process.env.FFPROBE;
const ffmpeg = ffprobe?.replace(/ffprobe$/, 'ffmpeg');
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('shots', { recursive: true });
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
const tool = async (name: string) => {
	const button = tools.getByRole('button', { name, exact: true });
	if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
};

const open = async (path: string) => {
	await page.goto(`${BASE}/video`);
	await page.setInputFiles('input[type=file]', path);
	await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
	await page.waitForTimeout(1500);
};
const exportAs = async (name: string, mode: RegExp, choose: () => Promise<void> = async () => {}) => {
	await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
	const radio = aside.getByRole('radio', { name: mode });
	if (await radio.isEnabled()) await radio.click();
	console.log(`${name}: ${mode} ${(await radio.getAttribute('aria-checked')) === 'true' ? 'chosen' : 'NOT chosen'}`);
	await choose();
	await page.waitForTimeout(300);
	await aside.screenshot({ path: `shots/${name}-panel.png` });
	const t0 = Date.now();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 300000 }),
		page.locator('aside + div').getByRole('button').first().click(),
	]);
	const data = readFileSync(await download.path());
	writeFileSync(`shots/${name}`, data);
	console.log(`  ${download.suggestedFilename()}: ${data.length} bytes in ${Date.now() - t0} ms`);
	return `shots/${name}`;
};
const run = (args: string[], path: string) =>
	ffprobe ? spawnSync(ffprobe, ['-v', 'error', ...args, path], { encoding: 'utf8' }).stdout.trim() : '';
const streams = (path: string) =>
	console.log(
		' ',
		run(
			['-show_entries', 'stream=index,codec_type,codec_name,width,height,channels:stream_side_data=rotation:stream_disposition=attached_pic', '-of', 'compact'],
			path,
		).replace(/\n/g, '\n  '),
	);
const frame = (path: string, time: number, name: string) => {
	if (!ffmpeg) return;
	spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'scale=480:-2', `shots/${name}.png`]);
};

// 1. Turned a quarter and mirrored: copied as it is, the file says how to show it.
await open(sample('clip.mp4'));
await tool('Crop');
await aside.getByRole('button', { name: 'Rotate right' }).click();
const turned = await exportAs('turned.mp4', /Original/);
streams(turned);
console.log('  first packets (source, copy):', run(['-select_streams', 'v', '-show_entries', 'packet=size', '-read_intervals', '%+#3', '-of', 'csv=p=0'], sample('clip.mp4')).replace(/\n/g, ' '), '|', run(['-select_streams', 'v', '-show_entries', 'packet=size', '-read_intervals', '%+#3', '-of', 'csv=p=0'], turned).replace(/\n/g, ' '));

// 2. Metadata and a cover made from the picture shown, still copied.
await open(sample('clip.mkv'));
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Title').fill('Vixely test');
await aside.getByLabel('Artist').fill('Xantoom');
await aside.getByLabel('Artist').press('Tab');
await aside.getByRole('button', { name: 'Current frame' }).click();
await aside.getByRole('img', { name: 'Cover' }).waitFor();
const tagged = await exportAs('tagged.mkv', /Original/);
streams(tagged);
console.log('  tags:', run(['-show_entries', 'format_tags', '-of', 'compact'], tagged));
console.log('  attachments:', run(['-show_entries', 'stream_tags=filename,mimetype', '-select_streams', 't', '-of', 'compact'], tagged).replace(/\n/g, ' '));

// 2b. The same in an MP4, whose timed text goes through the remuxer too.
await open(sample('clip.mp4'));
await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByLabel('Title').fill('Vixely MP4');
await aside.getByLabel('Title').press('Tab');
await aside.getByRole('button', { name: 'Current frame' }).click();
await aside.getByRole('img', { name: 'Cover' }).waitFor();
const taggedMp4 = await exportAs('tagged.mp4', /Original/);
streams(taggedMp4);
console.log('  tags:', run(['-show_entries', 'format_tags', '-of', 'compact'], taggedMp4));

// 3. A title for the first two seconds only, encoded at constant quality.
await open(sample('clip.mp4'));
await tool('Layers');
await aside.getByRole('button', { name: /^Title/ }).click();
await aside.getByRole('switch', { name: 'During the whole video' }).click();
await aside.getByLabel('To', { exact: true }).fill('2');
await aside.getByLabel('To', { exact: true }).press('Enter');
await page.waitForTimeout(300);
await aside.screenshot({ path: 'shots/text-timing.png' });
await page.locator('section[aria-label="Preview"]').screenshot({ path: 'shots/text-preview.png' });
const titled = await exportAs('titled.mp4', /Convert/, async () => {
	await aside.getByLabel('Rate control').click();
	await page.getByRole('option', { name: 'Constant quality' }).click();
});
streams(titled);
frame(titled, 1, 'titled-1s');
frame(titled, 4, 'titled-4s');

// 4. TikTok: cropped to 9:16 from the middle.
await open(sample('clip.mp4'));
await tool('Formats');
await aside.getByRole('button', { name: /^TikTok/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/tiktok-editor.png' });
const tiktok = await exportAs('tiktok.mp4', /Convert/);
streams(tiktok);

// 5. Dolby Digital 5.1 and DTS: decoded here, converted to AAC.
for (const name of ['ac3', 'dts']) {
	await open(sample(`${name}.mkv`));
	const decoding = await aside.locator('dl').last().textContent();
	console.log(`${name}.mkv audio:`, decoding?.replace(/\s+/g, ' '));
	await page.locator('[role=group][aria-label="Tracks"]').screenshot({ path: `shots/${name}-timeline.png` });
	const converted = await exportAs(`${name}.mp4`, /Convert/, async () => {
		await aside.getByLabel('Container').click();
		await page.getByRole('option', { name: 'MP4' }).click();
		await aside.getByLabel('Codec').nth(1).click();
		await page.getByRole('option', { name: 'AAC', exact: true }).click();
	});
	streams(converted);
}

// 5b. Converted with a passage removed, the sound copied as it is part by part: its packets are
// the source's, byte for byte.
{
	await open(sample('clip.mp4'));
	await tool('Trim');
	const lanes = (await page.getByRole('group', { name: 'Tracks' }).boundingBox())!;
	await page.mouse.move(lanes.x + lanes.width * 0.3, lanes.y + 20);
	await page.mouse.down();
	await page.mouse.move(lanes.x + lanes.width * 0.5, lanes.y + 20, { steps: 6 });
	await page.mouse.up();
	await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /Delete/ }).click();
	const path = await exportAs('cut-copied.mp4', /Convert/, async () => {
		await aside.getByLabel('Codec').nth(1).click();
		await page.getByRole('option', { name: /^Original/ }).click();
	});
	const { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } = await import('mediabunny');
	const read = (file: string) => new Input({ source: new BufferSource(readFileSync(file)), formats: ALL_FORMATS });
	const out = read(path);
	const src = read(sample('clip.mp4'));
	const outAudio = await out.getPrimaryAudioTrack();
	const srcAudio = await src.getPrimaryAudioTrack();
	const video = await out.getPrimaryVideoTrack();
	console.log(`  video ${await video?.getCodec()} ${(await video?.computeDuration())?.toFixed(2)} s, audio ${await outAudio?.getCodec()} ${(await outAudio?.computeDuration())?.toFixed(2)} s`);
	if (outAudio && srcAudio) {
		const sources = new Set<string>();
		for await (const packet of new EncodedPacketSink(srcAudio).packets()) sources.add(Buffer.from(packet.data).toString('base64'));
		let same = 0;
		let total = 0;
		for await (const packet of new EncodedPacketSink(outAudio).packets()) {
			total += 1;
			if (sources.has(Buffer.from(packet.data).toString('base64'))) same += 1;
		}
		console.log(`  audio packets copied: ${same} of ${total}${same === total ? '' : ' RE-ENCODED'}`);
	}
}

// 5c. Twice as fast with a second of fade at each end: half as long, black and silent at the
// start, the tone at the same pitch.
{
	await open(sample('clip.mp4'));
	await tool('Speed');
	await aside.getByRole('radio', { name: /^2/ }).click();
	// Playback keeps the pace: two seconds of source for every second.
	const playhead = page.getByRole('slider', { name: 'Playhead' }).first();
	await page.getByRole('button', { name: 'Play' }).first().click();
	await page.waitForTimeout(200);
	const from = Number(await playhead.getAttribute('aria-valuenow'));
	await page.waitForTimeout(2000);
	const to = Number(await playhead.getAttribute('aria-valuenow'));
	await page.getByRole('button', { name: 'Pause' }).first().click();
	console.log(`  preview pace: ${((to - from) / 2).toFixed(2)}× (asked 2×)`);
	await tool('Trim');
	await aside.getByRole('slider', { name: 'Fade in' }).fill('10');
	await aside.getByRole('slider', { name: 'Fade out' }).fill('10');
	console.log('speed panel length:', await aside.getByText('Final length').locator('..').innerText().then((t) => t.replace(/\s+/g, ' ')));
	const path = await exportAs('fast.mp4', /Convert/);
	console.log('  duration:', run(['-show_entries', 'format=duration', '-of', 'csv=p=0'], path), 's');
	if (ffmpeg) {
		const luma = (time: number) =>
			/YAVG=([\d.]+)/.exec(
				spawnSync(ffmpeg, ['-v', 'info', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' }).stderr,
			)?.[1];
		console.log('  brightness at 0 s, 0.5 s, 5 s:', luma(0), luma(0.5), luma(5));
		const pcm = spawnSync(ffmpeg, ['-v', 'error', '-ss', '4', '-t', '4', '-i', path, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 }).stdout;
		const wave = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
		let crossings = 0;
		for (let n = 1; n < wave.length; n++) if ((wave[n - 1] ?? 0) < 0 && (wave[n] ?? 0) >= 0) crossings += 1;
		console.log('  pitch:', Math.round((crossings * 48000) / wave.length), 'Hz (source 330)');
	}
}

// 6. A subtitle file added to the video as a track, copied into it.
await open(sample('clip.mkv'));
await tool('Subtitles');
await aside.locator('input[type=file]').setInputFiles('samples/extra.fr.srt');
await page.waitForTimeout(500);
await aside.screenshot({ path: 'shots/subtitles-added.png' });
const added = await exportAs('added.mkv', /Original/);
streams(added);
if (ffmpeg) {
	const srt = spawnSync(ffmpeg, ['-v', 'error', '-i', added, '-map', '0:s:2', '-f', 'srt', '-'], { encoding: 'utf8' }).stdout;
	console.log('  added track:', srt.replace(/\n+/g, ' ').trim());
}

// 7. A variable frame rate.
await open(sample('vfr.mp4'));
console.log('vfr.mp4:', (await aside.locator('dl').nth(1).textContent())?.replace(/\s+/g, ' '));

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
