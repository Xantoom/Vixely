import { Film, ImageIcon, Video } from 'lucide-react';
import type { FeatureLandingPageConfig } from '@/components/FeatureLandingPage.tsx';

/* Centralized config for the SEO/feature-landing routes.
 * Each entry produces a `<FeatureLandingPage>` page via the matching route file. */

export const COMPRESS_VIDEO_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'Compress Video Online Free — No Upload',
		description:
			'Compress video online for free, directly in your browser. Reduce MP4, WebM or MKV file size without uploading — choose codec, bitrate or target size. 100% private, powered by native WebCodecs and Mediabunny.',
		path: '/tools/compress-video',
		schemaName: 'Vixely Video Compressor',
		schemaDescription: 'Compress MP4, WebM, MKV videos directly in your browser with no upload.',
		schemaUrl: 'https://vixely.app/tools/compress-video',
	},
	accent: 'blue',
	icon: Video,
	heading: 'Compress Video Online — Free, Private, No Upload',
	tagline:
		'Shrink MP4, WebM, MKV and MOV files right in your browser. Choose a codec, set a target size, export. Your footage stays on your device.',
	ctaLabel: 'Open the video compressor',
	ctaHref: '/tools/video',
	bullets: [
		{
			title: 'No upload, no waiting',
			description:
				'Your video never leaves your device. Encoding starts instantly without a round-trip to a server.',
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
			description:
				'One-click settings for Discord, Twitter, TikTok, YouTube — correct resolution, bitrate and size.',
		},
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'Trim Video', subtitle: 'Cut clips precisely', href: '/tools/video', icon: Video },
		{ title: 'Resize Image', subtitle: 'Change image dimensions', href: '/tools/image', icon: ImageIcon },
		{ title: 'Optimize GIF', subtitle: 'Shrink animations', href: '/tools/gif', icon: Film },
	],
};

export const TRIM_VIDEO_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'Trim Video Online Free — Frame-Accurate',
		description:
			'Trim and cut video clips online for free, directly in your browser. Frame-accurate start/end points, no upload, no watermark. Works with MP4, WebM, MKV, MOV and more.',
		path: '/tools/trim-video',
		schemaName: 'Vixely Video Trimmer',
		schemaDescription: 'Trim and cut videos frame-accurately in your browser with no upload.',
		schemaUrl: 'https://vixely.app/tools/trim-video',
	},
	accent: 'blue',
	icon: Video,
	heading: 'Trim Video Online — Frame-Accurate, No Upload',
	tagline:
		'Cut the best moment out of any clip. Scrub to the exact frame, set your in and out points, export. All processed locally.',
	ctaLabel: 'Open the video trimmer',
	ctaHref: '/tools/video',
	bullets: [
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
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'Compress Video', subtitle: 'Shrink file size', href: '/tools/video', icon: Video },
		{ title: 'Video to GIF', subtitle: 'Convert to animation', href: '/tools/gif', icon: Film },
		{ title: 'Image Editor', subtitle: 'Edit a frame', href: '/tools/image', icon: ImageIcon },
	],
};

export const VIDEO_TO_GIF_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'Video to GIF Converter Online Free',
		description:
			'Convert video to GIF online for free. Trim, resize, set framerate and export animated GIF, APNG or animated WebP directly in your browser. No upload, no watermark.',
		path: '/tools/video-to-gif',
		schemaName: 'Vixely Video to GIF Converter',
		schemaDescription: 'Convert videos to animated GIF, APNG or WebP directly in your browser.',
		schemaUrl: 'https://vixely.app/tools/video-to-gif',
	},
	accent: 'blue',
	icon: Video,
	heading: 'Convert Video to GIF — Free, Instant, No Upload',
	tagline:
		'Turn any video clip into an animated GIF, APNG or WebP. Real-time preview, frame-accurate trim, full control over size and framerate.',
	ctaLabel: 'Open the converter',
	ctaHref: '/tools/video',
	bullets: [
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
			title: 'No upload, 100% local',
			description:
				'Your source clip never leaves the browser. Conversion runs on native browser APIs (WebCodecs + Mediabunny) with hardware acceleration — no server, no third-party encoder binary, no watermark.',
		},
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'Video Editor', subtitle: 'Trim & color-correct', href: '/tools/video', icon: Video },
		{ title: 'GIF to MP4', subtitle: 'The reverse conversion', href: '/tools/gif', icon: Film },
		{ title: 'Image Editor', subtitle: 'Edit a single frame', href: '/tools/image', icon: ImageIcon },
	],
};

