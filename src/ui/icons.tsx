import {
	AudioLines,
	Captions,
	Crop,
	Download,
	Gauge,
	Image,
	Info,
	Layers,
	ListVideo,
	type LucideIcon,
	type LucideProps,
	Scissors,
	SlidersHorizontal,
	Timer,
	Video,
	Volume2,
	Proportions,
	Smile,
	Type,
} from 'lucide-react';
import type { MediaKind, ToolId } from '@/editors/registry';

/** Lucide has no GIF icon: a frame strip with a play mark, drawn on the same 24px grid. */
function GifIcon({ size = 24, strokeWidth = 2, ...props }: LucideProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M7 3v4M12 3v4M17 3v4" />
			<rect x="3" y="7" width="18" height="14" rx="2" />
			<path d="m10 11 5 3-5 3z" fill="currentColor" />
		</svg>
	);
}

export const MEDIA_ICONS: Record<MediaKind | 'batch', LucideIcon | typeof GifIcon> = {
	video: Video,
	image: Image,
	gif: GifIcon,
	audio: AudioLines,
	subtitles: Captions,
	batch: Layers,
};

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
	info: Info,
	trim: Scissors,
	crop: Crop,
	adjust: SlidersHorizontal,
	presets: Proportions,
	text: Type,
	stickers: Smile,
	volume: Volume2,
	audio: AudioLines,
	subtitles: Captions,
	speed: Gauge,
	lines: ListVideo,
	timing: Timer,
	export: Download,
};
