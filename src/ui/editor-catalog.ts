import type { EditorAccent } from "./theme/palette.ts";

/** Keys are narrowed to the variable-free subset so `t` needs no arguments. */
type EditorNameKey = `editor.${EditorAccent}`;
type EditorDescriptionKey = `editor.${EditorAccent}.description`;

export type EditorEntry = {
	readonly id: EditorAccent;
	readonly path: string;
	readonly nameKey: EditorNameKey;
	readonly descriptionKey: EditorDescriptionKey;
	readonly formats: readonly string[];
};

/** Single source for navigation, the home page and the sitemap. */
export const EDITORS: readonly EditorEntry[] = [
	{
		id: "image",
		path: "/tools/image",
		nameKey: "editor.image",
		descriptionKey: "editor.image.description",
		formats: ["PNG", "JPEG", "WebP", "AVIF", "GIF", "BMP", "SVG", "ICO"],
	},
	{
		id: "video",
		path: "/tools/video",
		nameKey: "editor.video",
		descriptionKey: "editor.video.description",
		formats: ["MP4", "MKV", "WebM", "MOV", "H.264", "HEVC", "VP9", "AV1", "ProRes"],
	},
	{
		id: "gif",
		path: "/tools/gif",
		nameKey: "editor.gif",
		descriptionKey: "editor.gif.description",
		formats: ["GIF", "WebP", "APNG", "MP4", "WebM"],
	},
	{
		id: "audio",
		path: "/tools/audio",
		nameKey: "editor.audio",
		descriptionKey: "editor.audio.description",
		formats: ["MP3", "AAC", "FLAC", "Opus", "Vorbis", "AC-3", "DTS", "WAV"],
	},
	{
		id: "subtitles",
		path: "/tools/subtitles",
		nameKey: "editor.subtitles",
		descriptionKey: "editor.subtitles.description",
		formats: ["SRT", "WebVTT", "ASS/SSA", "PGS"],
	},
];
