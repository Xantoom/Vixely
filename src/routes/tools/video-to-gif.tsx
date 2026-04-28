import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { VIDEO_TO_GIF_LANDING } from './featureLandings.ts';

export const Route = createFileRoute('/tools/video-to-gif')({
	component: () => <FeatureLandingPage {...VIDEO_TO_GIF_LANDING} />,
});
