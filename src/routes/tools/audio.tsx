import { createFileRoute } from "@tanstack/react-router";
import { AudioEditor } from "~/editors/audio/audio-editor.tsx";

export const Route = createFileRoute("/tools/audio")({
	component: AudioEditor,
	// Editors are client-only: they touch WebCodecs, WebGL and workers.
	ssr: false,
});
