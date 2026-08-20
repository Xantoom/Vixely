/**
 * Content-Security-Policy for the built output.
 *
 * The application ships inline scripts — the theme bootstrap that avoids a
 * flash of the wrong theme, plus TanStack's hydration snippets — and one of
 * them carries per-request state, so its content changes between loads. A
 * hash therefore cannot authorise it, and `'unsafe-inline'` would give away
 * most of what the policy is for.
 *
 * So the build stamps a nonce placeholder onto every inline script, the server
 * substitutes a fresh value per request, and the policy names that same value.
 * Caddy does the substitution with its `templates` directive; the static
 * server used by the e2e suite does the same thing, so what is tested is what
 * is deployed.
 */
import { readdir } from "node:fs/promises";

/**
 * The two ways Caddy names the same per-request value.
 *
 * `templates` evaluates Go template syntax inside the response body, while the
 * `header` directive expands Caddy placeholders in braces — the template form
 * is *not* evaluated in a header, which produces an empty nonce and a policy
 * that blocks everything. Both refer to `http.request.uuid`, so the header and
 * the body always agree.
 *
 * Backticks in the template form because it sits inside a double-quoted
 * Caddyfile value, where a nested double quote would end the string.
 */
export const NONCE_TEMPLATE = "{{placeholder `http.request.uuid`}}";
export const NONCE_HEADER_PLACEHOLDER = "{http.request.uuid}";

export const CSP_DIRECTIVES = [
	"default-src 'self'",
	"script-src 'self' 'wasm-unsafe-eval' 'nonce-{nonce}'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"media-src 'self' blob:",
	"font-src 'self'",
	"worker-src 'self' blob:",
	"connect-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
	"upgrade-insecure-requests",
] as const;

export function buildCsp(nonceExpression: string): string {
	return CSP_DIRECTIVES.map((directive) => directive.replace("{nonce}", nonceExpression)).join(
		"; ",
	);
}

const INLINE_SCRIPT_OPEN = /<script(?![^>]*\ssrc=)(?![^>]*\snonce=)([^>]*)>/gu;

/** Adds the placeholder to every inline script tag that lacks one. */
export function stampNonces(html: string): string {
	return html.replaceAll(
		INLINE_SCRIPT_OPEN,
		(_match, attributes: string) => `<script nonce="${NONCE_TEMPLATE}"${attributes}>`,
	);
}

export function countStamped(html: string): number {
	return [...html.matchAll(new RegExp(`nonce="${escapeRegex(NONCE_TEMPLATE)}"`, "gu"))].length;
}

function escapeRegex(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

if (import.meta.main) {
	const clientDir = new URL("../dist/client/", import.meta.url);
	const entries = await readdir(clientDir, { withFileTypes: true });
	let stamped = 0;
	let files = 0;

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
		const path = new URL(entry.name, clientDir);
		const html = await Bun.file(path).text();
		const next = stampNonces(html);
		if (next !== html) {
			await Bun.write(path, next);
			files += 1;
		}
		stamped += countStamped(next);
	}

	// Caddy substitutes the placeholder in both the body and the header, so the
	// two always agree on the value.
	await Bun.write(
		new URL("csp.caddy", clientDir),
		`Content-Security-Policy "${buildCsp(NONCE_HEADER_PLACEHOLDER)}"\n`,
	);

	console.log(`stamped ${stamped} inline scripts across ${files} HTML files`);
}
