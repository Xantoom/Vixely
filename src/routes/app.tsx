import { createFileRoute } from "@tanstack/react-router";
import { Spinner } from "~/ui/primitives/spinner.tsx";

/**
 * The SPA shell.
 *
 * Caddy rewrites any unmatched request to the HTML built from this route, and
 * the client router then resolves the real path. It carries `noindex` because
 * it is a frame, not a page: the marketing routes are prerendered separately
 * and are what search engines and AI crawlers should find.
 */
export const Route = createFileRoute("/app")({
	component: Shell,
	head: () => ({
		meta: [{ name: "robots", content: "noindex" }, { title: "Vixely" }],
	}),
});

function Shell() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[var(--bg)]">
			<Spinner label="Loading" size={28} />
		</div>
	);
}
