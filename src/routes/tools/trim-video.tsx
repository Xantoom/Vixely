import { createFileRoute } from '@tanstack/react-router';
import { Video, ImageIcon, Film } from 'lucide-react';
import { FeatureLanding } from '@/components/FeatureLanding.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';

export const Route = createFileRoute('/tools/trim-video')({ component: TrimVideoLanding });

const FAQS = [
	{
		question: 'How accurate is the trim?',
		answer: 'Vixely trims at frame-level precision. You can scrub frame-by-frame and set start/end points to the exact frame.',
	},
	{
		question: 'Does trimming re-encode the video?',
		answer: 'Depending on the codec and keyframe positions, Vixely may either stream-copy (lossless, instant) or re-encode. The UI indicates which mode is used.',
	},
	{
		question: 'Can I trim multiple segments at once?',
		answer: 'Currently Vixely supports a single trim range per export. Multi-segment editing is on the roadmap.',
	},
	{
		question: 'Which formats can I trim?',
		answer: 'MP4, WebM, MKV, MOV, AVI, FLV, OGV — every container supported by the Mediabunny library plus the browser-native WebCodecs API.',
	},
];

const BULLETS = [
	{
		title: 'Frame-accurate',
		description: 'Zoom in on the timeline and pick the exact first and last frame of your clip.',
	},
	{
		title: 'Lossless when possible',
		description:
			'If the trim lands on keyframes, Vixely stream-copies the video — no quality loss, instant export.',
	},
	{
		title: 'Works with long files',
		description: 'Trim a 30-minute recording down to a 10-second clip without uploading anything.',
	},
	{ title: 'No watermark', description: 'Free forever, no sign-up, no watermark — ever.' },
];

function TrimVideoLanding() {
	return (
		<>
			<Seo
				title="Trim Video Online Free — Frame-Accurate"
				description="Trim and cut video clips online for free, directly in your browser. Frame-accurate start/end points, no upload, no watermark. Works with MP4, WebM, MKV, MOV and more."
				path="/tools/trim-video"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Video Trimmer',
						'Trim and cut videos frame-accurately in your browser with no upload.',
						'https://vixely.app/tools/trim-video',
					),
					buildFAQSchema(FAQS),
				]}
			/>
			<FeatureLanding
				accent="blue"
				icon={Video}
				heading="Trim Video Online — Frame-Accurate, No Upload"
				tagline="Cut the best moment out of any clip. Scrub to the exact frame, set your in and out points, export. All processed locally."
				ctaLabel="Open the video trimmer"
				ctaHref="/tools/video"
				bullets={BULLETS}
				faqs={FAQS}
				crossLinks={[
					{ title: 'Compress Video', subtitle: 'Shrink file size', href: '/tools/video', icon: Video },
					{ title: 'Video to GIF', subtitle: 'Convert to animation', href: '/tools/gif', icon: Film },
					{ title: 'Image Editor', subtitle: 'Edit a frame', href: '/tools/image', icon: ImageIcon },
				]}
			/>
		</>
	);
}
