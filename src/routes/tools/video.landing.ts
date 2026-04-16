import { Film, ImageIcon, MonitorSmartphone, Palette, Scaling, Scissors } from 'lucide-react';

/* SEO landing data for the video editor. Extracted from video.tsx to keep the
 * route file focused on behavior. */

export const VIDEO_LANDING_FEATURES = [
	{
		icon: Scissors,
		title: 'Trim & Cut',
		description:
			'Precisely trim your videos with frame-accurate start and end points. Remove unwanted sections instantly.',
	},
	{
		icon: Scaling,
		title: 'Resize & Crop',
		description: 'Change resolution, crop to any aspect ratio, or fit platform requirements with one click.',
	},
	{
		icon: Palette,
		title: 'Color Correction',
		description: 'Adjust brightness, contrast, saturation, hue, and apply professional color filters in real-time.',
	},
	{
		icon: MonitorSmartphone,
		title: 'Platform Presets',
		description: 'Export with optimized settings for Discord, TikTok, YouTube, Twitter, and more platforms.',
	},
] as const;

export const VIDEO_LANDING_FORMATS = ['MP4', 'WebM', 'MKV', 'AVI', 'MOV', 'FLV', 'WMV', 'OGV', 'M4V', 'MTS'] as const;

export const VIDEO_LANDING_FAQS = [
	{
		question: 'Can I trim videos without re-encoding?',
		answer: 'Yes. Vixely supports stream-copy mode which trims your video without re-encoding, preserving original quality and completing almost instantly.',
	},
	{
		question: 'What video formats are supported?',
		answer: 'Vixely supports all major video formats including MP4, WebM, MKV, AVI, MOV, FLV, WMV, OGV, M4V, and MTS. You can also export to any of these formats.',
	},
	{
		question: 'Is my video uploaded to a server?',
		answer: 'No. All video processing happens entirely in your browser using native WebCodecs, WebGL2 and the Mediabunny library. Your files never leave your device — zero uploads, zero server access.',
	},
	{
		question: 'Can I export for Discord or TikTok?',
		answer: 'Yes. Vixely includes built-in presets for Discord (8MB/50MB limits), TikTok, YouTube, Twitter, and other platforms with the correct codec, resolution, and bitrate settings.',
	},
] as const;

export const VIDEO_CROSS_LINKS = [
	{
		title: 'Image Editor',
		subtitle: 'Crop, adjust & export images',
		href: '/tools/image' as const,
		icon: ImageIcon,
		accentBg: 'bg-amber-500/10',
		accentText: 'text-amber-400',
		borderTop: 'border-t-amber-500',
	},
	{
		title: 'GIF Editor',
		subtitle: 'Optimize, trim & export GIFs',
		href: '/tools/gif' as const,
		icon: Film,
		accentBg: 'bg-emerald-500/10',
		accentText: 'text-emerald-400',
		borderTop: 'border-t-emerald-500',
	},
] as const;
