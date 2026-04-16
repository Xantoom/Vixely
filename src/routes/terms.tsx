import { createFileRoute, Link } from '@tanstack/react-router';
import { Seo } from '@/components/Seo.tsx';

export const Route = createFileRoute('/terms')({ component: TermsPage });

function TermsPage() {
	return (
		<>
			<Seo
				title="Terms of Use — Vixely"
				description="Terms and conditions for using Vixely, a free online media editor."
				path="/terms"
				noIndex
			/>

			<div className="max-w-2xl mx-auto px-8 py-16 animate-fade-in overflow-y-auto h-full">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-[14px] text-text-tertiary hover:text-text-secondary transition-colors mb-8"
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

				<h1 className="text-3xl font-bold tracking-tight">Terms of Use</h1>
				<p className="mt-2 text-sm text-text-tertiary">Last updated: March 2026</p>

				<div className="mt-10 flex flex-col gap-8 text-sm text-text-secondary leading-relaxed">
					<Section title="1. Purpose">
						<p>
							Vixely is a free, browser-based media editing tool that allows users to edit videos, images,
							and GIFs entirely on their device. These terms govern your use of the Vixely web application
							available at <strong className="text-text">vixely.app</strong>.
						</p>
					</Section>

					<Section title="2. Service description">
						<p>
							Vixely provides client-side media processing using native browser APIs (WebCodecs, WebGL2,
							Web Audio, Canvas) and the Mediabunny library. All file processing occurs locally in your
							web browser. No files are uploaded to any server. The service is provided free of charge.
						</p>
					</Section>

					<Section title="3. Acceptable use">
						<p>You agree to use Vixely only for lawful purposes. You must not:</p>
						<ul className="mt-2 list-disc pl-5 space-y-1">
							<li>Use the service for any illegal activity</li>
							<li>Attempt to exploit, hack, or reverse-engineer the application</li>
							<li>
								Use automated tools to access the service in a manner that could impair its performance
							</li>
							<li>Process content that violates any applicable law or third-party rights</li>
						</ul>
					</Section>

					<Section title="4. Intellectual property">
						<p>
							<strong className="text-text">Your content:</strong> You retain full ownership of all media
							files you process through Vixely. We do not claim any rights over your content.
						</p>
						<p className="mt-2">
							<strong className="text-text">Our content:</strong> The Vixely name, logo, design, and
							underlying code are the property of the publisher. You may not copy, modify, or distribute
							any part of Vixely without prior written consent.
						</p>
					</Section>

					<Section title="5. Disclaimer of warranties">
						<p>
							Vixely is provided <strong className="text-text">"as is"</strong> and{' '}
							<strong className="text-text">"as available"</strong> without any warranties, express or
							implied. We do not guarantee that the service will be uninterrupted, error-free, or that it
							will meet your specific requirements.
						</p>
					</Section>

					<Section title="6. Limitation of liability">
						<p>
							To the maximum extent permitted by law, the publisher shall not be liable for any direct,
							indirect, incidental, or consequential damages arising from your use of Vixely, including
							but not limited to data loss or corruption during file processing.
						</p>
						<p className="mt-2">
							Since all processing occurs locally in your browser, we strongly recommend keeping original
							copies of your files before editing.
						</p>
					</Section>

					<Section title="7. Modifications">
						<p>
							We reserve the right to modify these terms at any time. Changes take effect immediately upon
							publication on this page. Continued use of Vixely after changes constitutes acceptance of
							the updated terms.
						</p>
					</Section>

					<Section title="8. Applicable law">
						<p>
							These terms are governed by French law. Any disputes shall be subject to the exclusive
							jurisdiction of the competent French courts.
						</p>
					</Section>

					<Section title="9. Contact">
						<p>
							For questions about these terms, please contact us at{' '}
							<strong className="text-text">contact@vixely.app</strong>.
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
