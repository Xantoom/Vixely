import { ImageIcon, Palette, Scissors, ShieldCheck, Video, Zap } from 'lucide-react';

/* SEO landing data for the GIF editor. */

export const GIF_LANDING_FEATURES = [
	{
		icon: Zap,
		title: 'Optimize & Compress',
		description:
			'Reduce GIF file size dramatically while preserving visual quality. Perfect for sharing on Discord and social media.',
	},
	{
		icon: Scissors,
		title: 'Trim & Cut',
		description: 'Remove unwanted frames, trim start and end points, and keep only the best parts of your GIF.',
	},
	{
		icon: Palette,
		title: 'Colors & Filters',
		description: 'Adjust brightness, contrast, saturation, and apply creative filters with real-time preview.',
	},
	{
		icon: ShieldCheck,
		title: 'Privacy First',
		description:
			'Your GIFs never leave your device. All processing runs locally in your browser using native WebCodecs, WebGL2 and the Mediabunny library.',
	},
] as const;

export const GIF_LANDING_FORMATS = ['GIF', 'APNG', 'WebP (animated)', 'MP4 (to GIF)'] as const;

export const GIF_LANDING_FAQS = [
	{
		question: 'How do I reduce GIF file size?',
		answer: 'Use the Optimize panel to reduce colors, resize dimensions, adjust frame rate, and apply lossy compression. Vixely can often reduce GIF file sizes by 50-80% while maintaining good visual quality.',
	},
	{
		question: 'Can I trim a GIF?',
		answer: 'Yes. Use the timeline to set trim start and end points, then export to keep only the frames you want. You can also convert a video clip to GIF with custom timing.',
	},
	{
		question: 'What GIF formats are supported?',
		answer: 'Vixely supports GIF, APNG, and animated WebP. You can also convert video files (MP4, WebM, etc.) to GIF format with full control over quality and frame rate.',
	},
	{
		question: 'Is my GIF uploaded to a server?',
		answer: 'No. All GIF processing happens entirely in your browser using native WebCodecs, WebGL2 and the Mediabunny library. Your files never leave your device — completely private.',
	},
] as const;

export const GIF_CROSS_LINKS = [
	{
		title: 'Video Editor',
		subtitle: 'Trim, resize & export videos',
		href: '/tools/video' as const,
		icon: Video,
		accentBg: 'bg-blue-500/10',
		accentText: 'text-blue-400',
		borderTop: 'border-t-blue-500',
	},
	{
		title: 'Image Editor',
		subtitle: 'Crop, adjust & export images',
		href: '/tools/image' as const,
		icon: ImageIcon,
		accentBg: 'bg-amber-500/10',
		accentText: 'text-amber-400',
		borderTop: 'border-t-amber-500',
	},
] as const;
