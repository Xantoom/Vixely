import { createFileRoute } from '@tanstack/react-router';
import { Video, Film, ImageIcon } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/video-to-gif')({ component: VideoToGifLanding });

const FAQS = [
	{
		question: 'What makes a good video-to-GIF conversion?',
		answer: 'Short clips (2–10 s), a target width of 480–720 px and 10–15 fps give the best tradeoff between size and smoothness. Vixely previews the result in real time.',
	},
	{
		question: 'Why are my GIFs so large?',
		answer: 'GIF is an inefficient format — a 10-second HD GIF can exceed 10 MB. Consider animated WebP or MP4 if your target platform supports them. Vixely exports all three.',
	},
	{
		question: 'Can I choose which frames to include?',
		answer: 'Yes. Use the trim timeline to bound the source, then fine-tune framerate and dimensions before export.',
	},
	{
		question: 'Does Vixely add a watermark?',
		answer: 'Never. Vixely is free and private — no watermarks, no logo, no sign-up required.',
	},
];

const BULLETS = [
	{
		title: 'Preview before export',
		description: 'See the exact GIF frame-by-frame before committing. Tweak fps, width and trim on the fly.',
	},
	{
		title: 'Size-aware encoding',
		description: 'Vixely shows the estimated file size so you can hit platform limits without guesswork.',
	},
	{
		title: 'Also exports MP4 and WebP',
		description: 'Modern platforms accept animated WebP and MP4 — often 10× smaller than the equivalent GIF.',
	},
	{
		title: 'No upload',
		description: 'Your source clip stays on your machine. Conversion runs entirely through WebAssembly.',
	},
];

function VideoToGifLanding() {
	return (
		<>
			<Seo
				title="Video to GIF Converter Online Free"
				description="Convert video to GIF online for free. Trim, resize, set framerate and export animated GIF, APNG or animated WebP directly in your browser. No upload, no watermark."
				path="/tools/video-to-gif"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Video to GIF Converter',
						'Convert videos to animated GIF, APNG or WebP directly in your browser.',
						'https://vixely.app/tools/video-to-gif',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="blue"
				icon={Video}
				heading="Convert Video to GIF — Free, Instant, No Upload"
				tagline="Turn any video clip into an animated GIF, APNG or WebP. Real-time preview, frame-accurate trim, full control over size and framerate."
				ctaLabel="Open the converter"
				ctaHref="/tools/video"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'Video Editor', subtitle: 'Trim & color-correct', href: '/tools/video', icon: Video },
					{ title: 'GIF to MP4', subtitle: 'The reverse conversion', href: '/tools/gif', icon: Film },
					{ title: 'Image Editor', subtitle: 'Edit a single frame', href: '/tools/image', icon: ImageIcon },
				]}
			/>
		</>
	);
}
