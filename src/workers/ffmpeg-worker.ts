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

interface ProbeDetailsMessage {
	type: 'PROBE_DETAILS';
	file: File;
}

interface SubtitlePreviewMessage {
	type: 'SUBTITLE_PREVIEW';
	requestId: number;
	file: File;
	streamIndex: number;
	subtitleCodec?: string;
}

interface ExtractFontsMessage {
	type: 'EXTRACT_FONTS';
	file: File;
	attachments: FontAttachmentInfo[];
}

interface RemuxAudioMessage {
	type: 'REMUX_AUDIO';
	file: File;
}

type WorkerMessage =
	| TranscodeMessage
	| GifMessage
	| ScreenshotMessage
	| ProbeMessage
	| ProbeDetailsMessage
	| SubtitlePreviewMessage
	| ExtractFontsMessage
	| RemuxAudioMessage;

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

interface StartedPayload {
	type: 'STARTED';
	job: 'transcode' | 'gif' | 'screenshot';
}

interface LogPayload {
	type: 'LOG';
	message: string;
}

interface ProbeStatusPayload {
	type: 'PROBE_STATUS';
	status: string;
}

interface ProbeResultPayload {
	type: 'PROBE_RESULT';
	result: ProbeResultData;
}

interface ProbeDetailsResultPayload {
	type: 'PROBE_DETAILS_RESULT';
	result: DetailedProbeResultData;
}

interface SubtitlePreviewResultPayload {
	type: 'SUBTITLE_PREVIEW_RESULT';
	requestId: number;
	format: 'ass' | 'webvtt';
	content: string;
	fallbackWebVtt?: string;
}

interface FontsResultPayload {
	type: 'FONTS_RESULT';
	fonts: Array<{ name: string; data: Uint8Array }>;
}

interface RemuxAudioDonePayload {
	type: 'REMUX_AUDIO_DONE';
	data: Uint8Array;
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
	title?: string;
	bitrate?: number;
	isDefault?: boolean;
	isForced?: boolean;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface FontAttachmentInfo {
	index: number;
	filename: string;
}

export interface ProbeResultData {
	duration: number;
	bitrate: number;
	format: string;
	streams: ProbeStreamInfo[];
	fontAttachments: FontAttachmentInfo[];
}

export interface DetailedProbeStreamInfo {
	[key: string]: unknown;
	index?: number;
	codec_type?: string;
	codec_name?: string;
	codec_long_name?: string;
	profile?: string;
	codec_tag_string?: string;
	codec_tag?: string;
	width?: number;
	height?: number;
	display_aspect_ratio?: string;
	sample_aspect_ratio?: string;
	pix_fmt?: string;
	color_range?: string;
	color_space?: string;
	color_transfer?: string;
	color_primaries?: string;
	chroma_location?: string;
	bits_per_raw_sample?: string;
	field_order?: string;
	avg_frame_rate?: string;
	r_frame_rate?: string;
	sample_rate?: string;
	channels?: number;
	channel_layout?: string;
	bit_rate?: string;
	duration?: string;
	start_time?: string;
	tags?: Record<string, string>;
	disposition?: Record<string, number>;
}

export interface DetailedProbeResultData {
	format: {
		[key: string]: unknown;
		duration?: string;
		bit_rate?: string;
		format_name?: string;
		format_long_name?: string;
		size?: string;
		probe_score?: number;
		tags?: Record<string, string>;
	};
	streams: DetailedProbeStreamInfo[];
	chapters?: Array<Record<string, unknown>>;
}

type WorkerResponse =
	| ProgressPayload
	| DonePayload
	| ErrorPayload
	| ReadyPayload
	| StartedPayload
	| LogPayload
	| ProbeStatusPayload
	| ProbeResultPayload
	| ProbeDetailsResultPayload
	| SubtitlePreviewResultPayload
	| FontsResultPayload
	| RemuxAudioDonePayload;

// ── FFmpeg Instance ──

let ffmpeg = new FFmpeg();
let loaded = false;
let logBuffer: string[] = [];
let collectLogs = false;
let probeLogCharCount = 0;
let encodingStats = { fps: 0, frame: 0, speed: 0 };
let captureExecLogs = false;
let execLogBuffer: string[] = [];
let execLogCharCount = 0;
let emitProgressFromLogs = false;
let lastLogProgressEmitAt = 0;

const FORWARD_FFMPEG_LOGS = false;
const INPUT_MOUNT_POINT = '/__vixely_input';
const WORKER_FS_TYPE = 'WORKERFS';
const MAX_MEMORY_FALLBACK_BYTES = 512 * 1024 * 1024;
const SMALL_FILE_MEMORY_WRITE_BYTES = 64 * 1024 * 1024;
const EXEC_STALL_TIMEOUT_MS = 180_000;
const MAX_PROBE_LOG_LINES = 4000;
const MAX_PROBE_LOG_CHARS = 512 * 1024;
const MAX_EXEC_LOG_LINES = 800;
const MAX_EXEC_LOG_CHARS = 192 * 1024;
const QUICK_PROBE_MP4_HEAD_BYTES = 1024 * 1024;
const QUICK_PROBE_MP4_TAIL_BYTES = 32 * 1024 * 1024;
const QUICK_PROBE_MATROSKA_BYTES = 8 * 1024 * 1024;

const supportsMultiThread = typeof SharedArrayBuffer !== 'undefined';
let preferSingleThread = false;
let execHeartbeatAt = 0;

function attachListeners(instance: FFmpeg): void {
	instance.on('progress', ({ progress, time }) => {
		execHeartbeatAt = Date.now();
		post({ type: 'PROGRESS', progress, time, ...encodingStats });
	});

	instance.on('log', ({ message }) => {
		execHeartbeatAt = Date.now();
		if (collectLogs) {
			if (logBuffer.length < MAX_PROBE_LOG_LINES && probeLogCharCount + message.length <= MAX_PROBE_LOG_CHARS) {
				logBuffer.push(message);
				probeLogCharCount += message.length;
			}
		}
		if (captureExecLogs) {
			if (execLogBuffer.length >= MAX_EXEC_LOG_LINES || execLogCharCount + message.length > MAX_EXEC_LOG_CHARS) {
				const removed = execLogBuffer.shift();
				if (removed) execLogCharCount = Math.max(0, execLogCharCount - removed.length);
			}
			execLogBuffer.push(message);
			execLogCharCount += message.length;
		}

		const fpsMatch = message.match(/fps=\s*([\d.]+)/);
		const frameMatch = message.match(/frame=\s*(\d+)/);
		const speedMatch = message.match(/speed=\s*([\d.]+)x/);
		const timeMatch = message.match(/time=\s*([0-9:.]+)/);
		if (fpsMatch) encodingStats.fps = Number(fpsMatch[1]);
		if (frameMatch) encodingStats.frame = Number(frameMatch[1]);
		if (speedMatch) encodingStats.speed = Number(speedMatch[1]);
		if (emitProgressFromLogs && timeMatch) {
			const now = Date.now();
			if (now - lastLogProgressEmitAt >= 250) {
				const timeSec = parseFfmpegClockToSeconds(timeMatch[1] ?? '');
				if (timeSec > 0) {
					post({ type: 'PROGRESS', progress: 0, time: Math.round(timeSec * 1_000_000), ...encodingStats });
					lastLogProgressEmitAt = now;
				}
			}
		}

		if (FORWARD_FFMPEG_LOGS) post({ type: 'LOG', message });
	});
}

function parseFfmpegClockToSeconds(value: string): number {
	const match = value.trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
	if (!match) return 0;
	const h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3]);
	if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return 0;
	return h * 3600 + m * 60 + s;
}

function startExecDiagnostics(): void {
	captureExecLogs = true;
	execLogBuffer = [];
	execLogCharCount = 0;
}

function stopExecDiagnostics(): void {
	captureExecLogs = false;
}

function summarizeExecFailure(message: string, command: string[]): string {
	const LOG_ERROR_HINT =
		/(error|failed|invalid|unsupported|could not|not found|unknown|unable|mismatch|incorrect codec parameters)/i;
	const relevant = execLogBuffer.filter((line) => LOG_ERROR_HINT.test(line)).slice(-10);
	const tail = execLogBuffer.slice(-14);
	const merged = relevant.length > 0 ? [...relevant, ...tail].slice(-16) : tail;
	const details = merged.join('\n').trim();
	const commandText = command.join(' ');
	if (!details) return `${message}\nCommand: ${commandText}`;
	return `${message}\nCommand: ${commandText}\nDetails:\n${details}`;
}

function hasOption(args: string[], option: string): boolean {
	return args.includes(option);
}

function hasVideoCodec(args: string[], codec: string): boolean {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-c:v' && args[i + 1] === codec) return true;
	}
	return false;
}

function hasAudioReencode(args: string[]): boolean {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-c:a' && args[i + 1] !== 'copy') return true;
	}
	return false;
}

