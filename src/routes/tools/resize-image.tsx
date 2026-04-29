import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { RESIZE_IMAGE_LANDING } from './-featureLandings.ts';

export const Route = createFileRoute('/tools/resize-image')({
	component: () => <FeatureLandingPage {...RESIZE_IMAGE_LANDING} />,
});
