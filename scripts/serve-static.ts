/**
 * Serves the built output the way the production image does.
 *
 * The e2e suite runs against this rather than `vite preview`, because the
 * preview server rewrites HTML on the fly — which changes the inline scripts
 * and so their hashes, hiding whether the real policy actually works. This
 * serves the files byte for byte and applies the generated headers, which is
 * exactly what Caddy is configured to do.
 */
import { existsSync } from "node:fs";
import { NONCE_HEADER_PLACEHOLDER, NONCE_TEMPLATE } from "./csp.ts";

const CLIENT_DIR = new URL("../dist/client/", import.meta.url);
const PORT = Number(process.env["PORT"] ?? 4173);

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml",
};

function contentType(path: string): string {
	const extension = path.slice(path.lastIndexOf("."));
	return MIME[extension] ?? "application/octet-stream";
}

async function readCsp(): Promise<string | null> {
	const snippet = Bun.file(new URL("csp.caddy", CLIENT_DIR));
	if (!(await snippet.exists())) return null;
	const match = /Content-Security-Policy\s+"([^"]+)"/u.exec(await snippet.text());
	return match?.[1] ?? null;
}

const csp = await readCsp();

/**
 * Mirrors both substitutions Caddy makes: the template form in the body and
 * the placeholder form in the header.
 */
function withNonce(text: string, nonce: string): string {
	return text.replaceAll(NONCE_TEMPLATE, nonce).replaceAll(NONCE_HEADER_PLACEHOLDER, nonce);
}

const securityHeaders: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	...(csp === null ? {} : { "Content-Security-Policy": csp }),
};

Bun.serve({
	port: PORT,
	fetch: async (request) => {
		const url = new URL(request.url);
		const candidates = [
			url.pathname.slice(1),
			`${url.pathname.slice(1)}/index.html`,
			`${url.pathname.slice(1)}.html`,
		].filter((candidate) => candidate !== "" && !candidate.includes(".."));

		const nonce = crypto.randomUUID();
		const headersFor = (type: string) => ({
			...securityHeaders,
			...(csp === null ? {} : { "Content-Security-Policy": withNonce(csp, nonce) }),
			"Content-Type": type,
		});

		const serveHtml = async (path: URL) =>
			new Response(withNonce(await Bun.file(path).text(), nonce), {
				headers: headersFor(MIME[".html"] as string),
			});

		for (const candidate of candidates) {
			const path = new URL(candidate, CLIENT_DIR);
			if (!existsSync(path)) continue;
			const file = Bun.file(path);
			if (!(await file.exists())) continue;
			if (candidate.endsWith(".html")) return serveHtml(path);
			return new Response(file, { headers: headersFor(contentType(candidate)) });
		}

		if (url.pathname === "/") return serveHtml(new URL("index.html", CLIENT_DIR));

		// Anything unknown falls through to the SPA shell, as Caddy does.
		return serveHtml(new URL("_shell.html", CLIENT_DIR));
	},
});

console.log(`serving dist/client on http://127.0.0.1:${PORT}${csp === null ? " (no CSP)" : ""}`);
