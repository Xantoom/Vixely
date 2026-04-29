import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { TRIM_VIDEO_LANDING } from './-featureLandings.ts';

export const Route = createFileRoute('/tools/trim-video')({
	component: () => <FeatureLandingPage {...TRIM_VIDEO_LANDING} />,
});
