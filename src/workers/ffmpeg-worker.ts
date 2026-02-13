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

interface ProbeMessage {
	type: 'PROBE';
	file: File;
}

type WorkerMessage = TranscodeMessage | GifMessage | ScreenshotMessage | ProbeMessage;

interface ProgressPayload {
	type: 'PROGRESS';
	progress: number;
	time: number;
	fps: number;
	frame: number;
	speed: number;
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

interface ProbeResultPayload {
	type: 'PROBE_RESULT';
	result: ProbeResultData;
}

export interface ProbeStreamInfo {
	index: number;
	type: 'video' | 'audio' | 'subtitle';
	codec: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	bitrate?: number;
}

export interface ProbeResultData {
	duration: number;
	bitrate: number;
	format: string;
	streams: ProbeStreamInfo[];
}

type WorkerResponse = ProgressPayload | DonePayload | ErrorPayload | ReadyPayload | LogPayload | ProbeResultPayload;

// ── FFmpeg Instance ──

let ffmpeg = new FFmpeg();
let loaded = false;
let multiThreadActive = false;
let logBuffer: string[] = [];
let collectLogs = false;
let encodingStats = { fps: 0, frame: 0, speed: 0 };

const supportsMultiThread = typeof SharedArrayBuffer !== 'undefined';

function attachListeners(instance: FFmpeg): void {
	instance.on('progress', ({ progress, time }) => {
		post({ type: 'PROGRESS', progress, time, ...encodingStats });
	});

	instance.on('log', ({ message }) => {
		if (collectLogs) logBuffer.push(message);

		const fpsMatch = message.match(/fps=\s*([\d.]+)/);
		const frameMatch = message.match(/frame=\s*(\d+)/);
		const speedMatch = message.match(/speed=\s*([\d.]+)x/);
		if (fpsMatch) encodingStats.fps = Number(fpsMatch[1]);
		if (frameMatch) encodingStats.frame = Number(frameMatch[1]);
		if (speedMatch) encodingStats.speed = Number(speedMatch[1]);

		post({ type: 'LOG', message });
	});
}

async function ensureLoaded(): Promise<void> {
	if (loaded) return;

	const baseUrl = self.location.origin;

	if (supportsMultiThread) {
		try {
			attachListeners(ffmpeg);
			await ffmpeg.load({
				coreURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.js`, 'text/javascript'),
				wasmURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.wasm`, 'application/wasm'),
				workerURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.worker.js`, 'text/javascript'),
			});
			loaded = true;
			multiThreadActive = true;
			post({ type: 'LOG', message: `[ffmpeg] Multi-threaded core loaded (${navigator.hardwareConcurrency || 4} threads)` });
			post({ type: 'READY' });
			return;
		} catch (err) {
			post({ type: 'LOG', message: `[ffmpeg] MT core failed, falling back to ST: ${err}` });
			ffmpeg = new FFmpeg();
		}
	}

	attachListeners(ffmpeg);
	await ffmpeg.load({
		coreURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core-st.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core-st.wasm`, 'application/wasm'),
	});

	loaded = true;
	post({ type: 'LOG', message: '[ffmpeg] Single-threaded core loaded' });
	post({ type: 'READY' });
}

// ── Helpers ──

function post(payload: WorkerResponse): void {
	self.postMessage(payload);
}

async function mountFile(file: File, mountPoint: string): Promise<string> {
	try {
		await ffmpeg.createDir(mountPoint);
	} catch {
		// directory may already exist from a previous operation
	}
	await ffmpeg.mount('WORKERFS' as any, { files: [file] }, mountPoint);
	return `${mountPoint}/${file.name}`;
}

async function unmountFile(mountPoint: string): Promise<void> {
	try {
		await ffmpeg.unmount(mountPoint);
	} catch {
		// may already be unmounted
	}
}

async function readAndCleanup(outputName: string): Promise<Uint8Array> {
	const data = await ffmpeg.readFile(outputName);
	await ffmpeg.deleteFile(outputName);

	if (data instanceof Uint8Array) return data;
	return new TextEncoder().encode(data as string);
}

async function tryDeleteFile(name: string): Promise<void> {
	try {
		await ffmpeg.deleteFile(name);
	} catch {
		// ignore
	}
}

// ── Probe Parser ──

function parseProbeOutput(logs: string[]): ProbeResultData {
	const result: ProbeResultData = { duration: 0, bitrate: 0, format: '', streams: [] };
	const fullLog = logs.join('\n');

	const durationMatch = fullLog.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
	if (durationMatch) {
		result.duration =
			Number(durationMatch[1]) * 3600 +
			Number(durationMatch[2]) * 60 +
			Number(durationMatch[3]) +
			Number(durationMatch[4]) / 100;
	}

	const bitrateMatch = fullLog.match(/bitrate:\s*(\d+)\s*kb\/s/);
	if (bitrateMatch) result.bitrate = Number(bitrateMatch[1]);

	const formatMatch = fullLog.match(/Input #0,\s*(\w+)/);
	if (formatMatch) result.format = formatMatch[1] ?? result.format;

	const streamRegex =
		/Stream #0:(\d+)(?:\((\w+)\))?:\s*(Video|Audio|Subtitle):\s*(\S+)(?:.*?(\d{2,5})x(\d{2,5}))?(?:.*?(\d+(?:\.\d+)?)\s*fps)?(?:.*?(\d+)\s*Hz)?(?:.*?(mono|stereo|\d+\.\d+|\d+ channels))?(?:.*?(\d+)\s*kb\/s)?/g;

	let match;
	while ((match = streamRegex.exec(fullLog)) !== null) {
		// some capture groups may be undefined — skip entries that don't include a type
		if (!match[3]) continue;
		const streamType = match[3].toLowerCase() as 'video' | 'audio' | 'subtitle';
		const stream: ProbeStreamInfo = {
			index: Number(match[1]),
			type: streamType,
			// codec must be a string on ProbeStreamInfo — provide a safe fallback
			codec: match[4] ?? 'unknown',
			language: match[2],
		};

		if (streamType === 'video') {
			if (match[5] && match[6]) {
				stream.width = Number(match[5]);
				stream.height = Number(match[6]);
			}
			if (match[7]) stream.fps = Number(Number(match[7]).toFixed(2));
		}

		if (streamType === 'audio') {
			if (match[8]) stream.sampleRate = Number(match[8]);
			if (match[9]) {
				const ch = match[9];
				if (ch === 'mono') stream.channels = 1;
				else if (ch === 'stereo') stream.channels = 2;
				else {
					const parsed = Number.parseInt(ch, 10);
					if (!Number.isNaN(parsed)) stream.channels = parsed;
				}
			}
		}

		if (match[10]) stream.bitrate = Number(match[10]);

		result.streams.push(stream);
	}

	return result;
}

// ── Command Handlers ──

async function handleTranscode(msg: TranscodeMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	console.log('[worker] handleTranscode start, file:', msg.file.name, msg.file.size, 'bytes');
	console.log('[worker] args:', ['-y', '-i', '<input>', ...msg.args, msg.outputName].join(' '));

	const mountPoint = '/input';
	console.log('[worker] mountFile start');
	const inputPath = await mountFile(msg.file, mountPoint);
	console.log('[worker] mountFile done:', inputPath);

	try {
		// Extract -ss (seek) from args and place it BEFORE -i for fast native seeking.
		// Without this, FFmpeg decodes and discards all frames up to the seek point (very slow).
		const seekArgs: string[] = [];
		const outputArgs: string[] = [];
		let idx = 0;
		while (idx < msg.args.length) {
			if (msg.args[idx] === '-ss') {
				seekArgs.push('-ss', msg.args[idx + 1] ?? '0');
				idx += 2;
			} else {
				outputArgs.push(msg.args[idx]!);
				idx++;
			}
		}
		const threadArgs = multiThreadActive ? ['-threads', String(navigator.hardwareConcurrency || 4)] : [];
		const fullArgs = ['-y', ...seekArgs, '-i', inputPath, ...threadArgs, ...outputArgs, msg.outputName];
		console.log('[worker] ffmpeg.exec start:', fullArgs);
		const exitCode = await ffmpeg.exec(fullArgs);
		console.log('[worker] ffmpeg.exec done, exitCode:', exitCode);

		if (exitCode !== 0) {
			await tryDeleteFile(msg.outputName);
			throw new Error(`FFmpeg exited with code ${exitCode}`);
		}

		const result = await readAndCleanup(msg.outputName);
		console.log('[worker] readAndCleanup done, size:', result.byteLength);
		post({ type: 'DONE', data: result, outputName: msg.outputName });
	} finally {
		await unmountFile(mountPoint);
	}
}

async function handleGif(msg: GifMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	const mountPoint = '/input';
	const inputName = await mountFile(msg.file, mountPoint);

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
		const threadArgs = multiThreadActive ? ['-threads', String(navigator.hardwareConcurrency || 4)] : [];
		const paletteArgs = [
			'-y',
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			'-i',
			inputName,
			...threadArgs,
			...(msg.duration != null ? ['-t', String(msg.duration)] : []),
			'-vf',
			`${vfChain},palettegen=max_colors=${maxColors}:stats_mode=diff`,
			'palette.png',
		];

		let exitCode = await ffmpeg.exec(paletteArgs);
		if (exitCode !== 0) throw new Error(`Palette generation failed (code ${exitCode})`);

		// Step 2: Apply palette to produce GIF
		const gifArgs = [
			'-y',
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			'-i',
			inputName,
			'-i',
			'palette.png',
			...threadArgs,
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
			'-y',
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

async function handleProbe(msg: ProbeMessage): Promise<void> {
	const mountPoint = '/probe';
	const inputPath = await mountFile(msg.file, mountPoint);

	try {
		logBuffer = [];
		collectLogs = true;
		// ffmpeg -i exits code 1 (no output specified) — this is expected
		await ffmpeg.exec(['-i', inputPath]);
	} finally {
		collectLogs = false;
		await unmountFile(mountPoint);
	}

	const result = parseProbeOutput(logBuffer);
	logBuffer = [];
	post({ type: 'PROBE_RESULT', result });
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
			case 'PROBE':
				await handleProbe(e.data);
				break;
			default:
				post({ type: 'ERROR', error: `Unknown message type: ${(e.data as any).type}` });
		}
	} catch (err) {
		post({ type: 'ERROR', error: err instanceof Error ? err.message : String(err) });
	}
};