function forceThreadsOption(args: string[], threads: string): void {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-threads') {
			args[i + 1] = threads;
			return;
		}
	}
	args.unshift('-threads', threads);
}

function applyWasmX265Safety(args: string[]): void {
	if (!hasVideoCodec(args, 'libx265')) return;
	forceThreadsOption(args, '1');
	if (!hasOption(args, '-x265-params')) {
		args.push('-x265-params', 'pools=1:frame-threads=1:wpp=0:pmode=0:pme=0');
	}
}

const AUDIO_CODEC_FALLBACK_CHAIN: Record<string, string[]> = {
	libopus: ['libvorbis'],
	libvorbis: ['libopus'],
};

function replaceAudioCodec(args: string[], from: string, to: string): boolean {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-c:a' && args[i + 1] === from) {
			args[i + 1] = to;
			return true;
		}
	}
	return false;
}

function getAudioCodec(args: string[]): string | null {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-c:a' && args[i + 1] !== 'copy') return args[i + 1]!;
	}
	return null;
}

async function ensureStableCoreForArgs(args: string[]): Promise<void> {
	if (preferSingleThread) return;
	if (hasVideoCodec(args, 'libx265')) {
		post({ type: 'LOG', message: '[ffmpeg] forcing single-thread core for libx265 stability' });
		await forceSingleThreadReload();
		return;
	}
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

	if (supportsMultiThread && !preferSingleThread) {
		try {
			attachListeners(ffmpeg);
			await ffmpeg.load({
				coreURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.js`, 'text/javascript'),
				wasmURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.wasm`, 'application/wasm'),
				workerURL: await toBlobURL(`${baseUrl}/ffmpeg/ffmpeg-core.worker.js`, 'text/javascript'),
			});

			const ok = await Promise.race([
				ffmpeg.exec(['-version']).then(() => true),
				new Promise<false>((resolve) =>
					setTimeout(() => {
						resolve(false);
					}, 5000),
				),
			]);

			if (!ok) {
				post({ type: 'LOG', message: '[ffmpeg] MT smoke-test timed out, falling back to ST' });
				ffmpeg.terminate();
				preferSingleThread = true;
				await loadSingleThread(baseUrl);
			} else {
				loaded = true;
				post({
					type: 'LOG',
					message: `[ffmpeg] Multi-threaded core loaded (${navigator.hardwareConcurrency || 4} threads)`,
				});
			}
		} catch (err) {
			post({
				type: 'LOG',
				message: `[ffmpeg] MT core failed, falling back to ST: ${err instanceof Error ? err.message : String(err)}`,
			});
			preferSingleThread = true;
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
interface InputHandle {
	name: string;
	cleanup: () => Promise<void>;
}

async function cleanupMountedInputDir(): Promise<void> {
	try {
		await ffmpeg.unmount(INPUT_MOUNT_POINT);
	} catch {
		// noop
	}
	try {
		await ffmpeg.deleteDir(INPUT_MOUNT_POINT);
	} catch {
		// noop
	}
}

async function writeInputFileToMemory(file: File, name: string): Promise<InputHandle> {
	if (file.size > MAX_MEMORY_FALLBACK_BYTES) {
		throw new Error(
			`File is too large for memory fallback (${Math.round(file.size / (1024 * 1024))} MB). Please use a browser/environment where WORKERFS mounting is available.`,
		);
	}
	const data = new Uint8Array(await file.arrayBuffer());
	await ffmpeg.writeFile(name, data);
	return {
		name,
		cleanup: async () => {
			try {
				await ffmpeg.deleteFile(name);
			} catch {
				// noop
			}
		},
	};
}

async function writeInputFile(file: File): Promise<InputHandle> {
	const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
	const name = `${INPUT_NAME}${ext}`;
	await cleanupMountedInputDir();

	// For small files, direct memory writes are more reliable than WORKERFS in some browsers.
	if (file.size <= SMALL_FILE_MEMORY_WRITE_BYTES) {
		return writeInputFileToMemory(file, name);
	}

	try {
		await ffmpeg.createDir(INPUT_MOUNT_POINT);
		// @ts-expect-error WORKERFS is supported at runtime, but missing in current FFmpeg mount typings.
		const mounted = await ffmpeg.mount(WORKER_FS_TYPE, { blobs: [{ name, data: file }] }, INPUT_MOUNT_POINT);
		if (!mounted) throw new Error('WORKERFS mount is unavailable');
		const entries = await ffmpeg.listDir(INPUT_MOUNT_POINT);
		const hasMountedFile = entries.some((entry) => !entry.isDir && entry.name === name);
		if (!hasMountedFile) throw new Error('WORKERFS mount succeeded but input file is missing');
		return { name: `${INPUT_MOUNT_POINT}/${name}`, cleanup: cleanupMountedInputDir };
	} catch (mountErr) {
		post({
			type: 'LOG',
			message: `[ffmpeg] WORKERFS mount failed, falling back to memory write: ${mountErr instanceof Error ? mountErr.message : String(mountErr)}`,
		});
		await cleanupMountedInputDir();
		return writeInputFileToMemory(file, name);
	}
}

async function readAndCleanup(outputName: string): Promise<Uint8Array> {
	const data = await ffmpeg.readFile(outputName);
	await ffmpeg.deleteFile(outputName);
	if (data instanceof Uint8Array) return data;
	return new TextEncoder().encode(data);
}

async function tryDeleteFile(name: string): Promise<void> {
	try {
		await ffmpeg.deleteFile(name);
	} catch {
		// noop
	}
}

async function execWithStallGuard(args: string[]): Promise<number> {
	execHeartbeatAt = Date.now();
	let stalled = false;
	const timer = setInterval(() => {
		if (Date.now() - execHeartbeatAt <= EXEC_STALL_TIMEOUT_MS) return;
		stalled = true;
		try {
			ffmpeg.terminate();
		} catch {
			// noop
		}
	}, 1000);
	try {
		const code = await ffmpeg.exec(args);
		if (stalled) throw new Error('FFmpeg execution stalled');
		return code;
	} catch (err) {
		if (stalled) throw new Error('FFmpeg execution stalled');
		throw err;
	} finally {
		clearInterval(timer);
	}
}

async function forceSingleThreadReload(): Promise<void> {
	try {
		ffmpeg.terminate();
	} catch {
		// noop
	}
	preferSingleThread = true;
	loaded = false;
	await loadSingleThread(self.location.origin);
}

async function forceMultiThreadReload(): Promise<void> {
	try {
		ffmpeg.terminate();
	} catch {
		// noop
	}
	preferSingleThread = false;
	loaded = false;
	ffmpeg = new FFmpeg();
	await ensureLoaded();
}

function splitAssFields(raw: string, expectedCount: number): string[] {
	const parts: string[] = [];
	let rest = raw;
	for (let i = 0; i < expectedCount - 1; i++) {
		const comma = rest.indexOf(',');
		if (comma === -1) {
			parts.push(rest.trim());
			rest = '';
			continue;
		}
		parts.push(rest.slice(0, comma).trim());
		rest = rest.slice(comma + 1);
	}
	parts.push(rest.trim());
	return parts;
}

function assTimeToVtt(input: string): string | null {
	const match = input.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.](\d{1,2})$/);
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	const s = Number(match[3]);
	const cs = Number(match[4]);
	const ms = cs * 10;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function assToBasicWebVtt(ass: string): string | null {
	const lines = ass.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
	let section = '';
	let format: string[] = [];
	const cues: string[] = [];

	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith(';')) continue;
		if (line.startsWith('[') && line.endsWith(']')) {
			section = line.slice(1, -1);
			continue;
		}
		if (section !== 'Events') continue;
		if (line.startsWith('Format:')) {
			format = line
				.slice('Format:'.length)
				.split(',')
				.map((v) => v.trim());
			continue;
		}
		if (!line.startsWith('Dialogue:') || format.length === 0) continue;

		const values = splitAssFields(line.slice('Dialogue:'.length).trim(), format.length);
		const map: Record<string, string> = {};
		for (let i = 0; i < format.length; i++) map[format[i]!] = values[i] ?? '';

		const start = assTimeToVtt(map.Start ?? '');
		const end = assTimeToVtt(map.End ?? '');
		if (!start || !end) continue;

		const text = (map.Text ?? '')
			.replaceAll(/\\[Nn]/g, '\n')
			.replaceAll(/\{[^}]*\}/g, '')
			.trim();
		if (!text) continue;

		cues.push(`${start} --> ${end}\n${text}`);
	}

	if (cues.length === 0) return null;
	return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function isAssLikeCodec(codec?: string): boolean {
	if (!codec) return false;
	const normalized = codec.trim().toLowerCase();
	return normalized === 'ass' || normalized === 'ssa';
}

// ── Quick Header Probe (MP4 + Matroska/WebM) ──

