import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./logo.tsx";
import { cn } from "./cn.ts";
import { useTranslate } from "./hooks/use-translate.ts";
import { LanguageMenu, ThemeMenu } from "./preferences-controls.tsx";

export type AppShellProps = {
	children: ReactNode;
	/** Sets `data-editor`, which is what recolours `--accent`. */
	editor?: "image" | "video" | "gif" | "audio" | "subtitles";
	toolbar?: ReactNode;
	className?: string;
};

export function AppShell({ children, editor, toolbar, className }: AppShellProps) {
	const t = useTranslate();

	return (
		<div
			data-editor={editor}
			className={cn("flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--text)]", className)}
		>
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-[var(--bg-overlay)] focus:px-3 focus:py-2"
			>
				{t("nav.skipToContent")}
			</a>

			<header className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-3">
				<Link
					to="/"
					className="flex items-center gap-2 text-[var(--text)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
				>
					<Logo
						size={20}
						className={editor === undefined ? "text-[var(--accent)]" : "text-[var(--accent)]"}
					/>
					<span className="text-sm font-semibold tracking-tight">{t("app.name")}</span>
				</Link>

				<div className="flex-1">{toolbar}</div>

				<ThemeMenu />
				<LanguageMenu />
			</header>

			<main id="main" className="flex flex-1 flex-col">
				{children}
			</main>
		</div>
	);
}
