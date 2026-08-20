import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { en } from "~/i18n/locales/en.ts";
import { THEME_BOOTSTRAP_SRC, usePreferences } from "~/stores/preferences.ts";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
			{ title: `${en["app.name"]} — ${en["app.tagline"]}` },
			{ name: "description", content: en["app.description"] },
			{ name: "theme-color", content: "#24273a", media: "(prefers-color-scheme: dark)" },
			{ name: "theme-color", content: "#eff1f5", media: "(prefers-color-scheme: light)" },
			{ property: "og:title", content: en["app.name"] },
			{ property: "og:description", content: en["app.description"] },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://vixely.app" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			// Preloaded because the interface is text-dense: a font swap mid-load
			// reflows every panel.
			{
				rel: "preload",
				href: "/fonts/inter-latin.woff2",
				as: "font",
				type: "font/woff2",
				crossOrigin: "anonymous",
			},
			{ rel: "canonical", href: "https://vixely.app" },
		],
		// Loaded from a file, not inlined: React re-creates head scripts on
		// hydration and a re-created inline script loses its nonce.
		scripts: [{ src: THEME_BOOTSTRAP_SRC }],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<Preferences />
				{children}
				<Scripts />
			</body>
		</html>
	);
}

/** Reads the OS locale once on mount; the theme is already set by the head script. */
function Preferences() {
	const initialise = usePreferences((state) => state.initialise);
	useEffect(() => {
		void initialise();
	}, [initialise]);
	return null;
}

export { Outlet };
