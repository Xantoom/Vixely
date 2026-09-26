import { createFileRoute } from '@tanstack/react-router';
import { useLocale } from '@/app/locale';
import { PAGES } from '@/app/pages/content';
import { SitePage } from '@/app/pages/SitePage';

export const Route = createFileRoute('/legal')({
	component: function Page() {
		useLocale();
		return <SitePage content={PAGES.legal()} />;
	},
});
