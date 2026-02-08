import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// ── Types ──

interface TranscodeMessage {
	type: 'TRANSCODE';
	file: File;
	args: string[];
	outputName: string;
}

interface GifMessage {
	type: 'GIF';
	file: File;
	fps: number;
	width: number;
	height?: number;
	startTime?: number;
	duration?: number;
	speed?: number;
	reverse?: boolean;
	maxColors?: number;
}

interface ScreenshotMessage {
	type: 'SCREENSHOT';
	file: File;
	timestamp: number;
}

type WorkerMessage = TranscodeMessage | GifMessage | ScreenshotMessage;

interface ProgressPayload {
	type: 'PROGRESS';
	progress: number;
	time: number;
}

interface DonePayload {
	type: 'DONE';
	data: Uint8Array;
	outputName: string;
}

interface ErrorPayload {
	type: 'ERROR';
	error: string;
}

interface ReadyPayload {
	type: 'READY';
}

interface LogPayload {
	type: 'LOG';
	message: string;
}

type WorkerResponse = ProgressPayload | DonePayload | ErrorPayload | ReadyPayload | LogPayload;

// ── FFmpeg Instance ──

const ffmpeg = new FFmpeg();
let loaded = false;

const CORE_VERSION = '0.12.10';
const CORE_MT_BASE = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;

async function ensureLoaded(): Promise<void> {
	if (loaded) return;

	ffmpeg.on('progress', ({ progress, time }) => {
		post({ type: 'PROGRESS', progress, time });
	});

	ffmpeg.on('log', ({ message }) => {
		post({ type: 'LOG', message });
	});

	await ffmpeg.load({
		coreURL: await toBlobURL(`${CORE_MT_BASE}/ffmpeg-core.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${CORE_MT_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
		workerURL: await toBlobURL(`${CORE_MT_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
	});

	loaded = true;
	post({ type: 'READY' });
}

// ── Helpers ──

function post(payload: WorkerResponse): void {
	self.postMessage(payload);
}

async function mountFile(file: File, mountPoint: string): Promise<string> {
	await ffmpeg.createDir(mountPoint);
	await ffmpeg.mount('WORKERFS' as any, { files: [file] }, mountPoint);
	return `${mountPoint}/${file.name}`;
}

async function unmountFile(mountPoint: string): Promise<void> {
	try {
		await ffmpeg.unmount(mountPoint);
	} catch {
		// mount point may already be cleaned up
	}
}

async function readAndCleanup(outputName: string): Promise<Uint8Array> {
	const data = await ffmpeg.readFile(outputName);
	await ffmpeg.deleteFile(outputName);

	if (data instanceof Uint8Array) return data;
	return new TextEncoder().encode(data as string);
}

// ── Command Handlers ──

async function handleTranscode(msg: TranscodeMessage): Promise<void> {
	const mountPoint = '/input';
	const inputPath = await mountFile(msg.file, mountPoint);

	try {
		const exitCode = await ffmpeg.exec(['-i', inputPath, ...msg.args, msg.outputName]);

		if (exitCode !== 0) {
			throw new Error(`FFmpeg exited with code ${exitCode}`);
		}

		const result = await readAndCleanup(msg.outputName);
		post({ type: 'DONE', data: result, outputName: msg.outputName });
	} finally {
		await unmountFile(mountPoint);
	}
}

async function handleGif(msg: GifMessage): Promise<void> {
	const mountPoint = '/input';
	const inputPath = await mountFile(msg.file, mountPoint);

	const speed = msg.speed ?? 1;
	const maxColors = msg.maxColors ?? 256;
	const scaleExpr =
		msg.height != null ? `scale=${msg.width}:${msg.height}:flags=lanczos` : `scale=${msg.width}:-1:flags=lanczos`;

	// Build the video filter chain
	const vfParts: string[] = [`fps=${msg.fps}`, scaleExpr];
	if (speed !== 1) vfParts.push(`setpts=PTS/${speed}`);
	if (msg.reverse) vfParts.push('reverse');
	const vfChain = vfParts.join(',');

	try {
		// Step 1: Generate optimized palette
		const paletteArgs = [
			'-i',
			inputPath,
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			...(msg.duration != null ? ['-t', String(msg.duration)] : []),
			'-vf',
			`${vfChain},palettegen=max_colors=${maxColors}:stats_mode=diff`,
			'palette.png',
		];

		let exitCode = await ffmpeg.exec(paletteArgs);
		if (exitCode !== 0) throw new Error(`Palette generation failed (code ${exitCode})`);

		// Step 2: Apply palette to produce GIF
		const gifArgs = [
			'-i',
			inputPath,
			'-i',
			'palette.png',
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			...(msg.duration != null ? ['-t', String(msg.duration)] : []),
			'-lavfi',
			`${vfChain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
			'output.gif',
		];

		exitCode = await ffmpeg.exec(gifArgs);
		if (exitCode !== 0) throw new Error(`GIF generation failed (code ${exitCode})`);

		// Cleanup palette
		await ffmpeg.deleteFile('palette.png');

		const result = await readAndCleanup('output.gif');
		post({ type: 'DONE', data: result, outputName: 'output.gif' });
	} finally {
		await unmountFile(mountPoint);
	}
}

async function handleScreenshot(msg: ScreenshotMessage): Promise<void> {
	const mountPoint = '/input';
	const inputPath = await mountFile(msg.file, mountPoint);

	try {
		const exitCode = await ffmpeg.exec([
			'-ss',
			String(msg.timestamp),
			'-i',
			inputPath,
			'-frames:v',
			'1',
			'-q:v',
			'2',
			'screenshot.png',
		]);

		if (exitCode !== 0) {
			throw new Error(`Screenshot failed (code ${exitCode})`);
		}

		const result = await readAndCleanup('screenshot.png');
		post({ type: 'DONE', data: result, outputName: 'screenshot.png' });
	} finally {
		await unmountFile(mountPoint);
	}
}

// ── Message Router ──

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	try {
		await ensureLoaded();

		switch (e.data.type) {
			case 'TRANSCODE':
				await handleTranscode(e.data);
				break;
			case 'GIF':
				await handleGif(e.data);
				break;
			case 'SCREENSHOT':
				await handleScreenshot(e.data);
				break;
			default:
				post({ type: 'ERROR', error: `Unknown message type: ${(e.data as any).type}` });
		}
	} catch (err) {
		post({ type: 'ERROR', error: err instanceof Error ? err.message : String(err) });
	}
};
