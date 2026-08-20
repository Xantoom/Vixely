import { AppShell } from "~/ui/app-shell.tsx";
import { EnvironmentNotice } from "../shared/environment-notice.tsx";
import { useEnvironment } from "../shared/use-environment.ts";
import { useTranslate } from "~/ui/hooks/use-translate.ts";
import { DropZone } from "../shared/drop-zone.tsx";

const ACCEPTED = [".mp4", ".mkv", ".webm", ".mov", ".m4v", ".ts", ".avi"] as const;

export function VideoEditor() {
	const t = useTranslate();
	const environment = useEnvironment();

	return (
		<AppShell editor="video">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
				<div className="flex flex-col gap-1">
					<h1 className="text-xl font-semibold">{t("editor.video")}</h1>
					<p className="text-sm text-[var(--text-muted)]">{t("editor.video.description")}</p>
				</div>

				<EnvironmentNotice limitations={environment.limitations} />

				<DropZone accept={ACCEPTED} onFile={() => undefined} />
			</div>
		</AppShell>
	);
}