interface Mp4TrackTemp {
	kind?: ProbeStreamInfo['type'];
	codec?: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	duration?: number;
}

interface MkvTrackTemp {
	kind?: ProbeStreamInfo['type'];
	codec?: string;
	width?: number;
	height?: number;
	fps?: number;
	sampleRate?: number;
	channels?: number;
	language?: string;
	isDefault?: boolean;
	isForced?: boolean;
}

function decodeUtf8(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

async function readFileSliceBytes(file: File, start: number, end: number): Promise<Uint8Array> {
	const safeStart = Math.max(0, Math.min(start, file.size));
	const safeEnd = Math.max(safeStart, Math.min(end, file.size));
	return new Uint8Array(await file.slice(safeStart, safeEnd).arrayBuffer());
}

function readU16BE(data: Uint8Array, offset: number): number | undefined {
	if (offset + 2 > data.length) return undefined;
	return (data[offset]! << 8) | data[offset + 1]!;
}

function readU32BE(data: Uint8Array, offset: number): number | undefined {
	if (offset + 4 > data.length) return undefined;
	return data[offset]! * 2 ** 24 + (data[offset + 1]! << 16) + (data[offset + 2]! << 8) + data[offset + 3]!;
}

function readU64BE(data: Uint8Array, offset: number): number | undefined {
	if (offset + 8 > data.length) return undefined;
	const hi = readU32BE(data, offset);
	const lo = readU32BE(data, offset + 4);
	if (hi == null || lo == null) return undefined;
	return hi * 2 ** 32 + lo;
}

function readUintBE(data: Uint8Array): number | undefined {
	if (data.length === 0 || data.length > 8) return undefined;
	let value = 0;
	for (const b of data) value = value * 256 + b;
	return Number.isFinite(value) ? value : undefined;
}

function readFloatBE(data: Uint8Array): number | undefined {
	if (data.length === 4) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		return view.getFloat32(0, false);
	}
	if (data.length === 8) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		return view.getFloat64(0, false);
	}
	return undefined;
}

function normalizeFormatName(raw: string): string {
	const value = raw.trim().toLowerCase();
	if (!value) return 'unknown';
	if (value === 'qt  ') return 'mov';
	return value;
}

function approximateBitrateKbps(fileSizeBytes: number, durationSeconds: number): number {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
	return Math.max(0, Math.round((fileSizeBytes * 8) / durationSeconds / 1000));
}

function iterateMp4Boxes(
	data: Uint8Array,
	start: number,
	end: number,
	cb: (type: string, payloadStart: number, payloadEnd: number) => void,
): void {
	let offset = start;
	while (offset + 8 <= end && offset + 8 <= data.length) {
		const size32 = readU32BE(data, offset);
		if (size32 == null) break;
		const type = String.fromCharCode(data[offset + 4]!, data[offset + 5]!, data[offset + 6]!, data[offset + 7]!);
		let boxSize = size32;
		let headerSize = 8;
		if (size32 === 1) {
			const size64 = readU64BE(data, offset + 8);
			if (size64 == null || size64 > Number.MAX_SAFE_INTEGER) break;
			boxSize = size64;
			headerSize = 16;
		} else if (size32 === 0) {
			boxSize = end - offset;
		}
		if (boxSize < headerSize) break;
		const boxEnd = offset + boxSize;
		if (boxEnd > end || boxEnd > data.length) break;
		cb(type, offset + headerSize, boxEnd);
		if (boxEnd <= offset) break;
		offset = boxEnd;
	}
}

function decodeMp4Language(raw: number | undefined): string | undefined {
	if (!raw) return undefined;
	const a = (((raw >> 10) & 0x1f) + 0x60) & 0xff;
	const b = (((raw >> 5) & 0x1f) + 0x60) & 0xff;
	const c = ((raw & 0x1f) + 0x60) & 0xff;
	if (!/[a-z]/.test(String.fromCharCode(a))) return undefined;
	if (!/[a-z]/.test(String.fromCharCode(b))) return undefined;
	if (!/[a-z]/.test(String.fromCharCode(c))) return undefined;
	return String.fromCharCode(a, b, c);
}

function parseMp4Stsd(payload: Uint8Array, track: Mp4TrackTemp): void {
	if (payload.length < 16) return;
	const entryCount = readU32BE(payload, 4) ?? 0;
	if (entryCount <= 0) return;
	const offset = 8;
	const size = readU32BE(payload, offset) ?? 0;
	if (size < 8 || offset + size > payload.length) return;

	const codecRaw = String.fromCharCode(
		payload[offset + 4]!,
		payload[offset + 5]!,
		payload[offset + 6]!,
		payload[offset + 7]!,
	);
	track.codec = codecRaw.trim().toLowerCase();

	if (track.kind === 'video' && size >= 36) {
		track.width = readU16BE(payload, offset + 32);
		track.height = readU16BE(payload, offset + 34);
	}

	if (track.kind === 'audio' && size >= 36) {
		track.channels = readU16BE(payload, offset + 24);
		const sampleRate = readU32BE(payload, offset + 32);
		if (sampleRate != null) track.sampleRate = sampleRate >>> 16;
	}
}

function parseMp4Stts(payload: Uint8Array, timescale: number | undefined, track: Mp4TrackTemp): void {
	if (track.kind !== 'video' || !timescale || timescale <= 0) return;
	if (payload.length < 16) return;
	const entryCount = readU32BE(payload, 4) ?? 0;
	if (entryCount <= 0) return;
	const sampleDuration = readU32BE(payload, 12);
	if (!sampleDuration || sampleDuration <= 0) return;
	track.fps = Number((timescale / sampleDuration).toFixed(3));
}

function parseMp4Track(data: Uint8Array, start: number, end: number): Mp4TrackTemp {
	const track: Mp4TrackTemp = {};
	iterateMp4Boxes(data, start, end, (type, payloadStart, payloadEnd) => {
		const payload = data.subarray(payloadStart, payloadEnd);
		if (type === 'tkhd') {
			if (payload.length < 84) return;
			const version = payload[0]!;
			const widthOffset = version === 1 ? 88 : 76;
			const heightOffset = version === 1 ? 92 : 80;
			const tkhdWidth = readU32BE(payload, widthOffset);
			const tkhdHeight = readU32BE(payload, heightOffset);
			if (tkhdWidth != null) track.width = tkhdWidth >>> 16;
			if (tkhdHeight != null) track.height = tkhdHeight >>> 16;
			return;
		}
		if (type !== 'mdia') return;

		let timescale: number | undefined;
		iterateMp4Boxes(data, payloadStart, payloadEnd, (mdiaType, mdiaPayloadStart, mdiaPayloadEnd) => {
			const mdiaPayload = data.subarray(mdiaPayloadStart, mdiaPayloadEnd);
			if (mdiaType === 'hdlr') {
				if (mdiaPayload.length < 12) return;
				const handler = String.fromCharCode(
					mdiaPayload[8]!,
					mdiaPayload[9]!,
					mdiaPayload[10]!,
					mdiaPayload[11]!,
				);
				if (handler === 'vide') track.kind = 'video';
				if (handler === 'soun') track.kind = 'audio';
				if (handler === 'text' || handler === 'sbtl' || handler === 'subt' || handler === 'clcp') {
					track.kind = 'subtitle';
				}
				return;
			}

			if (mdiaType === 'mdhd') {
				if (mdiaPayload.length < 24) return;
				const version = mdiaPayload[0]!;
				if (version === 1) {
					const ts = readU32BE(mdiaPayload, 20);
					const dur = readU64BE(mdiaPayload, 24);
					timescale = ts;
					if (ts && dur != null && ts > 0) track.duration = dur / ts;
					track.language = decodeMp4Language(readU16BE(mdiaPayload, 32));
				} else {
					const ts = readU32BE(mdiaPayload, 12);
					const dur = readU32BE(mdiaPayload, 16);
					timescale = ts;
					if (ts && dur != null && ts > 0) track.duration = dur / ts;
					track.language = decodeMp4Language(readU16BE(mdiaPayload, 20));
				}
				return;
			}

			if (mdiaType !== 'minf') return;
			iterateMp4Boxes(data, mdiaPayloadStart, mdiaPayloadEnd, (minfType, minfPayloadStart, minfPayloadEnd) => {
				if (minfType !== 'stbl') return;
				iterateMp4Boxes(
					data,
					minfPayloadStart,
					minfPayloadEnd,
					(stblType, stblPayloadStart, stblPayloadEnd) => {
						const stblPayload = data.subarray(stblPayloadStart, stblPayloadEnd);
						if (stblType === 'stsd') parseMp4Stsd(stblPayload, track);
						if (stblType === 'stts') parseMp4Stts(stblPayload, timescale, track);
					},
				);
			});
		});
	});
	return track;
}

