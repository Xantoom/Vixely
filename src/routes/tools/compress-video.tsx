import { createFileRoute } from '@tanstack/react-router';
import { Video, ImageIcon, Film } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/compress-video')({ component: CompressVideoLanding });

const FAQS = [
	{
		question: 'How does Vixely compress videos without uploading them?',
		answer: 'Vixely uses the browser-native WebCodecs API (hardware-accelerated H.264, H.265, VP9 and AV1 encoders) together with the Mediabunny library for container I/O. Your video is read, re-encoded and saved locally — no file ever leaves your device, and no third-party encoder binary is required.',
	},
	{
		question: 'What is the best codec to compress a video for the web?',
		answer: 'H.264 (MP4) is the most compatible; H.265 and AV1 compress smaller at the cost of slower encoding and narrower playback support. Vixely exposes all three with quality presets.',
	},
	{
		question: 'Can I target a specific file size?',
		answer: 'Yes. Vixely offers size-constrained export: set a target file size and the encoder will pick an appropriate bitrate for your clip.',
	},
	{
		question: 'Is there a file size limit?',
		answer: 'There is no arbitrary limit, but very large files depend on your device memory. Chrome and Edge generally handle 2–4 GB files without issue on modern machines.',
	},
];

const BULLETS = [
	{
		title: 'No upload, no waiting',
		description: 'Your video never leaves your device. Encoding starts instantly without a round-trip to a server.',
	},
	{
		title: 'Size-targeted export',
		description: 'Set a file size budget (e.g. 25 MB for Discord) and Vixely picks the bitrate to match it.',
	},
	{
		title: 'Full codec control',
		description: 'Pick H.264, H.265, VP9 or AV1. Tune bitrate, CRF or preset independently.',
	},
	{
		title: 'Platform presets',
		description: 'One-click settings for Discord, Twitter, TikTok, YouTube — correct resolution, bitrate and size.',
	},
];

function CompressVideoLanding() {
	return (
		<>
			<Seo
				title="Compress Video Online Free — No Upload"
				description="Compress video online for free, directly in your browser. Reduce MP4, WebM or MKV file size without uploading — choose codec, bitrate or target size. 100% private, powered by native WebCodecs and Mediabunny."
				path="/tools/compress-video"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Video Compressor',
						'Compress MP4, WebM, MKV videos directly in your browser with no upload.',
						'https://vixely.app/tools/compress-video',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="blue"
				icon={Video}
				heading="Compress Video Online — Free, Private, No Upload"
				tagline="Shrink MP4, WebM, MKV and MOV files right in your browser. Choose a codec, set a target size, export. Your footage stays on your device."
				ctaLabel="Open the video compressor"
				ctaHref="/tools/video"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'Trim Video', subtitle: 'Cut clips precisely', href: '/tools/video', icon: Video },
					{
						title: 'Resize Image',
						subtitle: 'Change image dimensions',
						href: '/tools/image',
						icon: ImageIcon,
					},
					{ title: 'Optimize GIF', subtitle: 'Shrink animations', href: '/tools/gif', icon: Film },
				]}
			/>
		</>
	);
}
