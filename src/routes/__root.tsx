import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { GlobalDrop } from '@/app/GlobalDrop';
import { usePageHead } from '@/app/head';
import { m } from '@/paraglide/messages.js';

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
		<main className="grid min-h-full place-content-center justify-items-start gap-4 p-8">
			<h1 className="text-display font-bold tracking-[-0.045em]">404</h1>
			<Link to="/" className="text-body underline underline-offset-[3px]">
				{m.back_home()}
			</Link>
		</main>
	);
}

function Root() {
	return (
		<>
			<Outlet />
			<GlobalDrop />
		</>
	);
}

export const Route = createRootRoute({ component: Root, notFoundComponent: NotFound });
