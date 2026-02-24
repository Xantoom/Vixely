const FALLBACK_BASE_NAME = 'vixely';
const FALLBACK_EXTENSION = 'bin';
const ILLEGAL_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const EDGE_DOTS_SPACES_RE = /^[.\s]+|[.\s]+$/g;

function stripControlChars(value: string): string {
	let out = '';
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code >= 0x20 && code !== 0x7f) out += char;
	}
	return out;
}

function sanitizeFilenameSegment(value: string): string {
	const cleaned = stripControlChars(value)
		.trim()
		.replace(ILLEGAL_FILENAME_CHARS_RE, '-')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(EDGE_DOTS_SPACES_RE, '')
		.replace(/^\.+/, '');

	return cleaned || FALLBACK_BASE_NAME;
}

export function getFileBaseName(sourceName: string | null | undefined): string {
	if (!sourceName) return FALLBACK_BASE_NAME;
	const fileName = sourceName.split(/[\\/]/).pop() ?? sourceName;
	const withoutExt = fileName.replace(/\.[^.]+$/u, '');
	return sanitizeFilenameSegment(withoutExt);
}

function normalizeExtension(extension: string | null | undefined): string {
	if (!extension) return FALLBACK_EXTENSION;
	const normalized = extension.trim().toLowerCase().replace(/^\.+/, '');
	return normalized || FALLBACK_EXTENSION;
}

export function buildExportFilename(
	sourceName: string | null | undefined,
	extension: string | null | undefined,
	suffix = 'export',
): string {
	const base = getFileBaseName(sourceName);
	const ext = normalizeExtension(extension);
	const cleanSuffix = sanitizeFilenameSegment(suffix);
	return `${base}-${cleanSuffix}.${ext}`;
}
