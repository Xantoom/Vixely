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
	isDefault?: boolean;
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

async function loadSingleThread(baseUrl: string): Promise<void> {
	ffmpeg = new FFmpeg();
	attachListeners(ffmpeg);
	await ffmpeg.load({
		coreURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core-st.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core-st.wasm`, 'application/wasm'),
	});
	loaded = true;
	post({ type: 'LOG', message: '[ffmpeg] Single-threaded core loaded' });
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

			// Smoke-test: run a trivial exec to verify MT actually works.
			// MT can load fine but deadlock during real exec calls.
			const ok = await Promise.race([
				ffmpeg.exec(['-version']).then(() => true),
				new Promise<false>((r) => setTimeout(() => r(false), 5000)),
			]);

			if (!ok) {
				post({ type: 'LOG', message: '[ffmpeg] MT smoke-test timed out, falling back to ST' });
				ffmpeg.terminate();
				await loadSingleThread(baseUrl);
			} else {
				loaded = true;
				post({
					type: 'LOG',
					message: `[ffmpeg] Multi-threaded core loaded (${navigator.hardwareConcurrency || 4} threads)`,
				});
			}
		} catch (err) {
			post({ type: 'LOG', message: `[ffmpeg] MT core failed, falling back to ST: ${err}` });
			await loadSingleThread(baseUrl);
		}
	} else {
		await loadSingleThread(baseUrl);
	}

	post({ type: 'READY' });
}

// ── Helpers ──

function post(payload: WorkerResponse): void {
	self.postMessage(payload);
}

const INPUT_NAME = 'input';

async function writeInputFile(file: File): Promise<string> {
	const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
	const name = `${INPUT_NAME}${ext}`;
	const data = new Uint8Array(await file.arrayBuffer());
	await ffmpeg.writeFile(name, data);
	return name;
}

async function removeInputFile(name: string): Promise<void> {
	try {
		await ffmpeg.deleteFile(name);
	} catch {
		// may already be deleted
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
	console.log('[probe] raw logs:', logs.join('\n'));
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

	const streamBaseRegex = /Stream #0:(\d+)(?:\((\w+)\))?[^:]*:\s*(Video|Audio|Subtitle):\s*(\S+)/;

	for (const line of logs) {
		const m = line.match(streamBaseRegex);
		if (!m) continue;

		const streamType = m[3]!.toLowerCase() as 'video' | 'audio' | 'subtitle';
		const stream: ProbeStreamInfo = {
			index: Number(m[1]),
			type: streamType,
			codec: m[4] ?? 'unknown',
			language: m[2],
		};

		if (streamType === 'video') {
			const res = line.match(/(\d{2,5})x(\d{2,5})/);
			if (res) {
				stream.width = Number(res[1]);
				stream.height = Number(res[2]);
			}
			const fps = line.match(/(\d+(?:\.\d+)?)\s*fps/);
			if (fps) stream.fps = Number(Number(fps[1]).toFixed(2));
		}

		if (streamType === 'audio') {
			const hz = line.match(/(\d+)\s*Hz/);
			if (hz) stream.sampleRate = Number(hz[1]);
			if (line.includes('mono')) stream.channels = 1;
			else if (line.includes('stereo')) stream.channels = 2;
			else {
				const ch = line.match(/(\d+)\s*channels/);
				if (ch) stream.channels = Number(ch[1]);
			}
		}

		const br = line.match(/(\d+)\s*kb\/s/);
		if (br) stream.bitrate = Number(br[1]);

		result.streams.push(stream);
	}

	return result;
}

// ── Command Handlers ──

async function handleTranscode(msg: TranscodeMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	const inputName = await writeInputFile(msg.file);

	try {
		// Extract -ss (seek) from args and place it BEFORE -i for fast native seeking.
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
		const fullArgs = ['-y', ...seekArgs, '-i', inputName, ...outputArgs, msg.outputName];
		const exitCode = await ffmpeg.exec(fullArgs);

		if (exitCode !== 0) {
			await tryDeleteFile(msg.outputName);
			throw new Error(`FFmpeg exited with code ${exitCode}`);
		}

		const result = await readAndCleanup(msg.outputName);
		post({ type: 'DONE', data: result, outputName: msg.outputName });
	} finally {
		await removeInputFile(inputName);
	}
}

async function handleGif(msg: GifMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	const inputName = await writeInputFile(msg.file);

	const speed = msg.speed ?? 1;
	const maxColors = msg.maxColors ?? 256;
	const scaleExpr =
		msg.height != null ? `scale=${msg.width}:${msg.height}:flags=lanczos` : `scale=${msg.width}:-1:flags=lanczos`;

	const vfParts: string[] = [`fps=${msg.fps}`, scaleExpr];
	if (speed !== 1) vfParts.push(`setpts=PTS/${speed}`);
	if (msg.reverse) vfParts.push('reverse');
	const vfChain = vfParts.join(',');

	try {
		const paletteArgs = [
			'-y',
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			'-i',
			inputName,
			...(msg.duration != null ? ['-t', String(msg.duration)] : []),
			'-vf',
			`${vfChain},palettegen=max_colors=${maxColors}:stats_mode=diff`,
			'palette.png',
		];

		let exitCode = await ffmpeg.exec(paletteArgs);
		if (exitCode !== 0) throw new Error(`Palette generation failed (code ${exitCode})`);

		const gifArgs = [
			'-y',
			...(msg.startTime != null ? ['-ss', String(msg.startTime)] : []),
			'-i',
			inputName,
			'-i',
			'palette.png',
			...(msg.duration != null ? ['-t', String(msg.duration)] : []),
			'-lavfi',
			`${vfChain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
			'output.gif',
		];

		exitCode = await ffmpeg.exec(gifArgs);
		if (exitCode !== 0) throw new Error(`GIF generation failed (code ${exitCode})`);

		await ffmpeg.deleteFile('palette.png');

		const result = await readAndCleanup('output.gif');
		post({ type: 'DONE', data: result, outputName: 'output.gif' });
	} finally {
		await removeInputFile(inputName);
	}
}

async function handleScreenshot(msg: ScreenshotMessage): Promise<void> {
	const inputName = await writeInputFile(msg.file);

	try {
		const exitCode = await ffmpeg.exec([
			'-y',
			'-ss',
			String(msg.timestamp),
			'-i',
			inputName,
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
		await removeInputFile(inputName);
	}
}

async function handleProbe(msg: ProbeMessage): Promise<void> {
	const inputName = await writeInputFile(msg.file);

	try {
		logBuffer = [];
		collectLogs = true;
		// ffmpeg -i exits code 1 (no output specified) — this is expected
		await ffmpeg.exec(['-i', inputName]);
	} finally {
		collectLogs = false;
		await removeInputFile(inputName);
	}

	const result = parseProbeOutput(logBuffer);
	logBuffer = [];
	post({ type: 'PROBE_RESULT', result });
}

// ── Command Queue ──
// FFmpeg.wasm does NOT support concurrent exec calls.  Because onmessage is
// async, a second message (e.g. TRANSCODE) can start executing while a prior
// one (e.g. PROBE) is still awaiting ffmpeg.exec, causing a deadlock.
// We serialise every operation through a simple promise-chain queue.

let commandQueue: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>): void {
	commandQueue = commandQueue.then(fn, fn);
}

// ── Eager Init ──
// Load FFmpeg immediately so the hook receives READY without needing a message.
enqueue(() => ensureLoaded());

// ── Message Router ──

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
	enqueue(async () => {
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
	});
};
