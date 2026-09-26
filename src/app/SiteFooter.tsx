import { Link } from '@tanstack/react-router';
import { EDITOR_ORDER, EDITORS } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { LogoMark } from '@/ui/Logo';
import { homeCopy } from './home/copy';
import { TASKS } from './tasks';

const LINK = 'text-ui text-ink-2 hover:text-ink block py-1 transition-colors';

/** Tasks worth a place at the foot of every page. */
const FOOT_TASKS = new Set(['compress-video', 'video-to-gif', 'compress-image', 'normalize-audio', 'resync-subtitles']);

/** Every page's foot: the editors, the main tasks, the pages about the site and its source. */
export function SiteFooter() {
	const copy = homeCopy();
	const heading = 'text-caption text-muted mb-2.5 font-semibold tracking-[0.06em] uppercase';
	return (
		<footer className="border-line mx-auto mt-16 grid w-full max-w-[76rem] grid-cols-2 gap-8 border-t px-[clamp(1rem,4vw,2.5rem)] py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
			<div className="col-span-2 md:col-span-1">
				<Link to="/" aria-label={m.app_home()} className="flex items-center gap-2.5">
					<LogoMark size={28} />
					<span className="text-lead font-bold tracking-[-0.03em]">Vixely</span>
				</Link>
				<p className="text-ui text-muted mt-3 max-w-[26ch]">{copy.footer.tagline}</p>
			</div>
			<nav aria-label={copy.footer.editors}>
				<h2 className={heading}>{copy.footer.editors}</h2>
				{EDITOR_ORDER.map((kind) => (
					<Link key={kind} to={EDITORS[kind].path} className={LINK}>
						{EDITORS[kind].label()}
					</Link>
				))}
			</nav>
			<nav aria-label={copy.footer.tasks}>
				<h2 className={heading}>{copy.footer.tasks}</h2>
				{TASKS.filter((task) => FOOT_TASKS.has(task.slug)).map((task) => (
					<Link key={task.slug} to="/tools/$task" params={{ task: task.slug }} className={LINK}>
						{task.title()}
					</Link>
				))}
			</nav>
			<nav aria-label={copy.footer.resources}>
				<h2 className={heading}>{copy.footer.resources}</h2>
				<Link to="/" hash="faq" className={LINK}>
					{copy.nav.faq}
				</Link>
				<Link to="/system" className={LINK}>
					{copy.footer.system}
				</Link>
				<a href="https://github.com/Xantoom/Vixely" className={LINK}>
					{copy.footer.source}
				</a>
			</nav>
			<nav aria-label={copy.footer.legal}>
				<h2 className={heading}>{copy.footer.legal}</h2>
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
			</nav>
		</footer>
	);
}
