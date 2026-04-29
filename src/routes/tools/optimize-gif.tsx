import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { OPTIMIZE_GIF_LANDING } from './-featureLandings.ts';

export const Route = createFileRoute('/tools/optimize-gif')({
	component: () => <FeatureLandingPage {...OPTIMIZE_GIF_LANDING} />,
});
