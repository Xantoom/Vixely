import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";
import { Spinner } from "./ui/primitives/spinner.tsx";

/**
 * The export must be named `getRouter` — the Start v1 API looks it up by that
 * name and fails with an unhelpful message otherwise.
 */
export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		defaultPendingComponent: () => (
			<div className="flex min-h-dvh items-center justify-center">
				<Spinner label="Loading" size={28} />
			</div>
		),
		defaultNotFoundComponent: () => (
			<div className="flex min-h-dvh flex-col items-center justify-center gap-2">
				<p className="text-lg font-medium">404</p>
				<a href="/" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
					Vixely
				</a>
			</div>
		),
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
