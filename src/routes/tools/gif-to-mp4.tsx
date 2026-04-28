import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { GIF_TO_MP4_LANDING } from './featureLandings.ts';

export const Route = createFileRoute('/tools/gif-to-mp4')({
	component: () => <FeatureLandingPage {...GIF_TO_MP4_LANDING} />,
});
