import { Link } from '@tanstack/react-router';
import { Seo } from '@/components/Seo.tsx';

export function NotFound() {
	return (
		<>
			<Seo
				title="Page Not Found"
				description="The page you are looking for does not exist. Return to Vixely to edit videos, images and GIFs in your browser."
				path="/"
				noIndex
			/>
			<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center bg-bg">
				<p className="text-6xl font-bold text-accent/30 font-mono mb-4">404</p>
				<h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Page not found</h1>
				<p className="text-[14px] text-text-secondary max-w-md mb-8">
					The page you&apos;re looking for doesn&apos;t exist or has been moved.
				</p>
				<div className="flex flex-wrap items-center justify-center gap-3">
					<Link
						to="/"
						className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90"
					>
						Back to home
					</Link>
					<Link
						to="/tools/video"
						className="rounded-lg border border-border bg-surface/50 px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text hover:bg-surface"
					>
						Open video editor
					</Link>
				</div>
			</div>
		</>
	);
}
