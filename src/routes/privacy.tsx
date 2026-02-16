import { createFileRoute, Link } from '@tanstack/react-router';
import { Helmet } from 'react-helmet-async';

export const Route = createFileRoute('/privacy')({ component: PrivacyPage });

function PrivacyPage() {
	return (
		<>
			<Helmet>
				<title>Privacy Policy — Vixely</title>
				<meta name="description" content="Vixely's privacy policy. Your files never leave your device." />
			</Helmet>

			<div className="max-w-2xl mx-auto px-8 py-16 animate-fade-in">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-secondary transition-colors mb-8"
				>
					<svg
						className="h-3.5 w-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<path d="M19 12H5M12 19l-7-7 7-7" />
					</svg>
					Back to Vixely
				</Link>

				<h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
				<p className="mt-2 text-sm text-text-tertiary">Last updated: February 2026</p>

				<div className="mt-10 flex flex-col gap-8 text-sm text-text-secondary leading-relaxed">
					<Section title="The short version">
						<p>
							Vixely processes everything locally in your browser. Your files{' '}
							<strong className="text-text">never leave your device</strong>. We don't upload, store, or
							have access to any media you edit.
						</p>
					</Section>

					<Section title="What data we collect">
						<p>
							<strong className="text-text">None of your files.</strong> All video, image, and GIF
							processing runs client-side via WebAssembly. No file data is transmitted to any server.
						</p>
						<p className="mt-2">
							We may collect anonymous, aggregated usage analytics (e.g., page views, feature usage
							counts) to improve the product. This data contains no personally identifiable information.
						</p>
					</Section>

					<Section title="Cookies">
						<p>
							Vixely uses minimal local storage entries to remember your preferences (e.g., whether you've
							seen the privacy notice). We do not use advertising cookies.
						</p>
					</Section>

					<Section title="Third-party services">
						<p>
							Vixely loads open-source libraries (FFmpeg.wasm, Rust WASM modules) from your local bundle —
							no CDN calls for processing. Google Fonts are loaded for typography.
						</p>
					</Section>

					<Section title="Data security">
						<p>
							Because your files never leave your browser, the risk of data breach is inherently minimal.
							We use HTTPS for all page loads and set appropriate security headers (COOP/COEP) for
							WebAssembly compatibility.
						</p>
					</Section>

					<Section title="Your rights">
						<p>
							Since we don't collect personal data, there's nothing to request, modify, or delete. You can
							clear your browser's local storage at any time to reset all Vixely preferences.
						</p>
					</Section>

					<Section title="Contact">
						<p>
							Questions about this policy? Open an issue on our{' '}
							<a
								href="https://github.com"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-accent hover:text-accent/80 transition-colors"
							>
								GitHub repository
							</a>
							.
						</p>
					</Section>
				</div>
			</div>
		</>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section>
			<h2 className="text-base font-semibold text-text mb-2">{title}</h2>
			{children}
		</section>
	);
}
