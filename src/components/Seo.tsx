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
}

function normalizeTitle(title: string): string {
	return title.includes('Vixely') ? title : `${title} — Vixely`;
}

export function Seo({
	title,
	description,
	path,
	imageUrl = DEFAULT_OG_IMAGE_URL,
	imageAlt = DEFAULT_OG_IMAGE_ALT,
	noIndex = false,
}: SeoProps) {
	const canonicalUrl = `${SITE_URL}${path}`;
	const normalizedTitle = normalizeTitle(title);
	const robotsContent = noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';

	return (
		<Helmet>
			<title>{normalizedTitle}</title>
			<meta name="description" content={description} />
			<meta name="robots" content={robotsContent} />
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
		</Helmet>
	);
}
