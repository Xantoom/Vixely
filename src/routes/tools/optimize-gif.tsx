import { createFileRoute } from '@tanstack/react-router';
import { Film, Video, ImageIcon } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/optimize-gif')({ component: OptimizeGifLanding });

const FAQS = [
	{
		question: 'How does Vixely optimize GIF file size?',
		answer: 'Vixely can reduce dimensions, drop frames, lower the framerate and re-encode with a tuned palette. The preview updates live so you can see the quality/size tradeoff instantly.',
	},
	{
		question: 'Should I convert a GIF to MP4 or WebP instead?',
		answer: 'Yes, whenever the target platform allows. MP4 and animated WebP are typically 5-10× smaller than GIF at the same visual quality.',
	},
	{
		question: 'Can I reduce the color palette?',
		answer: 'Yes. Vixely exposes a color quantization control. Smaller palettes yield smaller files but risk banding on gradients.',
	},
	{
		question: 'Will optimization lose quality?',
		answer: 'Size reduction is a tradeoff with visual fidelity. Vixely shows a live preview so you can find the sweet spot before exporting.',
	},
];

const BULLETS = [
	{
		title: 'Live size estimate',
		description: 'Every change updates the estimated final size so you hit platform limits without guesswork.',
	},
	{
		title: 'Palette control',
		description: 'Quantize to 16/64/128/256 colors. Perfect for UI GIFs where subtle tones don’t matter.',
	},
	{
		title: 'Frame dropping',
		description: 'Halve the framerate or drop individual frames to shrink the file dramatically.',
	},
	{
		title: 'Export to MP4/WebP',
		description: 'Vixely can also export your GIF as MP4 or animated WebP for much smaller files.',
	},
];

function OptimizeGifLanding() {
	return (
		<>
			<Seo
				title="Optimize GIF Online Free — Reduce Size"
				description="Optimize and compress GIF files online for free. Reduce dimensions, framerate and palette size to shrink animated GIFs directly in your browser. No upload required."
				path="/tools/optimize-gif"
				jsonLd={[
					buildWebAppSchema(
						'Vixely GIF Optimizer',
						'Compress and optimize animated GIF files directly in your browser with no upload.',
						'https://vixely.app/tools/optimize-gif',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="emerald"
				icon={Film}
				heading="Optimize GIF Online — Shrink Size, Keep Quality"
				tagline="Reduce GIF file size by dropping frames, lowering framerate, tuning the palette or exporting to MP4/WebP. Everything stays in your browser."
				ctaLabel="Open the GIF optimizer"
				ctaHref="/tools/gif"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'GIF to MP4', subtitle: 'Smaller than GIF', href: '/tools/gif', icon: Film },
					{ title: 'Video to GIF', subtitle: 'Create a GIF', href: '/tools/video', icon: Video },
					{ title: 'Image Editor', subtitle: 'Edit stills', href: '/tools/image', icon: ImageIcon },
				]}
			/>
		</>
	);
}
