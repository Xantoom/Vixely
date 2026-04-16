import { createFileRoute } from '@tanstack/react-router';
import { Film, Video, ImageIcon } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/gif-to-mp4')({ component: GifToMp4Landing });

const FAQS = [
	{
		question: 'Why convert a GIF to MP4?',
		answer: 'MP4 files are typically 5-10× smaller than the equivalent GIF at the same quality, load faster and support hardware decoding on every device.',
	},
	{
		question: 'Can I convert to WebM or animated WebP instead?',
		answer: 'Yes. Vixely exports MP4 (H.264), WebM (VP9) and animated WebP. Pick the format that matches your target platform.',
	},
	{
		question: 'Does the conversion preserve transparency?',
		answer: 'MP4 does not support transparency. If your GIF has transparent regions, export as animated WebP or a transparent APNG instead.',
	},
	{
		question: 'Will the MP4 autoplay on social media?',
		answer: 'Yes on most platforms (Twitter, Discord, Reddit). Vixely exports MP4 with the faststart flag and web-friendly defaults.',
	},
];

const BULLETS = [
	{
		title: '5-10× smaller files',
		description:
			'MP4 replaces GIF for the same visual result at a fraction of the size — faster to load, friendlier to mobile.',
	},
	{
		title: 'H.264, VP9 or AV1',
		description: 'Choose the codec that fits your platform. MP4 (H.264) is the safest universal choice.',
	},
	{
		title: 'Loop preserved',
		description: 'Export with a loop attribute — the MP4 plays continuously just like the source GIF.',
	},
	{ title: 'No upload', description: 'Conversion happens entirely in your browser via WebAssembly FFmpeg.' },
];

function GifToMp4Landing() {
	return (
		<>
			<Seo
				title="GIF to MP4 Converter Online Free"
				description="Convert GIF to MP4 online for free. Shrink GIF animations to 10× smaller MP4 or WebM files, directly in your browser. No upload, no watermark."
				path="/tools/gif-to-mp4"
				jsonLd={[
					buildWebAppSchema(
						'Vixely GIF to MP4 Converter',
						'Convert GIF files to MP4 or WebM directly in your browser with no upload.',
						'https://vixely.app/tools/gif-to-mp4',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="emerald"
				icon={Film}
				heading="Convert GIF to MP4 — Free, Fast, No Upload"
				tagline="Turn animated GIFs into much smaller MP4, WebM or animated WebP files — directly in your browser. Loops, quality and speed all preserved."
				ctaLabel="Open the converter"
				ctaHref="/tools/gif"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'Optimize GIF', subtitle: 'Keep GIF but smaller', href: '/tools/gif', icon: Film },
					{ title: 'Video to GIF', subtitle: 'The reverse conversion', href: '/tools/video', icon: Video },
					{ title: 'Image Editor', subtitle: 'Edit a frame', href: '/tools/image', icon: ImageIcon },
				]}
			/>
		</>
	);
}