function findMoovPayloadByScan(data: Uint8Array): Uint8Array | null {
	for (let i = 0; i + 8 <= data.length; i++) {
		if (data[i + 4] !== 0x6d || data[i + 5] !== 0x6f || data[i + 6] !== 0x6f || data[i + 7] !== 0x76) {
			continue;
		}
		const size32 = readU32BE(data, i);
		if (size32 == null) continue;
		if (size32 === 0) return data.subarray(i + 8);
		if (size32 === 1) {
			const size64 = readU64BE(data, i + 8);
			if (size64 == null || size64 > Number.MAX_SAFE_INTEGER || size64 < 16) continue;
			const end = i + size64;
			if (end > data.length) continue;
			return data.subarray(i + 16, end);
		}
		if (size32 < 8) continue;
		const end = i + size32;
		if (end > data.length) continue;
		return data.subarray(i + 8, end);
	}
	return null;
}

async function quickProbeMp4(file: File): Promise<ProbeResultData | null> {
	const head = await readFileSliceBytes(file, 0, Math.min(file.size, QUICK_PROBE_MP4_HEAD_BYTES));
	if (head.length < 12) return null;
	if (!(head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70)) return null;
	const majorBrand = decodeUtf8(head.subarray(8, 12));

	let moovPayload: Uint8Array | null = null;
	iterateMp4Boxes(head, 0, head.length, (type, payloadStart, payloadEnd) => {
		if (type === 'moov' && moovPayload == null) moovPayload = head.subarray(payloadStart, payloadEnd);
	});
	if (!moovPayload && file.size > head.length) {
		const tailStart = Math.max(0, file.size - QUICK_PROBE_MP4_TAIL_BYTES);
		const tail = await readFileSliceBytes(file, tailStart, file.size);
		moovPayload = findMoovPayloadByScan(tail);
	}
	if (!moovPayload) return null;

	let duration = 0;
	const tracks: Mp4TrackTemp[] = [];
	iterateMp4Boxes(moovPayload, 0, moovPayload.length, (type, payloadStart, payloadEnd) => {
		const payload = moovPayload!.subarray(payloadStart, payloadEnd);
		if (type === 'mvhd') {
			if (payload.length < 24) return;
			if (payload[0] === 1) {
				const ts = readU32BE(payload, 20);
				const dur = readU64BE(payload, 24);
				if (ts && dur != null && ts > 0) duration = dur / ts;
			} else {
				const ts = readU32BE(payload, 12);
				const dur = readU32BE(payload, 16);
				if (ts && dur != null && ts > 0) duration = dur / ts;
			}
			return;
		}
		if (type === 'trak') {
			const track = parseMp4Track(moovPayload!, payloadStart, payloadEnd);
			if (track.kind) tracks.push(track);
		}
	});

	if (duration <= 0) {
		duration = tracks.reduce((max, track) => (track.duration && track.duration > max ? track.duration : max), 0);
	}

	const streams: ProbeStreamInfo[] = tracks
		.filter((track): track is Mp4TrackTemp & { kind: ProbeStreamInfo['type'] } => track.kind != null)
		.map((track, index) => ({
			index,
			type: track.kind,
			codec: track.codec ?? 'unknown',
			width: track.width,
			height: track.height,
			fps: track.fps,
			sampleRate: track.sampleRate,
			channels: track.channels,
			language: track.language,
		}));

	if (streams.length === 0) return null;
	return {
		duration,
		bitrate: approximateBitrateKbps(file.size, duration),
		format: normalizeFormatName(majorBrand),
		streams,
		fontAttachments: [],
	};
}

function readEbmlId(data: Uint8Array, offset: number): { id: number; length: number } | null {
	const first = data[offset];
	if (first == null) return null;
	let mask = 0x80;
	let length = 1;
	while (length <= 4 && (first & mask) === 0) {
		mask >>= 1;
		length++;
	}
	if (length > 4 || offset + length > data.length) return null;
	let id = 0;
	for (let i = 0; i < length; i++) id = (id << 8) | data[offset + i]!;
	return { id, length };
}

function readEbmlSize(data: Uint8Array, offset: number): { value: number; length: number; unknown: boolean } | null {
	const first = data[offset];
	if (first == null) return null;
	let mask = 0x80;
	let length = 1;
	while (length <= 8 && (first & mask) === 0) {
		mask >>= 1;
		length++;
	}
	if (length > 8 || offset + length > data.length) return null;
	let value = first & ~mask;
	for (let i = 1; i < length; i++) value = value * 256 + data[offset + i]!;
	const usableBits = 7 * length;
	const unknownMarker = usableBits >= 53 ? Number.MAX_SAFE_INTEGER : 2 ** usableBits - 1;
	return { value, length, unknown: value === unknownMarker };
}

function normalizeMkvCodec(codec: string): string {
	const lower = codec.toLowerCase();
	if (lower.includes('av1')) return 'av1';
	if (lower.includes('vp9')) return 'vp9';
	if (lower.includes('vp8')) return 'vp8';
	if (lower.includes('h264') || lower.includes('avc')) return 'h264';
	if (lower.includes('hevc') || lower.includes('h265')) return 'hevc';
	if (lower.includes('opus')) return 'opus';
	if (lower.includes('aac')) return 'aac';
	if (lower.includes('vorbis')) return 'vorbis';
	return lower;
}

function readEbmlText(data: Uint8Array): string {
	return decodeUtf8(data).replaceAll('\u0000', '').trim();
}

function parseMkvVideo(data: Uint8Array, track: MkvTrackTemp): void {
	let offset = 0;
	while (offset < data.length) {
		const idRes = readEbmlId(data, offset);
		if (!idRes) break;
		const sizeRes = readEbmlSize(data, offset + idRes.length);
		if (!sizeRes) break;
		const payloadStart = offset + idRes.length + sizeRes.length;
		if (payloadStart > data.length) break;
		const payloadEnd = sizeRes.unknown ? data.length : Math.min(data.length, payloadStart + sizeRes.value);
		if (payloadEnd <= payloadStart) break;
		const payload = data.subarray(payloadStart, payloadEnd);
		if (idRes.id === 0xb0) {
			const width = readUintBE(payload);
			if (width != null) track.width = width;
		}
		if (idRes.id === 0xba) {
			const height = readUintBE(payload);
			if (height != null) track.height = height;
		}
		offset = payloadEnd;
	}
}

function parseMkvAudio(data: Uint8Array, track: MkvTrackTemp): void {
	let offset = 0;
	while (offset < data.length) {
		const idRes = readEbmlId(data, offset);
		if (!idRes) break;
		const sizeRes = readEbmlSize(data, offset + idRes.length);
		if (!sizeRes) break;
		const payloadStart = offset + idRes.length + sizeRes.length;
		if (payloadStart > data.length) break;
		const payloadEnd = sizeRes.unknown ? data.length : Math.min(data.length, payloadStart + sizeRes.value);
		if (payloadEnd <= payloadStart) break;
		const payload = data.subarray(payloadStart, payloadEnd);
		if (idRes.id === 0x9f) {
			const channels = readUintBE(payload);
			if (channels != null) track.channels = channels;
		}
		if (idRes.id === 0xb5) {
			const sampleRate = readFloatBE(payload);
			if (sampleRate != null && Number.isFinite(sampleRate) && sampleRate > 0)
				track.sampleRate = Math.round(sampleRate);
		}
		offset = payloadEnd;
	}
}

function parseMkvTrackEntry(data: Uint8Array): MkvTrackTemp {
	const track: MkvTrackTemp = {};
	let offset = 0;
	while (offset < data.length) {
		const idRes = readEbmlId(data, offset);
		if (!idRes) break;
		const sizeRes = readEbmlSize(data, offset + idRes.length);
		if (!sizeRes) break;
		const payloadStart = offset + idRes.length + sizeRes.length;
		if (payloadStart > data.length) break;
		const payloadEnd = sizeRes.unknown ? data.length : Math.min(data.length, payloadStart + sizeRes.value);
		if (payloadEnd <= payloadStart) break;
		const payload = data.subarray(payloadStart, payloadEnd);

		if (idRes.id === 0x83) {
			const value = readUintBE(payload);
			if (value === 1) track.kind = 'video';
			if (value === 2) track.kind = 'audio';
			if (value === 17) track.kind = 'subtitle';
		}
		if (idRes.id === 0x86) {
			const codec = readEbmlText(payload);
			if (codec) track.codec = normalizeMkvCodec(codec);
		}
		if (idRes.id === 0x22b59c || idRes.id === 0x9c) {
			const language = readEbmlText(payload);
			if (language) track.language = language;
		}
		if (idRes.id === 0x88) track.isDefault = (readUintBE(payload) ?? 1) !== 0;
		if (idRes.id === 0x55aa) track.isForced = (readUintBE(payload) ?? 0) !== 0;
		if (idRes.id === 0x23e383) {
			const defaultDurationNs = readUintBE(payload);
			if (defaultDurationNs && defaultDurationNs > 0)
				track.fps = Number((1_000_000_000 / defaultDurationNs).toFixed(3));
		}
		if (idRes.id === 0xe0) parseMkvVideo(payload, track);
		if (idRes.id === 0xe1) parseMkvAudio(payload, track);

		offset = payloadEnd;
	}
	return track;
}

