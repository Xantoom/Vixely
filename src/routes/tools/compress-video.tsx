import { createFileRoute } from '@tanstack/react-router';
import { FeatureLandingPage } from '@/components/FeatureLandingPage.tsx';
import { COMPRESS_VIDEO_LANDING } from './featureLandings.ts';

export const Route = createFileRoute('/tools/compress-video')({
	component: () => <FeatureLandingPage {...COMPRESS_VIDEO_LANDING} />,
});
