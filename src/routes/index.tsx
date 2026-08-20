import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "~/ui/app-shell.tsx";
import { EDITORS } from "~/ui/editor-catalog.ts";
import { Logo } from "~/ui/logo.tsx";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export const Route = createFileRoute("/")({
	component: Home,
	head: () => ({
		meta: [
			{ title: "Vixely — Edit media in your browser. Nothing is uploaded." },
			{
				name: "description",
				content:
					"Convert, crop, filter and re-encode images, video, GIFs, audio and subtitles entirely client-side. No upload, no account, no server.",
			},
		],
	}),
});

function Home() {
	const t = useTranslate();

	return (
		<AppShell>
			<section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16 sm:py-24">
				<div className="flex flex-col gap-5">
					<Logo size={40} className="text-[var(--accent)]" title={t("app.name")} />
					<h1 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-[2.5rem]">
						{t("home.hero.title")}
					</h1>
					<p className="max-w-2xl text-md text-[var(--text-muted)]">{t("home.hero.body")}</p>
				</div>

				<nav aria-label={t("nav.tools")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{EDITORS.map((editor) => (
						<Link
							key={editor.id}
							to={editor.path}
							data-editor={editor.id}
							className="group flex flex-col gap-2 rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--bg-raised)] p-4 outline-none transition-[border-color,transform] duration-[var(--duration-micro)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
						>
							<span className="flex items-center gap-2">
								<span aria-hidden className="size-2 rounded-full bg-[var(--accent)]" />
								<span className="text-md font-medium">{t(editor.nameKey)}</span>
							</span>
							<span className="text-sm text-[var(--text-muted)]">{t(editor.descriptionKey)}</span>
							<span className="mt-1 flex flex-wrap gap-1">
								{editor.formats.slice(0, 5).map((format) => (
									<span
										key={format}
										className="tabular rounded-[var(--radius-control)] bg-[var(--bg)] px-1.5 py-0.5 text-2xs text-[var(--text-subtle)]"
									>
										{format}
									</span>
								))}
							</span>
						</Link>
					))}
				</nav>

				<section className="flex flex-col gap-2 rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--bg-sunken)] p-5">
					<h2 className="text-lg font-medium">{t("home.privacy.title")}</h2>
					<p className="max-w-2xl text-sm text-[var(--text-muted)]">{t("home.privacy.body")}</p>
				</section>
			</section>

			<footer className="mt-auto border-t border-[var(--border)] px-6 py-4 text-xs text-[var(--text-muted)]">
				{t("footer.privacy")}
			</footer>
		</AppShell>
	);
}
