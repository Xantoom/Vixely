import { Link } from '@tanstack/react-router';
import { m } from '@/paraglide/messages.js';

const LINK = 'hover:text-ink underline-offset-[3px] hover:underline';

/** The pages about the site itself, and its source code. */
export function SiteFooter() {
	return (
		<footer className="border-line text-ui text-muted flex flex-wrap gap-x-6 gap-y-2 border-t pt-6">
			<Link to="/about" className={LINK}>
				{m.page_about()}
			</Link>
			<Link to="/privacy" className={LINK}>
				{m.page_privacy()}
			</Link>
			<Link to="/terms" className={LINK}>
				{m.page_terms()}
			</Link>
			<Link to="/legal" className={LINK}>
				{m.page_legal()}
			</Link>
			<Link to="/system" className={LINK}>
				{m.home_capabilities()}
			</Link>
			<a href="https://github.com/Xantoom/Vixely" className={LINK}>
				GitHub
			</a>
		</footer>
	);
}
