import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { m } from '@/paraglide/messages.js';

function NotFound() {
	return (
		<main className="grid min-h-full place-content-center justify-items-start gap-4 p-8">
			<h1 className="text-display font-bold tracking-[-0.045em]">404</h1>
			<Link to="/" className="text-body underline underline-offset-[3px]">
				{m.back_home()}
			</Link>
		</main>
	);
}

export const Route = createRootRoute({ component: Outlet, notFoundComponent: NotFound });