function parseMatroskaChunk(data: Uint8Array, fileSize: number): ProbeResultData | null {
	if (data.length < 4) return null;
	if (data[0] !== 0x1a || data[1] !== 0x45 || data[2] !== 0xdf || data[3] !== 0xa3) return null;

	let format = 'matroska';
	let durationTicks: number | undefined;
	let timecodeScale = 1_000_000;
	const tracks: MkvTrackTemp[] = [];

	const parseInfo = (infoData: Uint8Array): void => {
		let infoOffset = 0;
		while (infoOffset < infoData.length) {
			const infoId = readEbmlId(infoData, infoOffset);
			if (!infoId) break;
			const infoSize = readEbmlSize(infoData, infoOffset + infoId.length);
			if (!infoSize) break;
			const payloadStart = infoOffset + infoId.length + infoSize.length;
			if (payloadStart > infoData.length) break;
			const payloadEnd = infoSize.unknown
				? infoData.length
				: Math.min(infoData.length, payloadStart + infoSize.value);
			if (payloadEnd <= payloadStart) break;
			const payload = infoData.subarray(payloadStart, payloadEnd);
			if (infoId.id === 0x2ad7b1) {
				const scale = readUintBE(payload);
				if (scale != null && scale > 0) timecodeScale = scale;
			}
			if (infoId.id === 0x4489) {
				const ticks = readFloatBE(payload);
				if (ticks != null && Number.isFinite(ticks) && ticks > 0) durationTicks = ticks;
			}
			infoOffset = payloadEnd;
		}
	};

	const parseTracks = (tracksData: Uint8Array): void => {
		let tracksOffset = 0;
		while (tracksOffset < tracksData.length) {
			const trackId = readEbmlId(tracksData, tracksOffset);
			if (!trackId) break;
			const trackSize = readEbmlSize(tracksData, tracksOffset + trackId.length);
			if (!trackSize) break;
			const payloadStart = tracksOffset + trackId.length + trackSize.length;
			if (payloadStart > tracksData.length) break;
			const payloadEnd = trackSize.unknown
				? tracksData.length
				: Math.min(tracksData.length, payloadStart + trackSize.value);
			if (payloadEnd <= payloadStart) break;
			if (trackId.id === 0xae) {
				const track = parseMkvTrackEntry(tracksData.subarray(payloadStart, payloadEnd));
				if (track.kind) tracks.push(track);
			}
			tracksOffset = payloadEnd;
		}
	};

	let offset = 0;
	while (offset < data.length) {
		const idRes = readEbmlId(data, offset);
		if (!idRes) break;
		const sizeRes = readEbmlSize(data, offset + idRes.length);
		if (!sizeRes) break;
		const payloadStart = offset + idRes.length + sizeRes.length;
		if (payloadStart > data.length) break;
		const payloadEnd = sizeRes.unknown ? data.length : Math.min(data.length, payloadStart + sizeRes.value);
		if (payloadEnd <= payloadStart) break;
		const payload = data.subarray(payloadStart, payloadEnd);

		if (idRes.id === 0x4282) {
			const docType = readEbmlText(payload);
			if (docType) format = docType.toLowerCase().includes('webm') ? 'webm' : 'matroska';
		}

		if (idRes.id === 0x18538067) {
			let segmentOffset = 0;
			while (segmentOffset < payload.length) {
				const segmentId = readEbmlId(payload, segmentOffset);
				if (!segmentId) break;
				const segmentSize = readEbmlSize(payload, segmentOffset + segmentId.length);
				if (!segmentSize) break;
				const segPayloadStart = segmentOffset + segmentId.length + segmentSize.length;
				if (segPayloadStart > payload.length) break;
				const segPayloadEnd = segmentSize.unknown
					? payload.length
					: Math.min(payload.length, segPayloadStart + segmentSize.value);
				if (segPayloadEnd <= segPayloadStart) break;
				const segPayload = payload.subarray(segPayloadStart, segPayloadEnd);
				if (segmentId.id === 0x1549a966) parseInfo(segPayload);
				if (segmentId.id === 0x1654ae6b) parseTracks(segPayload);
				segmentOffset = segPayloadEnd;
			}
		}

		offset = payloadEnd;
	}

	const streams: ProbeStreamInfo[] = tracks
		.filter((track): track is MkvTrackTemp & { kind: ProbeStreamInfo['type'] } => track.kind != null)
		.map((track, index) => ({
			index,
			type: track.kind,
			codec: track.codec ?? 'unknown',
			width: track.width,
			height: track.height,
			fps: track.fps,
			sampleRate: track.sampleRate,
			channels: track.channels,
			language: track.language,
			isDefault: track.isDefault,
			isForced: track.isForced,
		}));

	if (streams.length === 0) return null;
	const duration = durationTicks ? (durationTicks * timecodeScale) / 1_000_000_000 : 0;
	return { duration, bitrate: approximateBitrateKbps(fileSize, duration), format, streams, fontAttachments: [] };
}

async function quickProbeByContainerHeader(file: File): Promise<ProbeResultData | null> {
	const head = await readFileSliceBytes(file, 0, Math.min(file.size, QUICK_PROBE_MP4_HEAD_BYTES));
	if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
		return quickProbeMp4(file);
	}
	if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
		const chunk =
			head.length >= QUICK_PROBE_MATROSKA_BYTES
				? head
				: await readFileSliceBytes(file, 0, Math.min(file.size, QUICK_PROBE_MATROSKA_BYTES));
		return parseMatroskaChunk(chunk, file.size);
	}
	return null;
}

// ── Probe Parser ──

const FONT_MIME_TYPES = new Set([
	'application/x-truetype-font',
	'application/vnd.ms-opentype',
	'font/ttf',
	'font/otf',
	'font/sfnt',
	'application/font-woff',
]);

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function isFontAttachment(filename: string, mimetype?: string): boolean {
	if (mimetype && FONT_MIME_TYPES.has(mimetype.toLowerCase())) return true;
	const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
	return FONT_EXTENSIONS.has(ext);
}

function parseProbeOutput(logs: string[]): ProbeResultData {
	const result: ProbeResultData = { duration: 0, bitrate: 0, format: '', streams: [], fontAttachments: [] };
	const fullLog = logs.join('\n');
	const normalizeTagKey = (key: string): string =>
		key
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');

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

	const streamBaseRegex = /Stream #0:(\d+)(?:\(([^)]+)\))?[^:]*:\s*(Video|Audio|Subtitle):\s*(\S+)/;
	const attachmentRegex = /Stream #0:(\d+)(?:\(([^)]+)\))?[^:]*:\s*Attachment:\s*/;

	let attachmentIndex = 0;
	for (let i = 0; i < logs.length; i++) {
		const line = logs[i]!;
		const am = line.match(attachmentRegex);
		if (am) {
			let filename = '';
			let mimetype = '';
			for (let j = i + 1; j < Math.min(i + 6, logs.length); j++) {
				const metaLine = logs[j]!.trim();
				if (metaLine.startsWith('Stream #') || !metaLine.includes(':')) break;
				const fnMatch = metaLine.match(/filename\s*:\s*(.+)/i);
				if (fnMatch) filename = fnMatch[1]!.trim();
				const mtMatch = metaLine.match(/mimetype\s*:\s*(.+)/i);
				if (mtMatch) mimetype = mtMatch[1]!.trim();
			}
			if (filename && isFontAttachment(filename, mimetype)) {
				result.fontAttachments.push({ index: attachmentIndex, filename });
			}
			attachmentIndex++;
			continue;
		}

		const match = line.match(streamBaseRegex);
		if (!match) continue;

		const streamTypeRaw = match[3]?.toLowerCase();
		if (streamTypeRaw !== 'video' && streamTypeRaw !== 'audio' && streamTypeRaw !== 'subtitle') continue;
		const streamType: ProbeStreamInfo['type'] = streamTypeRaw;
		const stream: ProbeStreamInfo = {
			index: Number(match[1]),
			type: streamType,
			codec: (match[4] ?? 'unknown').replace(/[,\s]+$/g, ''),
			language: match[2]?.trim(),
			isDefault: /\(default\)/i.test(line) || undefined,
			isForced: /\(forced\)/i.test(line) || undefined,
		};
		const tags: Record<string, string> = {};
		for (let j = i + 1; j < logs.length; j++) {
			const metaLine = logs[j]!;
			if (/Stream #\d+:\d+/i.test(metaLine)) break;
			const metaMatch = metaLine.match(/^\s*([A-Za-z0-9 _/-]+)\s*:\s*(.+?)\s*$/);
			if (!metaMatch) continue;
			const key = normalizeTagKey(metaMatch[1]!);
			const value = metaMatch[2]!.trim();
			if (!key || !value) continue;
			tags[key] = value;
		}
		if (Object.keys(tags).length > 0) {
			stream.tags = tags;
			stream.title = tags.title;
			stream.language = stream.language ?? tags.language;
		}

		if (streamType === 'video') {
			const res = line.match(/(\d{2,5})x(\d{2,5})/);
			if (res) {
				stream.width = Number(res[1]);
				stream.height = Number(res[2]);
			}
			const fpsMatch = line.match(/(\d+(?:\.\d+)?)\s*fps/);
			if (fpsMatch) stream.fps = Number(Number(fpsMatch[1]).toFixed(2));
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
		const disposition: Record<string, number> = {};
		if (stream.isDefault != null) disposition.default = stream.isDefault ? 1 : 0;
		if (stream.isForced != null) disposition.forced = stream.isForced ? 1 : 0;
		if (Object.keys(disposition).length > 0) stream.disposition = disposition;

		result.streams.push(stream);
	}

	return result;
}

function parseFractionToNumber(input?: string): number | undefined {
	if (!input) return undefined;
	if (!input.includes('/')) {
		const val = Number(input);
		return Number.isFinite(val) && val > 0 ? val : undefined;
	}
	const [numRaw, denRaw] = input.split('/');
	const num = Number(numRaw);
	const den = Number(denRaw);
	if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
	const val = num / den;
	return Number.isFinite(val) && val > 0 ? val : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const record: Record<string, string> = {};
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === 'string' && v.trim() !== '') record[k] = v;
	}
	return Object.keys(record).length > 0 ? record : undefined;
}

