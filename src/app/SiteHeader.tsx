import { Link } from '@tanstack/react-router';
import { MonitorDown, Moon, RefreshCw, Sun } from 'lucide-react';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { LogoMark } from '@/ui/Logo';
import { LanguageButton } from './AppBar';
import { homeCopy } from './home/copy';
import { OpenFileButton } from './OpenFileButton';
import { applyUpdate, install, usePwa } from './pwa';
import { useTheme } from './theme';

/** The bar of the pages around the editors: the home page's sections, and a way in. */
export function SiteHeader() {
	const copy = homeCopy();
	const [theme, toggleTheme] = useTheme();
	const updateReady = usePwa((state) => state.updateReady);
	const installable = usePwa((state) => state.installable);
	const sections = [
		['editors', copy.nav.editors],
		['tasks', copy.nav.tasks],
		['formats', copy.nav.formats],
		['faq', copy.nav.faq],
	] as const;
	return (
		<header className="border-line sticky top-0 z-30 border-b bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-md">
			<div className="mx-auto flex h-16 w-full max-w-[76rem] items-center gap-6 px-[clamp(1rem,4vw,2.5rem)]">
				<Link
					to="/"
					aria-label={m.app_home()}
					className="hover:bg-surface -ml-1.5 flex h-10 items-center gap-2.5 rounded-sm px-1.5 transition-colors"
				>
					<LogoMark size={30} />
					<span className="text-lead font-bold tracking-[-0.03em]">Vixely</span>
				</Link>
				<nav aria-label={copy.nav.label} className="flex gap-6 max-md:hidden">
					{sections.map(([hash, label]) => (
						<Link
							key={hash}
							to="/"
							hash={hash}
							className="text-ui text-ink-2 hover:text-ink font-medium transition-colors"
						>
							{label}
						</Link>
					))}
				</nav>
				<div className="flex-1" />
				<div className="flex items-center gap-1.5">
					{updateReady && (
						<IconButton label={m.app_update()} onClick={applyUpdate}>
							<RefreshCw className="size-5" />
						</IconButton>
					)}
					{installable && (
						<IconButton
							label={m.app_install()}
							onClick={() => {
								void install();
							}}
						>
							<MonitorDown className="size-5" />
						</IconButton>
					)}
					<LanguageButton />
					<IconButton label={theme === 'dark' ? m.theme_to_light() : m.theme_to_dark()} onClick={toggleTheme}>
						{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
					</IconButton>
					<OpenFileButton
						reading={copy.reading}
						className="text-ui ml-1.5 h-10 rounded-sm px-4 max-sm:hidden"
					>
						{copy.nav.open}
					</OpenFileButton>
				</div>
			</div>
		</header>
	);
}
