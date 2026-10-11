/**
 * Fonts of subtitles: a style naming a font that isn't here says so, a font file added draws it,
 * Impact is drawn with Anton, a Vixely font picked from the list draws its style. The ASS written
 * carries the added and Vixely fonts in its [Fonts] section, and an MKV gets them as attachments;
 * with FFPROBE set, FFmpeg's libass reads them back.
 */
import { engine, sample, BASE } from './engine';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ADDED = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const ffprobe = process.env.FFPROBE;
const ffmpeg = ffprobe?.replace(/ffprobe$/, 'ffmpeg');
const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', acceptDownloads: true });
await ctx.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
const tools = page.locator('nav[aria-label="Editing tools"]');
const aside = page.locator('aside');
mkdirSync('shots', { recursive: true });
const notice = aside.locator('p[role=status]');
const note = async () => ((await notice.count()) ? await notice.innerText() : '(none)');
const pickFont = async (current: string, name: string) => {
	await aside.getByRole('button', { name: current, exact: true }).click();
	await page.getByRole('searchbox').fill(name);
	await page.getByRole('option', { name, exact: true }).click();
	await page.waitForTimeout(800);
};
const download = async (button: () => Promise<void>) => {
	const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button()]);
	return readFileSync(await file.path());
};

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Trebuchet MS,64,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,20,20,40,1
Style: Sign,Impact,64,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,8,20,20,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Quietly, gently: wavy kg & gift
Dialogue: 0,0:00:00.00,0:00:05.00,Sign,,0,0,0,,A SIGN ON TOP
`;

// 1. Styles naming fonts that aren't here.
await page.goto(`${BASE}/subtitles`);
await page.setInputFiles('input[type=file]', { name: 'fonts.ass', mimeType: 'text/plain', buffer: Buffer.from(ass) });
await page.getByRole('grid').waitFor({ timeout: 20000 });
await tools.getByRole('button', { name: 'Styles' }).click();
console.log('Trebuchet MS:', await note());
await aside.getByRole('radio', { name: /Sign/ }).click();
console.log('Impact:', await note());
await aside.getByRole('button', { name: 'Impact', exact: true }).click();
console.log('groups:', (await page.getByRole('listbox').innerText()).split('\n').filter((line) => /fonts|computer|Not found|Added|video/i.test(line)).join(' | '));
await page.keyboard.press('Escape');

// 2. A font file added becomes the style's; a Vixely font picked for the other.
await aside.getByRole('radio', { name: /Default/ }).click();
let family = 'Trebuchet MS';
if (existsSync(ADDED)) {
	await aside.locator('input[type=file][accept*=".ttf"]').setInputFiles(ADDED);
	await page.waitForTimeout(1000);
	family = await aside.getByRole('button', { name: /DejaVu/ }).innerText();
	console.log('added:', family, '| note:', await note());
} else console.log('added: no font file to add here');
await aside.getByRole('radio', { name: /Sign/ }).click();
await pickFont('Impact', 'Pacifico');
console.log('Pacifico:', await note());

// 3. The ASS written carries the fonts.
await page.getByRole('navigation').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /^ASS/ }).click();
const written = await download(() => page.locator('aside + div').getByRole('button').first().click());
writeFileSync('shots/subtitles-fonts.ass', written);
const text = written.toString('utf8');
console.log('ass fonts:', [...text.matchAll(/^fontname: (.+)$/gm)].map((match) => match[1]).join(', '));
console.log('ass styles:', text.split('\n').filter((line) => line.startsWith('Style:')).map((line) => line.split(',').slice(0, 2).join(',')).join(' | '));
if (ffmpeg) {
	const run = spawnSync(ffmpeg, ['-v', 'verbose', '-f', 'lavfi', '-i', 'color=s=640x360:d=1', '-vf', 'subtitles=shots/subtitles-fonts.ass', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
	console.log('libass:', run.stderr.split('\n').filter((line) => /font/i.test(line) && /pacifico|dejavu|fontselect/i.test(line)).map((line) => line.replace(/^\[[^\]]+\]\s*/, '').trim()).slice(0, 6).join(' | '));
}

// 4. An MKV gets them as attachments.
await page.goto(`${BASE}/subtitles`);
await page.setInputFiles('input[type=file]', sample('film.mkv'));
await page.getByRole('grid').waitFor({ timeout: 60000 });
await tools.getByRole('button', { name: 'Styles' }).click();
await aside.getByRole('button', { name: 'Add styles' }).click();
await pickFont('Arial', 'Anton');
await page.getByRole('navigation').getByRole('button', { name: 'Export', exact: true }).click();
await aside.getByRole('radio', { name: /The video/ }).click();
await page.waitForTimeout(500);
const mkv = await download(() => page.locator('aside + div').getByRole('button').first().click());
writeFileSync('shots/subtitles-fonts.mkv', mkv);
console.log('mkv:', mkv.length, 'bytes');
if (ffprobe) {
	const probe = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:stream_tags=filename,mimetype', '-of', 'compact=p=0', 'shots/subtitles-fonts.mkv'], { encoding: 'utf8' });
	console.log('mkv streams:', probe.stdout.trim().split('\n').join(' | '));
}

console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