function toNumberRecord(value: unknown): Record<string, number> | undefined {
	if (!isRecord(value)) return undefined;
	const record: Record<string, number> = {};
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === 'number' && Number.isFinite(v)) record[k] = v;
	}
	return Object.keys(record).length > 0 ? record : undefined;
}

function parseFfprobeJson(jsonText: string): ProbeResultData {
	const parsedRaw: unknown = JSON.parse(jsonText);
	const parsed = isRecord(parsedRaw) ? parsedRaw : {};
	const formatRaw = isRecord(parsed.format) ? parsed.format : {};
	const streamsRaw = Array.isArray(parsed.streams) ? parsed.streams : [];
	const durationRaw = formatRaw.duration;
	const duration = typeof durationRaw === 'string' || typeof durationRaw === 'number' ? Number(durationRaw) || 0 : 0;
	const bitRateRaw = formatRaw.bit_rate;
	const bitRateNumber =
		typeof bitRateRaw === 'string' || typeof bitRateRaw === 'number' ? Number(bitRateRaw) : Number.NaN;
	const formatNameRaw = formatRaw.format_name;

	const result: ProbeResultData = {
		duration,
		bitrate: Number.isFinite(bitRateNumber) && bitRateNumber > 0 ? Math.round(bitRateNumber / 1000) : 0,
		format: typeof formatNameRaw === 'string' ? formatNameRaw : '',
		streams: [],
		fontAttachments: [],
	};

	for (const streamRaw of streamsRaw) {
		if (!isRecord(streamRaw)) continue;
		const codecType = streamRaw.codec_type;
		if (typeof codecType !== 'string') continue;
		if (codecType === 'attachment') {
			const tags = toStringRecord(streamRaw.tags);
			const filename = tags?.filename ?? '';
			const mimetype = tags?.mimetype;
			if (filename && isFontAttachment(filename, mimetype)) {
				const index = typeof streamRaw.index === 'number' ? streamRaw.index : 0;
				result.fontAttachments.push({ index, filename });
			}
			continue;
		}
		if (codecType !== 'video' && codecType !== 'audio' && codecType !== 'subtitle') continue;
		const tags = toStringRecord(streamRaw.tags);
		const disposition = toNumberRecord(streamRaw.disposition);
		const mimetype = tags?.mimetype?.toLowerCase();
		if (codecType === 'video' && (disposition?.attached_pic === 1 || mimetype?.startsWith('image/'))) {
			continue;
		}

		const avgFrameRate = typeof streamRaw.avg_frame_rate === 'string' ? streamRaw.avg_frame_rate : undefined;
		const rFrameRate = typeof streamRaw.r_frame_rate === 'string' ? streamRaw.r_frame_rate : undefined;
		const fps = parseFractionToNumber(avgFrameRate) ?? parseFractionToNumber(rFrameRate);
		const sampleRateRaw = streamRaw.sample_rate;
		const sampleRate =
			typeof sampleRateRaw === 'string' || typeof sampleRateRaw === 'number' ? Number(sampleRateRaw) : Number.NaN;
		const bitRateStreamRaw = streamRaw.bit_rate;
		const bitRateStreamNumber =
			typeof bitRateStreamRaw === 'string' || typeof bitRateStreamRaw === 'number'
				? Number(bitRateStreamRaw)
				: Number.NaN;

		result.streams.push({
			index: typeof streamRaw.index === 'number' ? streamRaw.index : 0,
			type: codecType,
			codec: (typeof streamRaw.codec_name === 'string' ? streamRaw.codec_name : 'unknown').replace(
				/[,\s]+$/g,
				'',
			),
			width: typeof streamRaw.width === 'number' ? streamRaw.width : undefined,
			height: typeof streamRaw.height === 'number' ? streamRaw.height : undefined,
			fps: fps ? Number(fps.toFixed(3)) : undefined,
			sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
			channels: typeof streamRaw.channels === 'number' ? streamRaw.channels : undefined,
			language: tags?.language,
			title: tags?.title,
			bitrate:
				Number.isFinite(bitRateStreamNumber) && bitRateStreamNumber > 0
					? Math.round(bitRateStreamNumber / 1000)
					: undefined,
			isDefault: disposition?.default === 1 || undefined,
			isForced: disposition?.forced === 1 || undefined,
			tags,
			disposition,
		});
	}

	return result;
}

function parseDetailedFfprobeJson(jsonText: string): DetailedProbeResultData {
	const parsedRaw: unknown = JSON.parse(jsonText);
	if (!isRecord(parsedRaw)) return { format: {}, streams: [], chapters: [] };

	const format: DetailedProbeResultData['format'] = {};
	if (isRecord(parsedRaw.format)) {
		for (const [k, v] of Object.entries(parsedRaw.format)) format[k] = v;
		if (typeof parsedRaw.format.duration === 'string') format.duration = parsedRaw.format.duration;
		if (typeof parsedRaw.format.bit_rate === 'string') format.bit_rate = parsedRaw.format.bit_rate;
		if (typeof parsedRaw.format.format_name === 'string') format.format_name = parsedRaw.format.format_name;
		if (typeof parsedRaw.format.format_long_name === 'string') {
			format.format_long_name = parsedRaw.format.format_long_name;
		}
		if (typeof parsedRaw.format.size === 'string') format.size = parsedRaw.format.size;
		if (typeof parsedRaw.format.probe_score === 'number') format.probe_score = parsedRaw.format.probe_score;
		const tags = toStringRecord(parsedRaw.format.tags);
		if (tags) format.tags = tags;
	}

	const streams: DetailedProbeStreamInfo[] = Array.isArray(parsedRaw.streams)
		? parsedRaw.streams.filter(isRecord).map((stream) => {
				const result: DetailedProbeStreamInfo = {};
				for (const [k, v] of Object.entries(stream)) result[k] = v;
				return result;
			})
		: [];

	const chapters: Array<Record<string, unknown>> = Array.isArray(parsedRaw.chapters)
		? parsedRaw.chapters.filter(isRecord)
		: [];

	return { format, streams, chapters };
}

function toDetailedProbeFromQuickProbe(probe: ProbeResultData): DetailedProbeResultData {
	return {
		format: {
			duration: probe.duration > 0 ? probe.duration.toString() : undefined,
			bit_rate: probe.bitrate > 0 ? String(probe.bitrate * 1000) : undefined,
			format_name: probe.format || undefined,
		},
		streams: probe.streams.map((stream) => {
			const disposition: Record<string, number> = {};
			if (stream.isDefault != null) disposition.default = stream.isDefault ? 1 : 0;
			if (stream.isForced != null) disposition.forced = stream.isForced ? 1 : 0;
			return {
				index: stream.index,
				codec_type: stream.type,
				codec_name: stream.codec,
				width: stream.width,
				height: stream.height,
				avg_frame_rate: stream.fps != null ? `${Math.round(stream.fps * 1000)}/1000` : undefined,
				r_frame_rate: stream.fps != null ? `${Math.round(stream.fps * 1000)}/1000` : undefined,
				sample_rate: stream.sampleRate != null ? String(stream.sampleRate) : undefined,
				channels: stream.channels,
				bit_rate: stream.bitrate != null ? String(Math.round(stream.bitrate * 1000)) : undefined,
				tags:
					stream.tags || stream.language || stream.title
						? {
								...stream.tags,
								...(stream.language ? { language: stream.language } : {}),
								...(stream.title ? { title: stream.title } : {}),
							}
						: undefined,
				disposition: Object.keys(disposition).length > 0 ? disposition : undefined,
			} satisfies DetailedProbeStreamInfo;
		}),
	};
}

