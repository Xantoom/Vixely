import type { AnyDocument } from "./types.ts";

export class DocumentSerializationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DocumentSerializationError";
	}
}

const DOCUMENT_KINDS = new Set(["image", "gif", "audio", "subtitles", "video"]);

/**
 * Walks a value and rejects anything JSON cannot represent losslessly (D4).
 * Runs in development and in tests; production paths call `stringify` directly.
 */
export function assertSerializable(value: unknown, path = "$"): void {
	if (value === null) return;

	const type = typeof value;
	if (type === "string" || type === "boolean") return;
	if (type === "number") {
		if (!Number.isFinite(value as number)) {
			throw new DocumentSerializationError(`${path}: non-finite number`);
		}
		return;
	}
	if (type === "undefined") {
		throw new DocumentSerializationError(`${path}: undefined is not serializable`);
	}
	if (type === "function" || type === "symbol" || type === "bigint") {
		throw new DocumentSerializationError(`${path}: ${type} is not serializable`);
	}

	if (Array.isArray(value)) {
		value.forEach((item, index) => assertSerializable(item, `${path}[${index}]`));
		return;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		const name = (value as object).constructor?.name ?? "unknown";
		throw new DocumentSerializationError(`${path}: ${name} instances are not serializable`);
	}

	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		assertSerializable(item, `${path}.${key}`);
	}
}

export function stringifyDocument(document: AnyDocument): string {
	return JSON.stringify(document);
}

export function parseDocument(json: string): AnyDocument {
	const parsed: unknown = JSON.parse(json);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new DocumentSerializationError("document root must be an object");
	}
	const kind = (parsed as { kind?: unknown }).kind;
	if (typeof kind !== "string" || !DOCUMENT_KINDS.has(kind)) {
		throw new DocumentSerializationError(`unknown document kind: ${String(kind)}`);
	}
	return parsed as AnyDocument;
}

/** Structural equality for documents, used by history merging and by tests. */
export function documentsEqual(a: AnyDocument, b: AnyDocument): boolean {
	return stringifyDocument(a) === stringifyDocument(b);
}
