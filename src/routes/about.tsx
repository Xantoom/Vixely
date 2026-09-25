import { createFileRoute } from '@tanstack/react-router';
import { PAGES } from '@/app/pages/content';
import { SitePage } from '@/app/pages/SitePage';

export const Route = createFileRoute('/about')({
	component: function Page() {
		return <SitePage content={PAGES.about()} />;
	},
});
