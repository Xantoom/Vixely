/**
 * HDR video: the information panel names its kind (Dolby Vision with its profile, HDR10+, HDR10,
 * HLG), and copies, whole or trimmed, keep its metadata as it is: the Dolby Vision configuration,
 * the mastering display and light levels in the container, HDR10+ in every picture. Checked with
 * FFmpeg's probe when FFPROBE is set.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { engine, BASE } from './engine';

const ffprobe = process.env.FFPROBE;
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-US', acceptDownloads: true });
// Downloads rather than the file picker, which a headless browser can't show.
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('shots', { recursive: true });
const aside = page.locator('aside');
const tools = page.getByRole('navigation');

const open = async (name: string) => {
	await page.goto(`${BASE}/video`);
	await page.setInputFiles('input[type=file]', `samples/${name}`);
	await page.waitForSelector('[role=group][aria-label="Tracks"]', { timeout: 30000 });
	await page.waitForTimeout(1000);
};

/** What FFmpeg reads of the copy's HDR: container side data, and HDR10+ in its first pictures. */
const probe = (path: string) => {
	if (!ffprobe) return null;
	const run = (args: string[]) => spawnSync(ffprobe, ['-v', 'error', ...args, path], { encoding: 'utf8' }).stdout;
	const stream = run(['-select_streams', 'v', '-show_entries', 'stream_side_data=side_data_type,dv_profile,dv_bl_signal_compatibility_id,max_content,max_average', '-of', 'compact']);
	const frames = run(['-select_streams', 'v', '-read_intervals', '%+#3', '-show_frames', '-show_entries', 'frame_side_data=side_data_type', '-of', 'compact']);
	return {
		duration: Number(run(['-show_entries', 'format=duration', '-of', 'csv=p=0']).trim()),
		dolbyVision: stream.includes('dv_profile=')
			? `${/dv_profile=(\d+)/.exec(stream)?.[1]}.${/dv_bl_signal_compatibility_id=(\d+)/.exec(stream)?.[1]}`
			: null,
		mastering: stream.includes('Mastering display metadata'),
		light: stream.includes('max_content=')
			? `${/max_content=(\d+)/.exec(stream)?.[1]}/${/max_average=(\d+)/.exec(stream)?.[1]}`
			: null,
		hdr10Plus: frames.includes('SMPTE2094-40'),
	};
};

const cases = [
	{ name: 'dv81.mkv', chips: ['Dolby Vision 8.1', 'HDR10'], dolbyVision: '8.1', hdr10Plus: false },
	{ name: 'dv81.mp4', chips: ['Dolby Vision 8.1', 'HDR10'], dolbyVision: '8.1', hdr10Plus: false },
	{ name: 'hdr10plus.mkv', chips: ['HDR10+'], dolbyVision: null, hdr10Plus: true },
	{ name: 'hlg.mp4', chips: ['HLG'], dolbyVision: null, hdr10Plus: false },
];

for (const { name, chips, dolbyVision, hdr10Plus } of cases) {
	await open(name);
	const range = aside.locator('dt', { hasText: 'Dynamic range' }).locator('+ dd');
	await range.waitFor({ timeout: 15000 });
	const shown = (await range.innerText()).split(',').map((text) => text.trim());
	console.log(`${name}: ${shown.join(', ')}`);
	if (shown.join('|') !== chips.join('|')) errors.push(`${name} shows ${shown.join(', ')}, not ${chips.join(', ')}`);
	await aside.first().screenshot({ path: `shots/hdr-info-${name}.png` });

	for (const trimmed of [false, true]) {
		if (trimmed) {
			// A copy starts on the key frame at or before: one a second, the first of dv81.mkv at 0.023 s.
			await tools.getByRole('button', { name: 'Edit', exact: true }).click();
			await aside.getByLabel('Start', { exact: true }).fill('0:01.100');
			await aside.getByLabel('Start', { exact: true }).press('Enter');
		}
		await tools.getByRole('button', { name: 'Export', exact: true }).click();
		const original = aside.getByRole('radio', { name: /Original/ });
		if (await original.isEnabled()) await original.click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 60000 }),
			page.getByRole('button', { name: /^Export (MKV|MP4)$/ }).click(),
		]);
		const path = `shots/hdr-${trimmed ? 'trimmed' : 'copy'}-${name}`;
		writeFileSync(path, readFileSync((await download.path())!));
		const found = probe(path);
		if (!found) continue;
		console.log(`  ${trimmed ? 'trimmed' : 'copy'}: ${JSON.stringify(found)}`);
		const label = `${name} ${trimmed ? 'trimmed' : 'copied'}`;
		if (found.dolbyVision !== dolbyVision) errors.push(`${label}: Dolby Vision ${found.dolbyVision}`);
		if (name !== 'hlg.mp4' && !name.startsWith('hdr10plus') && (!found.mastering || found.light !== '1000/400'))
			errors.push(`${label}: mastering ${found.mastering}, light ${found.light}`);
		if (found.hdr10Plus !== hdr10Plus) errors.push(`${label}: HDR10+ ${found.hdr10Plus}`);
		// MP4 hides the pictures before the start with an edit list; Matroska keeps them from the key frame.
		const kept = name.endsWith('.mp4') ? 2.9 : 3;
		if (trimmed && Math.abs(found.duration - kept) > 0.05) errors.push(`${label}: lasts ${found.duration} s`);
	}
}

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
