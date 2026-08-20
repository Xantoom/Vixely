import { createFileRoute } from "@tanstack/react-router";
import { GifEditor } from "~/editors/gif/gif-editor.tsx";

export const Route = createFileRoute("/tools/gif")({
	component: GifEditor,
	// Editors are client-only: they touch WebCodecs, WebGL and workers.
	ssr: false,
});
