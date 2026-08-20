import { createFileRoute } from "@tanstack/react-router";
import { VideoEditor } from "~/editors/video/video-editor.tsx";

export const Route = createFileRoute("/tools/video")({
	component: VideoEditor,
	// Editors are client-only: they touch WebCodecs, WebGL and workers.
	ssr: false,
});