// ── Command Handlers ──

async function handleTranscode(msg: TranscodeMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	let input: InputHandle | null = null;
	try {
		await ensureStableCoreForArgs(msg.args);
		input = await writeInputFile(msg.file);
		startExecDiagnostics();
		emitProgressFromLogs = true;
		lastLogProgressEmitAt = 0;
		const inputSeekArgs: string[] = [];
		const outputDurationArgs: string[] = [];
		const outputArgs: string[] = [];
		let idx = 0;
		while (idx < msg.args.length) {
			const token = msg.args[idx];
			if (token === '-ss') {
				inputSeekArgs.push(token, msg.args[idx + 1] ?? '0');
				idx += 2;
			} else if (token === '-t' || token === '-to') {
				outputDurationArgs.push(token, msg.args[idx + 1] ?? '0');
				idx += 2;
			} else {
				outputArgs.push(msg.args[idx]!);
				idx++;
			}
		}
		applyWasmX265Safety(outputArgs);
		const buildFullArgs = (inputName: string): string[] => [
			'-y',
			...inputSeekArgs,
			'-i',
			inputName,
			...outputDurationArgs,
			...outputArgs,
			msg.outputName,
		];
		let fullArgs = buildFullArgs(input.name);
		post({ type: 'STARTED', job: 'transcode' });
		post({ type: 'LOG', message: `[ffmpeg] exec: ${fullArgs.join(' ')}` });
		let exitCode = -1;
		try {
			exitCode = await execWithStallGuard(fullArgs);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);

			// Audio codec WASM crash: try fallback codecs before giving up.
			if (message.includes('memory access out of bounds') && hasAudioReencode(outputArgs)) {
				const currentAudioCodec = getAudioCodec(outputArgs);
				const fallbacks = currentAudioCodec ? (AUDIO_CODEC_FALLBACK_CHAIN[currentAudioCodec] ?? []) : [];
				let recovered = false;
				for (const fallbackCodec of fallbacks) {
					post({
						type: 'LOG',
						message: `[ffmpeg] ${currentAudioCodec} crashed in WASM, retrying with ${fallbackCodec}`,
					});
					replaceAudioCodec(outputArgs, getAudioCodec(outputArgs)!, fallbackCodec);
					await input!.cleanup();
					try {
						ffmpeg.terminate();
					} catch {
						// noop – instance is already dead from the crash
					}
					loaded = false;
					ffmpeg = new FFmpeg();
					await ensureLoaded();
					input = await writeInputFile(msg.file);
					fullArgs = buildFullArgs(input.name);
					post({ type: 'LOG', message: `[ffmpeg] exec retry (audio fallback): ${fullArgs.join(' ')}` });
					try {
						exitCode = await execWithStallGuard(fullArgs);
						recovered = true;
						break;
					} catch (retryErr) {
						const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
						if (retryMsg.includes('memory access out of bounds')) continue;
						throw retryErr;
					}
				}
				if (!recovered) throw err;
			} else if (message.includes('stalled')) {
				if (msg.file.size > MAX_MEMORY_FALLBACK_BYTES) {
					post({
						type: 'LOG',
						message:
							'[ffmpeg] exec stalled, retrying with fresh multi-thread core (large input avoids single-thread memory fallback)...',
					});
					await input.cleanup();
					await forceMultiThreadReload();
				} else {
					post({ type: 'LOG', message: '[ffmpeg] exec stalled, retrying in single-thread mode...' });
					await input.cleanup();
					await forceSingleThreadReload();
				}
				input = await writeInputFile(msg.file);
				fullArgs = buildFullArgs(input.name);
				post({ type: 'LOG', message: `[ffmpeg] exec retry: ${fullArgs.join(' ')}` });
				exitCode = await execWithStallGuard(fullArgs);
			} else {
				throw err;
			}
		}
		if (exitCode !== 0) {
			await tryDeleteFile(msg.outputName);
			throw new Error(summarizeExecFailure(`FFmpeg exited with code ${exitCode}`, fullArgs));
		}
		const result = await readAndCleanup(msg.outputName);
		post({ type: 'DONE', data: result, outputName: msg.outputName });
	} finally {
		emitProgressFromLogs = false;
		stopExecDiagnostics();
		if (input) await input.cleanup();
	}
}

async function handleGif(msg: GifMessage): Promise<void> {
	encodingStats = { fps: 0, frame: 0, speed: 0 };
	const input = await writeInputFile(msg.file);
	post({ type: 'STARTED', job: 'gif' });
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
			input.name,
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
			input.name,
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
		await input.cleanup();
	}
}

async function handleScreenshot(msg: ScreenshotMessage): Promise<void> {
	const input = await writeInputFile(msg.file);
	post({ type: 'STARTED', job: 'screenshot' });
	try {
		const exitCode = await ffmpeg.exec([
			'-y',
			'-ss',
			String(msg.timestamp),
			'-i',
			input.name,
			'-frames:v',
			'1',
			'-q:v',
			'2',
			'screenshot.png',
		]);
		if (exitCode !== 0) throw new Error(`Screenshot failed (code ${exitCode})`);
		const result = await readAndCleanup('screenshot.png');
		post({ type: 'DONE', data: result, outputName: 'screenshot.png' });
	} finally {
		await input.cleanup();
	}
}

