import { createFileRoute, Link } from '@tanstack/react-router';
import { Seo } from '@/components/Seo.tsx';

export const Route = createFileRoute('/legal')({ component: LegalPage });

function LegalPage() {
	return (
		<>
			<Seo
				title="Legal Notice — Vixely"
				description="Legal information about Vixely, a free online media editor."
				path="/legal"
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

				<h1 className="text-3xl font-bold tracking-tight">Legal Notice</h1>
				<p className="mt-2 text-sm text-text-tertiary">
					In accordance with Article 6 of French Law No. 2004-575 (LCEN)
				</p>

				<div className="mt-10 flex flex-col gap-8 text-sm text-text-secondary leading-relaxed">
					<Section title="Publisher">
						<p>This website is published by an individual as a personal project.</p>
						<ul className="mt-2 space-y-1">
							<li>
								<strong className="text-text">Publication director:</strong>{' '}
								{/* TODO: Replace with your real name */}
								[Your Name]
							</li>
							<li>
								<strong className="text-text">Contact:</strong>{' '}
								{/* TODO: Replace with your real email */}
								contact@vixely.app
							</li>
						</ul>
					</Section>

					<Section title="Hosting provider">
						<ul className="space-y-1">
							<li>
								<strong className="text-text">Company:</strong> Railway Corporation
							</li>
							<li>
								<strong className="text-text">Address:</strong> 548 Market St, PMB 68915, San Francisco,
								CA 94104, USA
							</li>
							<li>
								<strong className="text-text">Website:</strong>{' '}
								<a
									href="https://railway.com"
									target="_blank"
									rel="noopener noreferrer"
									className="underline text-accent hover:text-accent/80 transition-colors"
								>
									railway.com
								</a>
							</li>
						</ul>
					</Section>

					<Section title="Domain registrar">
						<ul className="space-y-1">
							<li>
								<strong className="text-text">Company:</strong> Hostinger International Ltd.
							</li>
							<li>
								<strong className="text-text">Website:</strong>{' '}
								<a
									href="https://www.hostinger.com"
									target="_blank"
									rel="noopener noreferrer"
									className="underline text-accent hover:text-accent/80 transition-colors"
								>
									hostinger.com
								</a>
							</li>
						</ul>
					</Section>

					<Section title="Intellectual property">
						<p>
							The Vixely name, logo, and website design are the property of the publisher. All media files
							processed through Vixely remain the exclusive property of their respective owners. Vixely
							does not claim any rights over user content.
						</p>
					</Section>

					<Section title="Liability">
						<p>
							Vixely is provided "as is" without warranty of any kind. The publisher cannot be held liable
							for any direct or indirect damages resulting from the use of this website, including but not
							limited to data loss during file processing.
						</p>
					</Section>

					<Section title="Applicable law">
						<p>
							This legal notice is governed by French law. Any dispute relating to the use of Vixely shall
							be subject to the exclusive jurisdiction of the competent French courts.
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
