import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'Vixely';
const SITE_URL = 'https://vixely.app';
const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
const DEFAULT_OG_IMAGE_ALT = 'Vixely local-first media editing interface preview';

interface SeoProps {
	title: string;
	description: string;
	path: `/${string}` | '/';
	imageUrl?: string;
	imageAlt?: string;
	noIndex?: boolean;
	jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

function normalizeTitle(title: string): string {
	return title.includes('Vixely') ? title : `${title} — Vixely`;
}

const ORG_SCHEMA = JSON.stringify({
	'@context': 'https://schema.org',
	'@type': 'Organization',
	name: 'Vixely',
	url: SITE_URL,
	logo: `${SITE_URL}/logo.png`,
});

export function Seo({
	title,
	description,
	path,
	imageUrl = DEFAULT_OG_IMAGE_URL,
	imageAlt = DEFAULT_OG_IMAGE_ALT,
	noIndex = false,
	jsonLd,
}: SeoProps) {
	const canonicalUrl = `${SITE_URL}${path}`;
	const normalizedTitle = normalizeTitle(title);
	const robotsContent = noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';

	const breadcrumbSchema =
		path !== '/'
			? JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'BreadcrumbList',
					itemListElement: [
						{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
						{ '@type': 'ListItem', position: 2, name: normalizedTitle, item: canonicalUrl },
					],
				})
			: null;

	return (
		<Helmet>
			<title>{normalizedTitle}</title>
			<meta name="description" content={description} />
			<meta name="robots" content={robotsContent} />
			<meta name="application-name" content={SITE_NAME} />
			<link rel="canonical" href={canonicalUrl} />

			<meta property="og:type" content="website" />
			<meta property="og:site_name" content={SITE_NAME} />
			<meta property="og:title" content={normalizedTitle} />
			<meta property="og:description" content={description} />
			<meta property="og:url" content={canonicalUrl} />
			<meta property="og:image" content={imageUrl} />
			<meta property="og:image:secure_url" content={imageUrl} />
			<meta property="og:image:type" content="image/png" />
			<meta property="og:image:width" content="1200" />
			<meta property="og:image:height" content="630" />
			<meta property="og:image:alt" content={imageAlt} />

			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content={normalizedTitle} />
			<meta name="twitter:description" content={description} />
			<meta name="twitter:image" content={imageUrl} />
			<meta name="twitter:image:alt" content={imageAlt} />

			{/* Organization schema (all pages) */}
			<script type="application/ld+json">{ORG_SCHEMA}</script>

			{/* Breadcrumbs (sub pages) */}
			{breadcrumbSchema && <script type="application/ld+json">{breadcrumbSchema}</script>}

			{/* Page-specific structured data */}
			{jsonLd &&
				(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((schema) => (
					<script key={JSON.stringify(schema['@type'])} type="application/ld+json">
						{JSON.stringify(schema)}
					</script>
				))}
		</Helmet>
	);
}

export function buildWebAppSchema(name: string, description: string, url: string) {
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
		featureList: [
			'Video trimming and cutting',
			'Image cropping and resizing',
			'GIF optimization and editing',
			'Color correction and filters',
			'Platform presets for social media',
			'100% client-side processing',
			'No file uploads required',
			'WebAssembly powered',
		],
	};
}

export function buildFAQSchema(faqs: { question: string; answer: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((faq) => ({
			'@type': 'Question',
			name: faq.question,
			acceptedAnswer: { '@type': 'Answer', text: faq.answer },
		})),
	};
}

export function buildWebSiteSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		url: SITE_URL,
		description: 'Free online video, image, and GIF editor. Edit entirely in your browser with no uploads.',
	};
}