async function handleProbe(msg: ProbeMessage): Promise<void> {
	post({ type: 'PROBE_STATUS', status: 'Reading container header...' });
	try {
		const quickResult = await quickProbeByContainerHeader(msg.file);
		if (quickResult && quickResult.streams.some((stream) => stream.type === 'video')) {
			post({ type: 'PROBE_RESULT', result: quickResult });
			return;
		}
	} catch (err) {
		post({
			type: 'LOG',
			message: `[ffmpeg] Quick container probe failed, falling back: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	post({ type: 'PROBE_STATUS', status: 'Running stream probe...' });
	const input = await writeInputFile(msg.file);
	const outputName = 'probe.json';
	const runProbe = async (fast: boolean): Promise<ProbeResultData> => {
		const args = [
			'-v',
			'error',
			...(fast ? ['-analyzeduration', '0', '-probesize', '8388608'] : []),
			'-show_entries',
			'format=format_name:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels,bit_rate,disposition:stream_tags',
			'-print_format',
			'json',
			'-i',
			input.name,
			'-o',
			outputName,
		];
		const exitCode = await ffmpeg.ffprobe(args);
		if (exitCode !== 0) throw new Error(`ffprobe failed (code ${exitCode})`);
		const output = await ffmpeg.readFile(outputName);
		const jsonText = output instanceof Uint8Array ? new TextDecoder().decode(output) : String(output);
		return parseFfprobeJson(jsonText);
	};

	try {
		let result = await runProbe(true);
		const hasVideoStream = result.streams.some((s) => s.type === 'video');
		if (result.streams.length === 0 || !hasVideoStream) {
			post({ type: 'PROBE_STATUS', status: 'Retrying deep stream probe...' });
			result = await runProbe(false);
		}
		post({ type: 'PROBE_RESULT', result });
	} catch (err) {
		post({ type: 'PROBE_STATUS', status: 'Using compatibility probe fallback...' });
		logBuffer = [];
		probeLogCharCount = 0;
		collectLogs = true;
		await ffmpeg.exec(['-v', 'info', '-hide_banner', '-i', input.name]);
		collectLogs = false;
		const result = parseProbeOutput(logBuffer);
		logBuffer = [];
		probeLogCharCount = 0;
		post({ type: 'PROBE_RESULT', result });
		post({
			type: 'LOG',
			message: `[ffmpeg] Probe fallback parser used after ffprobe json failure: ${err instanceof Error ? err.message : String(err)}`,
		});
	} finally {
		collectLogs = false;
		logBuffer = [];
		probeLogCharCount = 0;
		await tryDeleteFile(outputName);
		await input.cleanup();
	}
}

async function handleProbeDetails(msg: ProbeDetailsMessage): Promise<void> {
	const input = await writeInputFile(msg.file);
	const outputName = 'probe-details.json';
	try {
		const runDetailsProbe = async (showEntries: string): Promise<DetailedProbeResultData> => {
			const exitCode = await ffmpeg.ffprobe([
				'-v',
				'error',
				'-show_entries',
				showEntries,
				'-print_format',
				'json',
				'-i',
				input.name,
				'-o',
				outputName,
			]);
			if (exitCode !== 0) throw new Error(`ffprobe detailed probe failed (code ${exitCode})`);
			const output = await ffmpeg.readFile(outputName);
			const jsonText = output instanceof Uint8Array ? new TextDecoder().decode(output) : String(output);
			return parseDetailedFfprobeJson(jsonText);
		};
		const runDetailsDump = async (): Promise<DetailedProbeResultData> => {
			const exitCode = await ffmpeg.ffprobe([
				'-v',
				'error',
				'-show_format',
				'-show_streams',
				'-show_chapters',
				'-print_format',
				'json',
				'-i',
				input.name,
				'-o',
				outputName,
			]);
			if (exitCode !== 0) throw new Error(`ffprobe detailed dump failed (code ${exitCode})`);
			const output = await ffmpeg.readFile(outputName);
			const jsonText = output instanceof Uint8Array ? new TextDecoder().decode(output) : String(output);
			return parseDetailedFfprobeJson(jsonText);
		};

		try {
			const result = await runDetailsProbe(
				'format=duration,bit_rate,format_name,format_long_name,size,probe_score:format_tags:stream=index,codec_type,codec_name,codec_long_name,profile,codec_tag_string,codec_tag,width,height,display_aspect_ratio,sample_aspect_ratio,pix_fmt,color_range,color_space,color_transfer,color_primaries,chroma_location,bits_per_raw_sample,field_order,avg_frame_rate,r_frame_rate,sample_rate,channels,channel_layout,bit_rate,duration,start_time,disposition:stream_tags',
			);
			post({ type: 'PROBE_DETAILS_RESULT', result });
			return;
		} catch (err) {
			post({
				type: 'LOG',
				message: `[ffmpeg] Detailed probe failed with full field set, retrying reduced probe: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		try {
			const result = await runDetailsDump();
			post({ type: 'PROBE_DETAILS_RESULT', result });
			return;
		} catch (err) {
			post({
				type: 'LOG',
				message: `[ffmpeg] Detailed probe failed with full dump, using compatibility fallback: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		try {
			logBuffer = [];
			probeLogCharCount = 0;
			collectLogs = true;
			await ffmpeg.exec(['-v', 'info', '-hide_banner', '-i', input.name]);
			collectLogs = false;
			const probeFallback = parseProbeOutput(logBuffer);
			post({ type: 'PROBE_DETAILS_RESULT', result: toDetailedProbeFromQuickProbe(probeFallback) });
			post({ type: 'LOG', message: '[ffmpeg] Detailed probe used compatibility log parser fallback.' });
			return;
		} catch (err) {
			post({
				type: 'LOG',
				message: `[ffmpeg] Detailed probe compatibility log parser fallback failed: ${err instanceof Error ? err.message : String(err)}`,
			});
		} finally {
			collectLogs = false;
			logBuffer = [];
			probeLogCharCount = 0;
		}

		try {
			const quick = await quickProbeByContainerHeader(msg.file);
			if (quick) {
				post({ type: 'PROBE_DETAILS_RESULT', result: toDetailedProbeFromQuickProbe(quick) });
				post({ type: 'LOG', message: '[ffmpeg] Detailed probe used quick header parser fallback.' });
				return;
			}
		} catch (err) {
			post({
				type: 'LOG',
				message: `[ffmpeg] Header probe fallback for details failed: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		post({ type: 'PROBE_DETAILS_RESULT', result: { format: {}, streams: [] } });
	} finally {
		await tryDeleteFile(outputName);
		await input.cleanup();
	}
}

async function handleSubtitlePreview(msg: SubtitlePreviewMessage): Promise<void> {
	const input = await writeInputFile(msg.file);
	const asAss = isAssLikeCodec(msg.subtitleCodec);
	const outputName = asAss ? 'subtitle-preview.ass' : 'subtitle-preview.vtt';
	const fallbackName = 'subtitle-preview.vtt';

	const extractWebVttFallback = async (): Promise<string | null> => {
		let code = await ffmpeg.exec([
			'-y',
			'-i',
			input.name,
			'-map',
			`0:${msg.streamIndex}`,
			'-f',
			'webvtt',
			fallbackName,
		]);
		if (code !== 0) {
			await tryDeleteFile(fallbackName);
			return null;
		}
		const fallbackData = await ffmpeg.readFile(fallbackName);
		await ffmpeg.deleteFile(fallbackName);
		return fallbackData instanceof Uint8Array ? new TextDecoder().decode(fallbackData) : String(fallbackData);
	};

	try {
		let exitCode = await ffmpeg.exec([
			'-y',
			'-i',
			input.name,
			'-map',
			`0:${msg.streamIndex}`,
			'-f',
			asAss ? 'ass' : 'webvtt',
			outputName,
		]);

		if (asAss && exitCode !== 0) {
			await tryDeleteFile(outputName);
			const fallbackContent = await extractWebVttFallback();
			if (fallbackContent) {
				post({
					type: 'SUBTITLE_PREVIEW_RESULT',
					requestId: msg.requestId,
					format: 'webvtt',
					content: fallbackContent,
				});
				return;
			}
		}

		if (exitCode !== 0) {
			await tryDeleteFile(outputName);
			throw new Error(`Subtitle preview extraction failed (code ${exitCode})`);
		}

		const data = await ffmpeg.readFile(outputName);
		await ffmpeg.deleteFile(outputName);
		const content = data instanceof Uint8Array ? new TextDecoder().decode(data) : String(data);
		if (!asAss) {
			post({ type: 'SUBTITLE_PREVIEW_RESULT', requestId: msg.requestId, format: 'webvtt', content });
			return;
		}

		const fallbackWebVtt = assToBasicWebVtt(content);
		post({
			type: 'SUBTITLE_PREVIEW_RESULT',
			requestId: msg.requestId,
			format: 'ass',
			content,
			fallbackWebVtt: fallbackWebVtt ?? undefined,
		});
	} finally {
		await input.cleanup();
		await tryDeleteFile(outputName);
		await tryDeleteFile(fallbackName);
	}
}

async function handleExtractFonts(msg: ExtractFontsMessage): Promise<void> {
	const input = await writeInputFile(msg.file);
	try {
		const dumpArgs: string[] = [];
		const outputNames: string[] = [];
		for (let i = 0; i < msg.attachments.length; i++) {
			const att = msg.attachments[i]!;
			const ext = att.filename.includes('.') ? att.filename.slice(att.filename.lastIndexOf('.')) : '.ttf';
			const outName = `font${i}${ext}`;
			dumpArgs.push(`-dump_attachment:t:${att.index}`, outName);
			outputNames.push(outName);
		}
		await ffmpeg.exec([...dumpArgs, '-i', input.name]);

		const fontResults = await Promise.all(
			outputNames.map(async (outputName, i) => {
				try {
					const data = await ffmpeg.readFile(outputName);
					const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
					return { name: msg.attachments[i]!.filename, data: bytes };
				} catch {
					return null;
				} finally {
					await tryDeleteFile(outputName);
				}
			}),
		);

		const fonts = fontResults.filter((entry): entry is { name: string; data: Uint8Array } => entry !== null);
		const transferables: Transferable[] = fonts
			.map((f) => f.data.buffer)
			.filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
		self.postMessage({ type: 'FONTS_RESULT', fonts } satisfies FontsResultPayload, { transfer: transferables });
	} finally {
		await input.cleanup();
	}
}

async function handleRemuxAudio(msg: RemuxAudioMessage): Promise<void> {
	const input = await writeInputFile(msg.file);
	const outputName = 'remux-preview.mp4';
	try {
		const exitCode = await ffmpeg.exec([
			'-y',
			'-i',
			input.name,
			'-c:v',
			'copy',
			'-c:a',
			'aac',
			'-sn',
			outputName,
		]);
		if (exitCode !== 0) throw new Error(`Audio remux failed (code ${exitCode})`);
		const result = await readAndCleanup(outputName);
		post({ type: 'REMUX_AUDIO_DONE', data: result });
	} finally {
		await input.cleanup();
		await tryDeleteFile(outputName);
	}
}

// ── Command Queue ──

let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): void {
	queue = queue.then(task, task);
}

enqueue(async () => {
	await ensureLoaded();
});

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
				case 'PROBE_DETAILS':
					await handleProbeDetails(e.data);
					break;
				case 'SUBTITLE_PREVIEW':
					await handleSubtitlePreview(e.data);
					break;
				case 'EXTRACT_FONTS':
					await handleExtractFonts(e.data);
					break;
				case 'REMUX_AUDIO':
					await handleRemuxAudio(e.data);
					break;
				default:
					post({ type: 'ERROR', error: `Unknown message type: ${(e.data as { type?: string }).type}` });
			}
		} catch (err) {
			post({ type: 'ERROR', error: err instanceof Error ? err.message : String(err) });
		}
	});
};
