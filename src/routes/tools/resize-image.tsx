import { createFileRoute } from '@tanstack/react-router';
import { ImageIcon, Video, Film } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/resize-image')({ component: ResizeImageLanding });

const FAQS = [
	{
		question: 'Which interpolation method does Vixely use?',
		answer: 'Vixely uses high-quality bicubic/Lanczos resampling through the browser canvas APIs. All resizing happens on your device.',
	},
	{
		question: 'Can I resize while preserving the aspect ratio?',
		answer: 'Yes. Lock the aspect ratio and set either width or height — the other dimension is computed automatically.',
	},
	{
		question: 'Does resizing lose quality?',
		answer: 'Down-sampling is lossless in the interpolation step but lossy if you re-encode to JPEG. Use PNG or WebP for cleaner results.',
	},
	{
		question: 'Which formats are supported?',
		answer: 'PNG, JPG, WebP, AVIF, BMP, TIFF and ICO for both import and export.',
	},
];

const BULLETS = [
	{
		title: 'Any dimensions',
		description: 'Resize to pixel-precise width/height, percentage, or one of the built-in platform presets.',
	},
	{ title: 'Lock aspect ratio', description: 'One toggle — Vixely keeps the proportions correct as you resize.' },
	{
		title: 'Modern formats',
		description: 'Export to PNG, JPG, WebP or AVIF. WebP and AVIF shrink file size dramatically.',
	},
	{ title: 'No upload', description: 'Your photo stays private. Everything is processed in-browser.' },
];

function ResizeImageLanding() {
	return (
		<>
			<Seo
				title="Resize Image Online Free — PNG, JPG, WebP"
				description="Resize images online for free — PNG, JPG, WebP, AVIF. Preserve aspect ratio, apply high-quality downsampling and export directly in your browser. No upload required."
				path="/tools/resize-image"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Image Resizer',
						'Resize PNG, JPG, WebP and AVIF images directly in your browser with no upload.',
						'https://vixely.app/tools/resize-image',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="amber"
				icon={ImageIcon}
				heading="Resize Image Online — Free & Private"
				tagline="Scale PNG, JPG, WebP and AVIF photos to any dimensions without uploading them. Keep the aspect ratio, apply quality downsampling, export in the format you need."
				ctaLabel="Open the image editor"
				ctaHref="/tools/image"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'Image Editor', subtitle: 'Crop & color-correct', href: '/tools/image', icon: ImageIcon },
					{ title: 'Video Editor', subtitle: 'Resize & trim video', href: '/tools/video', icon: Video },
					{ title: 'GIF Editor', subtitle: 'Resize animations', href: '/tools/gif', icon: Film },
				]}
			/>
		</>
	);
}
