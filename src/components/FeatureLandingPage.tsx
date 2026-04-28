import { FeatureLanding, type FeatureLandingProps } from '@/components/FeatureLanding.tsx';
import { buildFAQSchema, buildWebAppSchema, Seo } from '@/components/Seo.tsx';

export interface FeatureLandingPageConfig extends FeatureLandingProps {
	seo: {
		title: string;
		description: string;
		path: `/${string}`;
		schemaName: string;
		schemaDescription: string;
		schemaUrl: string;
	};
}

export function FeatureLandingPage(config: FeatureLandingPageConfig) {
	const { seo, ...landingProps } = config;
	return (
		<>
			<Seo
				title={seo.title}
				description={seo.description}
				path={seo.path}
				jsonLd={[
					buildWebAppSchema(seo.schemaName, seo.schemaDescription, seo.schemaUrl),
					buildFAQSchema(landingProps.faqs),
				]}
			/>
			<FeatureLanding {...landingProps} />
		</>
	);
}
