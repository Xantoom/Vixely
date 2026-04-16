/**
 * Single source of truth for SEO metadata per route.
 * Consumed by prerender-routes.mjs (head rewriting) and generate-sitemap.mjs.
 *
 * Keep this in sync with src/components/Seo.tsx usages in the routes.
 */

export const SITE_URL = 'https://vixely.app';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const DEFAULT_OG_ALT = 'Vixely local-first media editing interface preview';

export const ORG_SCHEMA = {
	'@context': 'https://schema.org',
	'@type': 'Organization',
	name: 'Vixely',
	url: SITE_URL,
	logo: `${SITE_URL}/vixely-app-logo.svg`,
};

export function webAppSchema(name, description, url) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name,
		description,
		url,
		applicationCategory: 'MultimediaApplication',
		operatingSystem: 'Web',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		browserRequirements: 'Requires a modern web browser with WebAssembly support',
	};
}

export function faqSchema(faqs) {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((f) => ({
			'@type': 'Question',
			name: f.question,
			acceptedAnswer: { '@type': 'Answer', text: f.answer },
		})),
	};
}

export function breadcrumbSchema(title, path) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
			{ '@type': 'ListItem', position: 2, name: title, item: `${SITE_URL}${path}` },
		],
	};
}

const featureFaqs = {
	'compress-video': [
		{
			question: 'How does Vixely compress videos without uploading them?',
			answer: 'Vixely runs a WebAssembly build of FFmpeg directly in your browser. Your video is read, re-encoded and saved locally — no file ever leaves your device.',
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
	'trim-video': [
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
	],
	'video-to-gif': [
		{
			question: 'What makes a good video-to-GIF conversion?',
			answer: 'Short clips (2–10 s), a target width of 480–720 px, and 10–15 fps give the best tradeoff between size and smoothness. Vixely previews the result in real time.',
		},
		{
			question: 'Why are my GIFs so large?',
			answer: 'GIF is an inefficient format — a 10-second HD GIF can exceed 10 MB. Consider animated WebP or MP4 if your target platform supports them. Vixely exports all three.',
		},
		{
			question: 'Can I choose which frames to include?',
			answer: 'Yes. Use the trim timeline to bound the source, then fine-tune framerate and dimensions before export.',
		},
	],
	'resize-image': [
		{
			question: 'Which interpolation method does Vixely use?',
			answer: 'By default Vixely uses the browser’s built-in high-quality bicubic/Lanczos resampling. All resizing happens in a canvas on your device.',
		},
		{
			question: 'Can I resize while preserving the aspect ratio?',
			answer: 'Yes. Lock the aspect ratio and set either width or height — the other dimension is computed automatically.',
		},
		{
			question: 'Does resizing lose quality?',
			answer: 'Down-sampling is lossless in the interpolation step but lossy if you re-encode to JPEG. Use PNG or WebP for cleaner results.',
		},
	],
	'optimize-gif': [
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
	],
	'gif-to-mp4': [
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
	],
};

const featureLandings = [
	{
		path: '/tools/compress-video',
		title: 'Compress Video Online Free — No Upload | Vixely',
		description:
			'Compress video online for free, directly in your browser. Reduce MP4, WebM or MKV file size without uploading — choose codec, bitrate or target size. 100% private, powered by WebAssembly.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'compress-video',
		editor: '/tools/video',
		keywords: 'compress video online, reduce video size, free video compressor',
	},
	{
		path: '/tools/trim-video',
		title: 'Trim Video Online Free — Frame-Accurate | Vixely',
		description:
			'Trim and cut video clips online for free, directly in your browser. Frame-accurate start/end points, no upload, no watermark. Works with MP4, WebM, MKV, MOV and more.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'trim-video',
		editor: '/tools/video',
		keywords: 'trim video online, cut video, online video trimmer',
	},
	{
		path: '/tools/video-to-gif',
		title: 'Video to GIF Converter Online Free | Vixely',
		description:
			'Convert video to GIF online for free. Trim, resize, set framerate and export animated GIF, APNG or animated WebP directly in your browser. No upload, no watermark.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'video-to-gif',
		editor: '/tools/video',
		keywords: 'video to gif, mp4 to gif, online gif maker',
	},
	{
		path: '/tools/resize-image',
		title: 'Resize Image Online Free — PNG, JPG, WebP | Vixely',
		description:
			'Resize images online for free — PNG, JPG, WebP, AVIF. Preserve aspect ratio, apply high-quality downsampling and export directly in your browser. No upload required.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'resize-image',
		editor: '/tools/image',
		keywords: 'resize image online, image resizer, free photo resizer',
	},
	{
		path: '/tools/optimize-gif',
		title: 'Optimize GIF Online Free — Reduce Size | Vixely',
		description:
			'Optimize and compress GIF files online for free. Reduce dimensions, framerate and palette size to shrink animated GIFs directly in your browser. No upload required.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'optimize-gif',
		editor: '/tools/gif',
		keywords: 'optimize gif, compress gif, reduce gif size',
	},
	{
		path: '/tools/gif-to-mp4',
		title: 'GIF to MP4 Converter Online Free | Vixely',
		description:
			'Convert GIF to MP4 online for free. Shrink GIF animations to 10× smaller MP4 or WebM files, directly in your browser. No upload, no watermark.',
		priority: 0.85,
		changefreq: 'weekly',
		action: 'gif-to-mp4',
		editor: '/tools/gif',
		keywords: 'gif to mp4, convert gif to video, online gif converter',
	},
];

function buildFeatureSchemas(route) {
	return [
		webAppSchema(`Vixely — ${route.title.split('—')[0].trim()}`, route.description, `${SITE_URL}${route.path}`),
		faqSchema(featureFaqs[route.action]),
	];
}

export const routes = [
	{
		path: '/',
		title: 'Vixely — Free Online Video, Image & GIF Editor',
		description:
			'Free online video, image and GIF editor. Trim, crop, resize, color-correct, add filters and export MP4, WebM, PNG, GIF and more — directly in your browser. No upload, 100% private, powered by WebAssembly.',
		priority: 1.0,
		changefreq: 'weekly',
		schemas: [
			webAppSchema(
				'Vixely',
				'Free online video, image and GIF editor. Trim, crop, resize, color-correct and export directly in your browser.',
				SITE_URL,
			),
			{
				'@context': 'https://schema.org',
				'@type': 'WebSite',
				name: 'Vixely',
				url: SITE_URL,
				description:
					'Free online video, image and GIF editor. Edit entirely in your browser with no uploads.',
			},
		],
	},
	{
		path: '/tools/video',
		title: 'Free Online Video Editor — Trim, Crop & Export | Vixely',
		description:
			'Free online video editor — trim, cut, resize, crop, color-correct and export MP4, WebM, MKV and more, directly in your browser. No upload, 100% private.',
		priority: 0.9,
		changefreq: 'weekly',
		schemas: [
			webAppSchema(
				'Vixely Video Editor',
				'Trim, cut, resize, crop, color-correct and export videos locally in your browser.',
				`${SITE_URL}/tools/video`,
			),
		],
	},
	{
		path: '/tools/image',
		title: 'Free Online Image Editor — Resize, Crop & Filter | Vixely',
		description:
			'Free online image editor — resize, crop, apply real-time filters, color-correct and export PNG, JPG, WebP, AVIF directly in your browser. No upload, 100% private.',
		priority: 0.9,
		changefreq: 'weekly',
		schemas: [
			webAppSchema(
				'Vixely Image Editor',
				'Resize, crop, apply real-time filters and export PNG, JPG, WebP, AVIF directly in your browser.',
				`${SITE_URL}/tools/image`,
			),
		],
	},
	{
		path: '/tools/gif',
		title: 'Free Online GIF Editor — Optimize, Trim & Convert | Vixely',
		description:
			'Free online GIF editor — trim, crop, resize, optimize and convert GIF, APNG and animated WebP with real-time filters, directly in your browser. No upload, 100% private.',
		priority: 0.9,
		changefreq: 'weekly',
		schemas: [
			webAppSchema(
				'Vixely GIF Editor',
				'Trim, crop, resize, optimize and convert GIF, APNG and animated WebP directly in your browser.',
				`${SITE_URL}/tools/gif`,
			),
		],
	},
	...featureLandings.map((route) => ({
		...route,
		schemas: buildFeatureSchemas(route),
	})),
	{
		path: '/about',
		title: 'About Vixely — Private, Local-First Media Editing',
		description:
			'About Vixely — the story behind the free, local-first video, image and GIF editor. Our mission: professional media editing without uploads, servers or tracking.',
		priority: 0.6,
		changefreq: 'monthly',
		schemas: [
			{
				'@context': 'https://schema.org',
				'@type': 'AboutPage',
				name: 'About Vixely',
				url: `${SITE_URL}/about`,
				description:
					'The story and mission behind Vixely, the free local-first media editor.',
			},
		],
	},
	{
		path: '/privacy',
		title: 'Privacy Policy — Vixely',
		description:
			'Vixely privacy policy. Vixely processes all media locally in your browser — no uploads, no server-side storage, no tracking beyond anonymous analytics.',
		priority: 0.5,
		changefreq: 'monthly',
		schemas: [],
	},
	{
		path: '/terms',
		title: 'Terms of Use — Vixely',
		description:
			'Vixely terms of use. Rules and conditions that apply when using the Vixely browser-based media editor.',
		priority: 0.3,
		changefreq: 'yearly',
		schemas: [],
	},
	{
		path: '/legal',
		title: 'Legal Notice — Vixely',
		description:
			'Legal notice for Vixely, the private browser-based video, image and GIF editor.',
		priority: 0.3,
		changefreq: 'yearly',
		schemas: [],
	},
];

export { featureFaqs, featureLandings };