export const GIF_TO_MP4_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'GIF to MP4 Converter Online Free',
		description:
			'Convert GIF to MP4 online for free. Shrink GIF animations to 10× smaller MP4 or WebM files, directly in your browser. No upload, no watermark.',
		path: '/tools/gif-to-mp4',
		schemaName: 'Vixely GIF to MP4 Converter',
		schemaDescription: 'Convert GIF files to MP4 or WebM directly in your browser with no upload.',
		schemaUrl: 'https://vixely.app/tools/gif-to-mp4',
	},
	accent: 'emerald',
	icon: Film,
	heading: 'Convert GIF to MP4 — Free, Fast, No Upload',
	tagline:
		'Turn animated GIFs into much smaller MP4, WebM or animated WebP files — directly in your browser. Loops, quality and speed all preserved.',
	ctaLabel: 'Open the converter',
	ctaHref: '/tools/gif',
	bullets: [
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
		{
			title: 'No upload, hardware-accelerated',
			description:
				'Conversion happens entirely in your browser using native WebCodecs and Mediabunny — no server roundtrip, no third-party encoder binary, no watermark.',
		},
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'Optimize GIF', subtitle: 'Keep GIF but smaller', href: '/tools/gif', icon: Film },
		{ title: 'Video to GIF', subtitle: 'The reverse conversion', href: '/tools/video', icon: Video },
		{ title: 'Image Editor', subtitle: 'Edit a frame', href: '/tools/image', icon: ImageIcon },
	],
};

export const OPTIMIZE_GIF_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'Optimize GIF Online Free — Reduce Size',
		description:
			'Optimize and compress GIF files online for free. Reduce dimensions, framerate and palette size to shrink animated GIFs directly in your browser. No upload required.',
		path: '/tools/optimize-gif',
		schemaName: 'Vixely GIF Optimizer',
		schemaDescription: 'Compress and optimize animated GIF files directly in your browser with no upload.',
		schemaUrl: 'https://vixely.app/tools/optimize-gif',
	},
	accent: 'emerald',
	icon: Film,
	heading: 'Optimize GIF Online — Shrink Size, Keep Quality',
	tagline:
		'Reduce GIF file size by dropping frames, lowering framerate, tuning the palette or exporting to MP4/WebP. Everything stays in your browser.',
	ctaLabel: 'Open the GIF optimizer',
	ctaHref: '/tools/gif',
	bullets: [
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
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'GIF to MP4', subtitle: 'Smaller than GIF', href: '/tools/gif', icon: Film },
		{ title: 'Video to GIF', subtitle: 'Create a GIF', href: '/tools/video', icon: Video },
		{ title: 'Image Editor', subtitle: 'Edit stills', href: '/tools/image', icon: ImageIcon },
	],
};

export const RESIZE_IMAGE_LANDING: FeatureLandingPageConfig = {
	seo: {
		title: 'Resize Image Online Free — PNG, JPG, WebP',
		description:
			'Resize images online for free — PNG, JPG, WebP, AVIF. Preserve aspect ratio, apply high-quality downsampling and export directly in your browser. No upload required.',
		path: '/tools/resize-image',
		schemaName: 'Vixely Image Resizer',
		schemaDescription: 'Resize PNG, JPG, WebP and AVIF images directly in your browser with no upload.',
		schemaUrl: 'https://vixely.app/tools/resize-image',
	},
	accent: 'amber',
	icon: ImageIcon,
	heading: 'Resize Image Online — Free & Private',
	tagline:
		'Scale PNG, JPG, WebP and AVIF photos to any dimensions without uploading them. Keep the aspect ratio, apply quality downsampling, export in the format you need.',
	ctaLabel: 'Open the image editor',
	ctaHref: '/tools/image',
	bullets: [
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
	],
	faqs: [
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
	],
	crossLinks: [
		{ title: 'Image Editor', subtitle: 'Crop & color-correct', href: '/tools/image', icon: ImageIcon },
		{ title: 'Video Editor', subtitle: 'Resize & trim video', href: '/tools/video', icon: Video },
		{ title: 'GIF Editor', subtitle: 'Resize animations', href: '/tools/gif', icon: Film },
	],
};
