import { createFileRoute } from "@tanstack/react-router";
import { ImageEditor } from "~/editors/image/image-editor.tsx";

export const Route = createFileRoute("/tools/image")({
	component: ImageEditor,
	// Editors are client-only: they touch WebCodecs, WebGL and workers.
	ssr: false,
});
