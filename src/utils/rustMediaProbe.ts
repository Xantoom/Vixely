import type { ProbeResultData } from '@/workers/ffmpeg-worker.ts';

const RUST_PROBE_MAX_READ_BYTES = 8 * 1024 * 1024;

type RustProbeWasmModule = { default: () => Promise<unknown>; parse_media_header_json: (data: Uint8Array) => string };

let rustProbeModulePromise: Promise<RustProbeWasmModule | null> | null = null;

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRustProbeWasmModule(value: unknown): value is RustProbeWasmModule {
	if (!isRecord(value)) return false;
	return typeof value.default === 'function' && typeof value.parse_media_header_json === 'function';
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
		const n = toFiniteNumber(v);
		if (n != null) record[k] = n;
	}
	return Object.keys(record).length > 0 ? record : undefined;
}

function normalizeRustProbe(raw: unknown): ProbeResultData | null {
	if (!isRecord(raw)) return null;
	const obj = raw;
	const streamValues = Array.isArray(obj.streams) ? obj.streams : [];
	const streams: ProbeResultData['streams'] = [];
	for (const value of streamValues) {
		if (!isRecord(value)) continue;
		const stream = value;
		const type = stream.type;
		if (type !== 'video' && type !== 'audio' && type !== 'subtitle') continue;
		const tags = toStringRecord(stream.tags);
		const disposition = toNumberRecord(stream.disposition);
		streams.push({
			index: Math.max(0, Math.trunc(toFiniteNumber(stream.index) ?? streams.length)),
			type,
			codec: typeof stream.codec === 'string' && stream.codec ? stream.codec : 'unknown',
			width: toFiniteNumber(stream.width),
			height: toFiniteNumber(stream.height),
			fps: toFiniteNumber(stream.fps),
			sampleRate: toFiniteNumber(stream.sampleRate),
			channels: toFiniteNumber(stream.channels),
			language: typeof stream.language === 'string' && stream.language ? stream.language : undefined,
			title:
				typeof stream.title === 'string' && stream.title
					? stream.title
					: typeof tags?.title === 'string'
						? tags.title
						: undefined,
			bitrate: toFiniteNumber(stream.bitrate),
			isDefault: typeof stream.isDefault === 'boolean' ? stream.isDefault : undefined,
			isForced: typeof stream.isForced === 'boolean' ? stream.isForced : undefined,
			tags,
			disposition,
		});
	}
	if (streams.length === 0) return null;

	const attachmentValues = Array.isArray(obj.fontAttachments) ? obj.fontAttachments : [];
	const fontAttachments: ProbeResultData['fontAttachments'] = [];
	for (const value of attachmentValues) {
		if (!isRecord(value)) continue;
		const attachment = value;
		const filename = typeof attachment.filename === 'string' ? attachment.filename.trim() : '';
		if (!filename) continue;
		fontAttachments.push({
			index: Math.max(0, Math.trunc(toFiniteNumber(attachment.index) ?? fontAttachments.length)),
			filename,
		});
	}

	return {
		duration: toFiniteNumber(obj.duration) ?? 0,
		bitrate: Math.max(0, Math.round(toFiniteNumber(obj.bitrate) ?? 0)),
		format: typeof obj.format === 'string' ? obj.format : '',
		streams,
		fontAttachments,
	};
}

async function loadRustProbeModule(): Promise<RustProbeWasmModule | null> {
	if (!rustProbeModulePromise) {
		rustProbeModulePromise = import('../../wasm/vixely_core.js')
			.then(async (mod) => {
				if (!isRustProbeWasmModule(mod)) return null;
				await mod.default();
				return mod;
			})
			.catch(() => null);
	}
	return rustProbeModulePromise;
}

export async function probeMediaHeaderWithRust(file: File): Promise<ProbeResultData | null> {
	const module = await loadRustProbeModule();
	if (!module) return null;

	const readSize = Math.min(file.size, RUST_PROBE_MAX_READ_BYTES);
	if (readSize <= 0) return null;
	const bytes = new Uint8Array(await file.slice(0, readSize).arrayBuffer());

	let jsonText = '';
	try {
		jsonText = module.parse_media_header_json(bytes);
	} catch {
		return null;
	}
	if (!jsonText || jsonText === '{}') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return null;
	}

	return normalizeRustProbe(parsed);
}
