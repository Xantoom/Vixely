import { Film, Palette, Scaling, ShieldCheck, Sparkles, Video } from 'lucide-react';

/* SEO landing data for the image editor. */

export const IMAGE_LANDING_FEATURES = [
	{
		icon: Scaling,
		title: 'Crop & Resize',
		description:
			'Resize to exact dimensions or crop to any aspect ratio. Perfect for social media profiles and banners.',
	},
	{
		icon: Palette,
		title: 'Color Adjustment',
		description: 'Fine-tune brightness, contrast, saturation, hue, and temperature with real-time preview.',
	},
	{
		icon: Sparkles,
		title: 'Filters & Effects',
		description: 'Apply professional filters including blur, sharpen, grayscale, sepia, and custom presets.',
	},
	{
		icon: ShieldCheck,
		title: 'Privacy First',
		description:
			'Your images never leave your device. All processing runs locally in your browser using native Canvas, WebGL2 and the Mediabunny library.',
	},
] as const;

export const IMAGE_LANDING_FORMATS = ['PNG', 'JPG', 'WebP', 'AVIF', 'BMP', 'TIFF', 'ICO'] as const;

export const IMAGE_LANDING_FAQS = [
	{
		question: 'Can I resize images for social media?',
		answer: 'Yes. You can resize images to exact pixel dimensions or use preset aspect ratios optimized for platforms like Instagram, Twitter, Facebook, and Discord.',
	},
	{
		question: 'What image formats are supported?',
		answer: 'Vixely supports PNG, JPG/JPEG, WebP, AVIF, BMP, TIFF, and ICO. You can import any of these formats and export to any other.',
	},
	{
		question: 'Is my image uploaded to a server?',
		answer: 'No. All image processing happens entirely in your browser using native Canvas 2D, WebGL2 shaders and the Mediabunny library. Your files never leave your device — completely private.',
	},
	{
		question: 'Can I convert between image formats?',
		answer: 'Yes. Import any supported format and export to a different one. For example, convert PNG to WebP for smaller file sizes or JPG to PNG for transparency support.',
	},
] as const;

export const IMAGE_CROSS_LINKS = [
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
		title: 'GIF Editor',
		subtitle: 'Optimize, trim & export GIFs',
		href: '/tools/gif' as const,
		icon: Film,
		accentBg: 'bg-emerald-500/10',
		accentText: 'text-emerald-400',
		borderTop: 'border-t-emerald-500',
	},
] as const;
