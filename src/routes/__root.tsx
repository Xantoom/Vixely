import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { GlobalDrop } from '@/app/GlobalDrop';
import { usePageHead } from '@/app/head';
import { useLocale } from '@/app/locale';
import { SiteHeader } from '@/app/SiteHeader';
import { EDITOR_ORDER, EDITORS } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';
import { Tooltips } from '@/ui/Tooltips';

function NotFound() {
	usePageHead('404');
	// The server answers every address with the app: search engines learn here that this one is empty.
	useEffect(() => {
		const robots = document.createElement('meta');
		robots.name = 'robots';
		robots.content = 'noindex';
		document.head.append(robots);
		return () => {
			robots.remove();
		};
	}, []);
	return (
		<div className="flex min-h-full flex-col">
			<SiteHeader />
			<main className="mx-auto grid w-full max-w-[44rem] flex-1 content-center gap-6 px-[clamp(1rem,4vw,2.5rem)] py-16">
				<p className="font-display text-muted text-[clamp(4rem,12vw,7rem)] leading-none font-bold tracking-[-0.05em]">
					404
				</p>
				<h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-bold tracking-[-0.02em]">
					{m.not_found_title()}
				</h1>
				<p className="text-lead text-muted">{m.not_found_text()}</p>
				<ul className="border-line grid border-t">
					{EDITOR_ORDER.map((kind) => (
						<li key={kind} className="border-line border-b">
							<Link
								to={EDITORS[kind].path}
								className="text-body hover:bg-surface -mx-2 flex items-center gap-3 rounded-sm px-2 py-2.5 font-medium transition-colors"
							>
								<Tile kind={kind} size="sm" />
								{EDITORS[kind].label()}
							</Link>
						</li>
					))}
				</ul>
				<Link to="/" className="text-body justify-self-start underline underline-offset-[3px]">
					{m.back_home()}
				</Link>
			</main>
		</div>
	);
}

function Root() {
	// A new language re-renders every page in place (each route listens too), keeping what is open
	// and edited.
	useLocale();
	return (
		<>
			<Outlet />
			<GlobalDrop />
			<Tooltips />
		</>
	);
}

export const Route = createRootRoute({ component: Root, notFoundComponent: NotFound });
