import { createFileRoute } from "@tanstack/react-router";
import { SubtitlesEditor } from "~/editors/subtitles/subtitles-editor.tsx";

export const Route = createFileRoute("/tools/subtitles")({
	component: SubtitlesEditor,
	// Editors are client-only: they touch WebCodecs, WebGL and workers.
	ssr: false,
});
